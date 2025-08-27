// commands/whois.js
"use strict";

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionsBitField,
  time,
  GuildMemberFlags,
  ChannelType,
} from "discord.js";

const PAGES = ["overview", "roles", "security", "assets"];

function makeCustomId(action, userId) {
  // add a timestamp to avoid collisions if multiple whois are open
  const nonce = Date.now().toString(36);
  return `whois:${action}:${userId}:${nonce}`;
}

function statusEmoji(status) {
  return {
    online: "🟢",
    idle: "🟡",
    dnd: "🔴",
    offline: "⚫",
    invisible: "⚫",
  }[status ?? "offline"];
}

function deviceText(clientStatus) {
  if (!clientStatus) return "Unknown";
  const map = { web: "🌐 Web", desktop: "💻 Desktop", mobile: "📱 Mobile" };
  return Object.keys(clientStatus).map(k => map[k] || k).join(" • ");
}

function listBadges(user) {
  // user.flags is a UserFlagsBitField | null; fetch(force) to hydrate banners/flags
  const flags = user.flags?.toArray?.() || [];
  if (!flags.length) return "—";
  const emojiMap = {
    Staff: "👨‍💼", Partner: "🤝", Hypesquad: "🎉",
    BugHunterLevel1: "🐞", BugHunterLevel2: "🐛",
    HypeSquadOnlineHouse1: "🏠", HypeSquadOnlineHouse2: "🏡", HypeSquadOnlineHouse3: "🏘️",
    EarlySupporter: "🌟", TeamPseudoUser: "👥",
    VerifiedBot: "✅🤖", VerifiedDeveloper: "🛠️",
    CertifiedModerator: "🛡️", ActiveDeveloper: "⚙️",
  };
  return flags.map(f => `${emojiMap[f] ?? "🏷️"} ${f}`).join(" • ");
}

function fmtRoles(member) {
  if (!member) return "—";
  const roles = [...member.roles.cache.filter(r => r.id !== member.guild.id).values()]
    .sort((a, b) => b.position - a.position);
  if (!roles.length) return "—";
  const display = roles.slice(0, 15).map(r => r.toString()).join(" ");
  return roles.length > 15 ? `${display} … (+${roles.length - 15} more)` : display;
}

function fmtPerms(member) {
  if (!member) return "—";
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return "🛡️ Administrator";
  const important = [
    ["ManageGuild", "Manage Server"],
    ["ManageChannels", "Manage Channels"],
    ["ManageRoles", "Manage Roles"],
    ["ManageMessages", "Manage Messages"],
    ["KickMembers", "Kick Members"],
    ["BanMembers", "Ban Members"],
    ["MuteMembers", "Mute Members / Timeout"],
    ["MentionEveryone", "Mention @everyone / @here"],
  ];
  const perms = important
    .filter(([flag]) => member.permissions.has(PermissionsBitField.Flags[flag]))
    .map(([, label]) => `• ${label}`);
  return perms.length ? perms.join("\n") : "—";
}

function activityText(presence) {
  if (!presence?.activities?.length) return "—";
  return presence.activities.map(a => {
    const kind = { 0: "Playing", 2: "Listening", 3: "Watching", 5: "Competing" }[a.type] ?? "Activity";
    const name = a.name || "Unknown";
    const details = a.details ? ` — ${a.details}` : "";
    const state = a.state ? ` (${a.state})` : "";
    return `• ${kind}: **${name}**${details}${state}`;
  }).join("\n");
}

function makeControls(userId, current) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(makeCustomId("overview", userId)).setLabel("Overview").setStyle(current === "overview" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeCustomId("roles", userId)).setLabel("Roles").setStyle(current === "roles" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeCustomId("security", userId)).setLabel("Security").setStyle(current === "security" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeCustomId("assets", userId)).setLabel("Assets").setStyle(current === "assets" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(makeCustomId("select", userId))
      .setPlaceholder("Jump to…")
      .addOptions(
        { label: "Overview", value: "overview" },
        { label: "Roles", value: "roles" },
        { label: "Security", value: "security" },
        { label: "Assets", value: "assets" },
      )
  );
  return [buttons, select];
}

async function hydrateUser(client, userId) {
  // Force fetch to hydrate banner & flags
  const u = await client.users.fetch(userId, { force: true }).catch(() => null);
  return u;
}

function overviewEmbed({ user, member }) {
  const created = time(user.createdAt, "F");
  const joined = member?.joinedAt ? time(member.joinedAt, "F") : "—";
  const boost = member?.premiumSince ? `${time(member.premiumSince, "F")} (${time(member.premiumSince, "R")})` : "—";
  const status = member?.presence?.status ?? (user.bot ? "online" : "offline");
  const devices = deviceText(member?.presence?.clientStatus);
  const acts = activityText(member?.presence);

  return new EmbedBuilder()
    .setAuthor({ name: `${user.tag} ${user.bot ? "• 🤖" : ""}`, iconURL: user.displayAvatarURL() })
    .setTitle(`${statusEmoji(status)} Overview`)
    .addFields(
      { name: "ID", value: `\`${user.id}\``, inline: true },
      { name: "Status", value: status.toUpperCase(), inline: true },
      { name: "Devices", value: devices, inline: true },
      { name: "Created", value: created, inline: true },
      { name: "Joined", value: joined, inline: true },
      { name: "Boosting", value: boost, inline: true },
      { name: "Badges", value: listBadges(user) },
      { name: "Activities", value: acts },
      { name: "Top Roles", value: fmtRoles(member) },
    )
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .setColor(member?.displayColor || 0x5865f2)
    .setFooter({ text: "User Overview" })
    .setTimestamp();
}

