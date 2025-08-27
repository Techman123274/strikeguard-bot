// events/interactionCreate.selfroles.js
"use strict";

import {
  Events,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import SelfRolePanel from "../models/SelfRolePanel.js";

export default (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // Select menu
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("selfroles:")) {
        const [, guildId, versionStr] = interaction.customId.split(":");
        const panel = await SelfRolePanel.findOne({ guildId });
        if (!panel) return interaction.reply({ content: "Panel not found.", ephemeral: true });
        if (String(panel.version) !== String(versionStr)) {
          return interaction.reply({ content: "This menu is outdated. Please use the newest panel.", ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const chosen = new Set(interaction.values);
        const allowedRoleIds = new Set(panel.roles.map(r => r.roleId));

        const toAdd = [];
        const toRemove = [];
        for (const roleId of allowedRoleIds) {
          const has = member.roles.cache.has(roleId);
          const shouldHave = chosen.has(roleId);
          if (shouldHave && !has) toAdd.push(roleId);
          if (!shouldHave && has) toRemove.push(roleId);
        }

        const results = [];
        for (const r of toAdd) {
          await member.roles.add(r).then(() => results.push(`✅ Added <@&${r}>`)).catch(() => results.push(`⚠️ Couldn't add <@&${r}>`));
        }
        for (const r of toRemove) {
          await member.roles.remove(r).then(() => results.push(`🗑️ Removed <@&${r}>`)).catch(() => results.push(`⚠️ Couldn't remove <@&${r}>`));
        }

        if (!results.length) results.push("No changes.");
        return interaction.reply({ content: results.join("\n"), ephemeral: true });
      }

      // Admin buttons
      if (interaction.isButton() && interaction.customId.startsWith("selfroles:")) {
        const [, action, guildId, versionStr] = interaction.customId.split(":");
        const panel = await SelfRolePanel.findOne({ guildId });
        if (!panel) return interaction.reply({ content: "Panel not found.", ephemeral: true });

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "Admins only.", ephemeral: true });
        }
        if (String(panel.version) !== String(versionStr)) {
          return interaction.reply({ content: "This control is outdated. Use `/selfroles publish`.", ephemeral: true });
        }

        const channel = await interaction.guild.channels.fetch(panel.channelId).catch(() => null);
        if (!channel) return interaction.reply({ content: "Configured channel missing. Use `/selfroles setup`.", ephemeral: true });

        if (action === "refresh") {
          const embed = new EmbedBuilder()
            .setTitle(panel.title)
            .setDescription(panel.description)
            .setColor(panel.color)
            .setFooter({ text: panel.footer });

          const options = panel.roles.length
            ? panel.roles.map(r => ({
                label: r.label,
                value: r.roleId,
                emoji: r.emoji || undefined,
                description: `Toggle ${r.label}`
              }))
            : [{ label: "No roles configured yet", value: "none", description: "Ask an admin to add roles", default: true }];

          const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`selfroles:${panel.guildId}:${panel.version}`)
              .setPlaceholder("Select your roles…")
              .setMinValues(0)
              .setMaxValues(Math.max(panel.roles.length, 1))
              .addOptions(options)
          );

          const adminRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`selfroles:refresh:${panel.guildId}:${panel.version}`).setLabel("Refresh").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`selfroles:delete:${panel.guildId}:${panel.version}`).setLabel("Delete Panel").setStyle(ButtonStyle.Danger)
          );

          let ok = false;
          if (panel.messageId) {
            try {
              const msg = await channel.messages.fetch(panel.messageId);
              await msg.edit({ embeds: [embed], components: [menuRow, adminRow] });
              ok = true;
            } catch {}
          }
          if (!ok) {
            const msg = await channel.send({ embeds: [embed], components: [menuRow, adminRow] });
            panel.messageId = msg.id;
            await panel.save();
          }
          return interaction.reply({ content: "🔄 Panel refreshed.", ephemeral: true });
        }

        if (action === "delete") {
          if (panel.messageId) {
            try {
              const msg = await channel.messages.fetch(panel.messageId);
              await msg.delete();
            } catch {}
          }
          panel.messageId = null;
          await panel.save();
          return interaction.reply({ content: "🗑️ Panel message deleted. Config kept. Use `/selfroles publish` to repost.", ephemeral: true });
        }
      }
    } catch (err) {
      console.error("SelfRoles interaction error:", err);
      if (interaction.isRepliable()) {
        try { await interaction.reply({ content: "Something went wrong handling that.", ephemeral: true }); } catch {}
      }
    }
  });
};
