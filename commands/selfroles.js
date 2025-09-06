// commands/selfroles.js
"use strict";

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits as Perms
} from "discord.js";
import SelfRolePanel from "../models/SelfRolePanel.js";

/**
 * Sublevel Society – Self Roles Panel (polished)
 * - Rich, readable embed with clear guidance
 * - Safer admin UX (role hierarchy checks, canPost checks)
 * - Same routes & DB model; drop-in replacement
 */

// ----- Styling defaults (customize freely) -----
const DEFAULTS = {
  title: "『 𖤐 Sublevel Society — Self Roles 』",
  color: "#0B1221", // deep slate
  footer: "Pick your vibes. Change anytime.",
  bannerUrl: "https://i.imgur.com/2Vm6qw3.png", // optional: server banner/top image
  thumbUrl: "https://i.imgur.com/0t6a0wF.png",  // optional: small logo/mark
  description: [
    "Use the menu below to **opt-in** to roles for access, pings, and community tags.",
    "",
    "### How this works",
    "• Select one or more roles from the menu.",
    "• Select the same role again to **remove** it (toggle).",
    "• Changes are instant and reversible—experiment freely.",
    "",
    "### Important notes",
    "• Some roles unlock **hidden channels** and content.",
    "• Toggle ping roles to control your notifications.",
    "• If you can’t see a role here, an admin controls it.",
    "",
    "### Need help?",
    "If you’re stuck, open a ticket and staff will assist.",
  ].join("\n")
};

// ----- helpers -----
function makeEmbed(panel) {
  const embed = new EmbedBuilder()
    .setTitle(panel.title || DEFAULTS.title)
    .setDescription(panel.description || DEFAULTS.description)
    .setColor(panel.color || DEFAULTS.color)
    .setFooter({ text: panel.footer || DEFAULTS.footer })
    .setTimestamp();

  if (panel.bannerUrl ?? DEFAULTS.bannerUrl) {
    embed.setImage(panel.bannerUrl || DEFAULTS.bannerUrl);
  }
  if (panel.thumbUrl ?? DEFAULTS.thumbUrl) {
    embed.setThumbnail(panel.thumbUrl || DEFAULTS.thumbUrl);
  }
  return embed;
}

function makeMenu(panel) {
  const options = panel.roles.slice(0, 25).map(r => ({
    label: r.label,
    value: r.roleId,
    emoji: r.emoji || undefined,
    description: `Toggle ${r.label}`
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`selfroles:${panel.guildId}:${panel.version}`)
      .setPlaceholder("Pick your roles — toggle anytime")
      .setMinValues(options.length ? 1 : 0)
      .setMaxValues(Math.min(Math.max(options.length, 1), 25))
      .addOptions(
        options.length
          ? options
          : [{
              label: "No roles configured yet",
              value: "none",
              description: "Ask an admin to add roles",
              default: true
            }]
      )
  );
}

function makeAdminRow(panel) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`selfroles:refresh:${panel.guildId}:${panel.version}`)
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`selfroles:delete:${panel.guildId}:${panel.version}`)
      .setLabel("Delete Panel")
      .setStyle(ButtonStyle.Danger)
  );
}

async function pickUsableChannel(guild, wantedId) {
  if (wantedId) {
    const ch = await guild.channels.fetch(wantedId).catch(() => null);
    if (await canPost(guild, ch)) return ch;
  }
  if (guild.systemChannelId) {
    const ch = await guild.channels.fetch(guild.systemChannelId).catch(() => null);
    if (await canPost(guild, ch)) return ch;
  }
  const all = await guild.channels.fetch();
  for (const [, ch] of all) {
    if (await canPost(guild, ch)) return ch;
  }
  return null;
}

async function canPost(guild, channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  const me = guild.members.me || await guild.members.fetchMe();
  const perms = channel.permissionsFor(me);
  return perms?.has([Perms.ViewChannel, Perms.SendMessages, Perms.EmbedLinks]) ?? false;
}

async function canManageRole(guild, role) {
  const me = guild.members.me || await guild.members.fetchMe();
  const meRole = me.roles.highest;
  // Bot needs Manage Roles and to be higher than target role
  return guild.members.me.permissions.has(Perms.ManageRoles) && meRole.comparePositionTo(role) > 0;
}

