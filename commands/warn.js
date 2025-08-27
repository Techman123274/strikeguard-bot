// commands/warn.js (discord.js v14, ESM)
"use strict";

import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
} from "discord.js";
import Log from "../models/Log.js";
import Strike from "../models/Strike.js";
import config from "../config.js";

/**
 * config extras this uses (add if helpful):
 * - config.ownerId
 * - config.adminRoleId                 // role allowed to warn
 * - config.staffRoleId                 // (optional) role to ping in logs
 * - config.logChannelId                // channel to send moderation logs
 */

export default {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user and log the reason.")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("The user to warn")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "🚫 This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Fresh member fetch (avoid stale role cache)
    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);

    const isOwner = interaction.user.id === config.ownerId;
    const hasAdminRole = member?.roles?.cache?.has(config.adminRoleId);
    if (!isOwner && !hasAdminRole) {
      return interaction.reply({
        content: "🚫 You don’t have permission to use this.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser("user", true);
    if (targetUser.bot) {
      return interaction.reply({
        content: "🤖 You can’t warn a bot.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Optional: basic hierarchy check if both are members of the guild
    const [targetMember, approverMember] = await Promise.all([
      interaction.guild.members.fetch(targetUser.id).catch(() => null),
      interaction.guild.members.fetch(interaction.user.id).catch(() => null),
    ]);
    if (targetMember && approverMember) {
      if (
        targetMember.roles.highest?.position >= approverMember.roles.highest?.position &&
        interaction.user.id !== config.ownerId
      ) {
        return interaction.reply({
          content: "⚠️ You can’t warn a member with an equal or higher role.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // Build and show the modal
    const modal = new ModalBuilder()
      .setCustomId(`warn_reason_modal:${targetUser.id}`)
      .setTitle(`Warn ${targetUser.tag}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason for warning")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    const actionRow = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  },

  // Call this from your interactionCreate listener when a modal is submitted
  async handleModalSubmit(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "🚫 This can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Expect customId like: warn_reason_modal:<userId>
    if (!interaction.customId?.startsWith("warn_reason_modal:")) return;

    // Permission gate again (in case someone forged a modal)
    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    const isOwner = interaction.user.id === config.ownerId;
    const hasAdminRole = member?.roles?.cache?.has(config.adminRoleId);
    if (!isOwner && !hasAdminRole) {
      return interaction.reply({
        content: "🚫 You don’t have permission to do that.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetId = interaction.customId.split(":")[1];
    const reason = interaction.fields.getTextInputValue("reason")?.trim();
    if (!reason) {
      return interaction.reply({
        content: "⚠️ A reason is required.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!target) {
      return interaction.reply({
        content: "❌ Couldn’t resolve that user.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Persist log entry
    const warnData = {
      moderator: { tag: interaction.user.tag, id: interaction.user.id },
      user: { tag: target.tag, id: target.id },
      reason,
      timestamp: new Date(),
      guildId: interaction.guild.id,
      channelId: interaction.channel?.id || null,
    };

    await Log.create({ type: "warn", data: warnData, createdAt: new Date() });

    // Also create an approved Strike (optional by your policy)
    await Strike.create({
      userId: target.id,
      reason,
      approved: true,
      timestamp: new Date(),
      guildId: interaction.guild.id,
    });

    // Count approved strikes after creation
    const approvedStrikes = await Strike.countDocuments({
      userId: target.id,
      approved: true,
      guildId: interaction.guild.id,
    });

    // DM user (embed)
    let dmFailed = false;
    const dmEmbed = new EmbedBuilder()
      .setTitle("⚠️ You’ve been warned")
      .setDescription(
        `You received a warning in **${interaction.guild.name}**.\n\n` +
        `**Reason:** ${reason}`
      )
      .addFields({ name: "Total Approved Strikes", value: String(approvedStrikes), inline: true })
      .setColor(0xF59E0B)
      .setFooter({ text: "Sublevel Society • Moderation Notice" })
      .setTimestamp();

    await target.send({ embeds: [dmEmbed] }).catch(() => { dmFailed = true; });

    // Build staff log embed
    const staffEmbed = new EmbedBuilder()
      .setTitle("⚠️ User Warned")
      .addFields(
        { name: "User", value: `<@${target.id}> (${target.id})`, inline: true },
        { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Reason", value: reason },
        { name: "Channel", value: interaction.channel ? `<#${interaction.channel.id}>` : "N/A" },
        { name: "Total Approved Strikes", value: String(approvedStrikes), inline: true },
      )
      .setColor(0xF59E0B)
      .setFooter({ text: "Sublevel Society • Moderation Logs" })
      .setTimestamp();

    if (dmFailed) {
      staffEmbed.addFields({ name: "DM Status", value: "❌ Could not DM user (DMs off)." });
    }

    // Post to logs channel safely
    const logsChannel = await interaction.client.channels
      .fetch(config.logChannelId)
      .catch(() => null);

    if (logsChannel?.isTextBased?.()) {
      const perms = logsChannel.permissionsFor(interaction.client.user.id);
      if (
        perms?.has(PermissionsBitField.Flags.ViewChannel) &&
        perms?.has(PermissionsBitField.Flags.SendMessages)
      ) {
        const content = config.staffRoleId ? `<@&${config.staffRoleId}>` : null;
        const msg = await logsChannel.send({ content, embeds: [staffEmbed] }).catch(() => null);

        // Start a short-lived discussion thread (best-effort)
        if (msg && "startThread" in msg && typeof msg.startThread === "function") {
          msg.startThread({
            name: `Warn • ${target.username}`,
            autoArchiveDuration: 1440, // 24h
            reason: "Staff discussion for warning",
          }).catch(() => null);
        }
      }
    }

    // Acknowledge to moderator
    await interaction.reply({
      content: `✅ <@${target.id}> has been warned. (Approved strikes: **${approvedStrikes}**)`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