function rolesEmbed({ member }) {
  const roles = member
    ? [...member.roles.cache.filter(r => r.id !== member.guild.id).values()].sort((a, b) => b.position - a.position)
    : [];
  const chunks = roles.length ? roles.map(r => r.toString()).join(" ") : "—";
  return new EmbedBuilder()
    .setTitle("📜 Roles")
    .setDescription(chunks)
    .setColor(member?.displayColor || 0x5865f2)
    .setFooter({ text: `Total roles: ${roles.length}` })
    .setTimestamp();
}

function securityEmbed({ member, guild }) {
  const perms = fmtPerms(member);
  const timedOut = member?.communicationDisabledUntil
    ? `${time(member.communicationDisabledUntil, "F")} (${time(member.communicationDisabledUntil, "R")})`
    : "No";
  const pending = member?.flags?.has?.(GuildMemberFlags.DidRejoin) ? "Rejoined Recently" : "—";
  const safety = [
    `• Timeout: **${timedOut}**`,
    `• Permissions:\n${perms}`,
    `• Flags: ${pending}`,
  ].join("\n");

  return new EmbedBuilder()
    .setTitle("🛡️ Security")
    .addFields(
      { name: "Nickname", value: member?.nickname ? `\`${member.nickname}\`` : "—", inline: true },
      { name: "Highest Role", value: member?.roles?.highest ? member.roles.highest.toString() : "—", inline: true },
      { name: "Manageable by Bot", value: member?.manageable ? "Yes" : "No", inline: true },
      { name: "Moderation", value: safety }
    )
    .setColor(member?.displayColor || 0xED4245)
    .setFooter({ text: guild?.name ?? "Server" })
    .setTimestamp();
}

function assetsEmbed({ user }) {
  const avatar = user.displayAvatarURL({ size: 1024, extension: "png", forceStatic: false });
  const banner = user.bannerURL?.({ size: 2048, extension: "png", forceStatic: false }) || null;

  const emb = new EmbedBuilder()
    .setTitle("🖼️ Assets")
    .setDescription([
      `**Avatar:** [Open](${avatar})`,
      `**Banner:** ${banner ? `[Open](${banner})` : "—"}`,
    ].join("\n"))
    .setThumbnail(avatar)
    .setColor(0x57F287)
    .setTimestamp();

  if (banner) emb.setImage(banner);
  return emb;
}

async function buildPage(client, guild, userId, page) {
  const user = await hydrateUser(client, userId);
  if (!user) return { embed: new EmbedBuilder().setTitle("❌ User not found").setColor(0xED4245) };
  const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;

  switch (page) {
    case "overview": return { embed: overviewEmbed({ user, member }) };
    case "roles": return { embed: rolesEmbed({ member }) };
    case "security": return { embed: securityEmbed({ member, guild }) };
    case "assets": return { embed: assetsEmbed({ user }) };
    default: return { embed: overviewEmbed({ user, member }) };
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("whois")
    .setDescription("Advanced profile: presence, roles, badges, security, assets")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target user (mention or pick)")
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName("id")
        .setDescription("Target by ID (if not in server)")
        .setRequired(false)
    ),

  // /whois
  async execute(interaction) {
    await interaction.deferReply(); // allow time to fetch banners/flags

    const optUser = interaction.options.getUser("user");
    const optId = interaction.options.getString("id");
    const targetId =
      optUser?.id ||
      optId ||
      interaction.options.get("user")?.value ||
      interaction.user.id;

    const initialPage = "overview";
    const { embed } = await buildPage(interaction.client, interaction.guild, targetId, initialPage);
    const components = makeControls(targetId, initialPage);

    await interaction.editReply({ embeds: [embed], components });
  },

  // Buttons: whois:overview:<id>:nonce, etc.
  async handleButton(interaction) {
    const [_, action, userId] = (interaction.customId || "").split(":");
    if (!PAGES.includes(action)) return;
    const { embed } = await buildPage(interaction.client, interaction.guild, userId, action);
    const components = makeControls(userId, action);
    await interaction.update({ embeds: [embed], components });
  },

  // Select menu: whois:select:<id>:nonce
  async handleSelect(interaction) {
    const [_, action, userId] = (interaction.customId || "").split(":");
    if (action !== "select") return;
    const selected = interaction.values?.[0] || "overview";
    const page = PAGES.includes(selected) ? selected : "overview";
    const { embed } = await buildPage(interaction.client, interaction.guild, userId, page);
    const components = makeControls(userId, page);
    await interaction.update({ embeds: [embed], components });
  },
};