async function publishOrEdit(panel, guild, channelOverride = null) {
  const channel = channelOverride || await pickUsableChannel(guild, panel.channelId);
  if (!channel) return { ok: false, reason: "No channel with View/Send/Embed permissions." };

  const embed = makeEmbed(panel);
  const menu = makeMenu(panel);
  const admin = makeAdminRow(panel);

  if (panel.messageId) {
    try {
      const msg = await channel.messages.fetch(panel.messageId);
      await msg.edit({ embeds: [embed], components: [menu, admin] });
      return { ok: true, channel };
    } catch {
      // fall-through to send
    }
  }
  try {
    const msg = await channel.send({ embeds: [embed], components: [menu, admin] });
    panel.messageId = msg.id;
    panel.channelId = channel.id;
    await panel.save();
    return { ok: true, channel };
  } catch (e) {
    return { ok: false, reason: `Failed to send in ${channel}. Check permissions.` };
  }
}

// ----- Slash builder -----
const data = new SlashCommandBuilder()
  .setName("selfroles")
  .setDescription("Admin controls for Sublevel Society self roles (polished).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub =>
    sub.setName("add")
      .setDescription("Add a selectable role to the panel.")
      .addRoleOption(o => o.setName("role").setDescription("Role users can pick").setRequired(true))
      .addStringOption(o => o.setName("label").setDescription("Label (defaults to role name)"))
      .addStringOption(o => o.setName("emoji").setDescription("Emoji like 😀 or <:name:id>"))
  )
  .addSubcommand(sub =>
    sub.setName("remove")
      .setDescription("Remove a role from the panel.")
      .addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName("edit")
      .setDescription("Edit the panel text, color, images.")
      .addStringOption(o => o.setName("title").setDescription("New title"))
      .addStringOption(o => o.setName("description").setDescription("New description (supports newlines & markdown)"))
      .addStringOption(o => o.setName("color").setDescription("New color (hex, e.g. #0B1221)"))
      .addStringOption(o => o.setName("footer").setDescription("New footer"))
      .addStringOption(o => o.setName("banner_url").setDescription("Top image URL"))
      .addStringOption(o => o.setName("thumb_url").setDescription("Thumbnail image URL"))
  )
  .addSubcommand(sub =>
    sub.setName("publish").setDescription("Create or refresh the panel message.")
  )
  .addSubcommand(sub =>
    sub.setName("move")
      .setDescription("Move the panel to a different channel.")
      .addChannelOption(o =>
        o.setName("channel")
          .setDescription("New channel for the panel")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName("list").setDescription("List roles currently on the panel.")
  )
  .addSubcommand(sub =>
    sub.setName("reset").setDescription("Reset panel styling to Sublevel Society defaults.")
  )
  .addSubcommand(sub =>
    sub.setName("status").setDescription("Show current panel state and force a publish.")
  );

// ----- Ensure panel -----
async function ensurePanel(guild, channelIdHint) {
  let panel = await SelfRolePanel.findOne({ guildId: guild.id });
  if (!panel) {
    panel = await SelfRolePanel.create({
      guildId: guild.id,
      channelId: channelIdHint || guild.systemChannelId || null,
      title: DEFAULTS.title,
      description: DEFAULTS.description,
      color: DEFAULTS.color,
      footer: DEFAULTS.footer,
      bannerUrl: DEFAULTS.bannerUrl,
      thumbUrl: DEFAULTS.thumbUrl,
      roles: [],
      version: 1
    });
  } else if (!panel.channelId) {
    panel.channelId = channelIdHint || guild.systemChannelId || null;
    await panel.save();
  }
  return panel;
}

// ----- Command executor -----
async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return interaction.reply({ content: "Use this in a server.", ephemeral: true });
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: "You need **Manage Server**.", ephemeral: true });
  }

  let panel = await ensurePanel(guild, interaction.channelId);

  if (sub === "add") {
    const role = interaction.options.getRole("role", true);
    const label = interaction.options.getString("label") ?? role.name;
    const emoji = interaction.options.getString("emoji") ?? null;

    if (panel.roles.some(r => r.roleId === role.id)) {
      return interaction.reply({ content: "That role is already on the panel.", ephemeral: true });
    }
    if (!(await canManageRole(guild, role))) {
      return interaction.reply({
        content: `I can’t manage **${role.name}**. Move my highest role **above** it and ensure I have **Manage Roles**.`,
        ephemeral: true
      });
    }

    panel.roles.push({ roleId: role.id, label, emoji });
    panel.version += 1;
    await panel.save();

    const res = await publishOrEdit(panel, guild);
    return interaction.reply({
      content: res.ok
        ? `➕ Added **${label}** (<@&${role.id}>) and refreshed in ${res.channel}.`
        : `Added, but couldn’t publish: ${res.reason}`,
      ephemeral: true
    });
  }

  if (sub === "remove") {
    const role = interaction.options.getRole("role", true);
    const before = panel.roles.length;
    panel.roles = panel.roles.filter(r => r.roleId !== role.id);

    if (panel.roles.length === before) {
      return interaction.reply({ content: "That role wasn’t on the panel.", ephemeral: true });
    }
    panel.version += 1;
    await panel.save();

    const res = await publishOrEdit(panel, guild);
    return interaction.reply({
      content: res.ok
        ? `➖ Removed <@&${role.id}> and refreshed in ${res.channel}.`
        : `Removed, but couldn’t publish: ${res.reason}`,
      ephemeral: true
    });
  }

  if (sub === "edit") {
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const color = interaction.options.getString("color");
    const footer = interaction.options.getString("footer");
    const bannerUrl = interaction.options.getString("banner_url");
    const thumbUrl = interaction.options.getString("thumb_url");

    if (title) panel.title = title;
    if (description) panel.description = description;
    if (color) panel.color = color;
    if (footer) panel.footer = footer;
    if (bannerUrl !== null && bannerUrl !== undefined) panel.bannerUrl = bannerUrl;
    if (thumbUrl !== null && thumbUrl !== undefined) panel.thumbUrl = thumbUrl;

    panel.version += 1;
    await panel.save();

    const res = await publishOrEdit(panel, guild);
    return interaction.reply({
      content: res.ok ? "✏️ Panel updated & refreshed." : `Updated, but couldn’t publish: ${res.reason}`,
      ephemeral: true
    });
  }

  if (sub === "publish") {
    const res = await publishOrEdit(panel, guild);
    return interaction.reply({
      content: res.ok ? `📣 Panel published/refreshed in ${res.channel}.` : `Couldn’t publish: ${res.reason}`,
      ephemeral: true
    });
  }

  if (sub === "move") {
    const newChannel = interaction.options.getChannel("channel", true);
    panel.channelId = newChannel.id;
    panel.version += 1;
    await panel.save();

    const res = await publishOrEdit(panel, guild, newChannel);
    return interaction.reply({
      content: res.ok ? `🚚 Panel moved to ${newChannel}.` : `Tried to move, but: ${res.reason}`,
      ephemeral: true
    });
  }

  if (sub === "list") {
    if (!panel.roles.length) {
      return interaction.reply({ content: "No roles configured yet. Use `/selfroles add`.", ephemeral: true });
    }
    const lines = panel.roles.map(r => `• <@&${r.roleId}> — **${r.label}** ${r.emoji ?? ""}`);
    return interaction.reply({ content: lines.join("\n"), ephemeral: true });
  }

  if (sub === "reset") {
    panel.title = DEFAULTS.title;
    panel.description = DEFAULTS.description;
    panel.color = DEFAULTS.color;
    panel.footer = DEFAULTS.footer;
    panel.bannerUrl = DEFAULTS.bannerUrl;
    panel.thumbUrl = DEFAULTS.thumbUrl;
    panel.version += 1;
    await panel.save();

    const res = await publishOrEdit(panel, guild);
    return interaction.reply({
      content: res.ok ? "🔁 Panel styling reset & refreshed." : `Reset, but couldn’t publish: ${res.reason}`,
      ephemeral: true
    });
  }

  if (sub === "status") {
    const res = await publishOrEdit(panel, guild);
    const lines = [
      `**Guild:** ${guild.name} (${guild.id})`,
      `**Channel ID (saved):** ${panel.channelId || "_none_"}`,
      `**Message ID (saved):** ${panel.messageId || "_none_"}`,
      `**Roles configured:** ${panel.roles.length}`,
      `**Publish attempt:** ${res.ok ? `ok → ${res.channel}` : `failed → ${res.reason}`}`
    ];
    return interaction.reply({ content: lines.join("\n"), ephemeral: true });
  }
}

export default { data, execute };
