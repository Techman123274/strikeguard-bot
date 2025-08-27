// commands/devupdate.js
"use strict";

import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
} from "discord.js";
import config from "../config.js";
import DevUpdate from "../models/DevUpdate.js";

export default {
  data: new SlashCommandBuilder()
    .setName("devupdate")
    .setDescription("Post a developer update for staff.")
    .addStringOption(opt =>
      opt.setName("update")
        .setDescription("Describe the update or fix")
        .setRequired(true)
    ),

  async execute(interaction) {
    // Must be used in a guild
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "🚫 This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Resolve invoking member to check roles reliably
    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);

    const isOwner = interaction.user.id === config.ownerId;
    const hasDevRole = member?.roles?.cache?.has(config.devRoleId);

    if (!isOwner && !hasDevRole) {
      return interaction.reply({
        content: "🚫 Only developers or the bot owner can use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const updateText = interaction.options.getString("update", true);

    // Build a branded embed
    const embed = new EmbedBuilder()
      .setTitle("🛠️ Sublevel Society • Developer Update")
      .setDescription(updateText)
      .setColor(0x5865f2) // Discord blurple hex
      .addFields(
        { name: "👤 Posted by", value: `<@${interaction.user.id}>`, inline: true },
        { name: "🕒 Timestamp", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setFooter({ text: "StrikeGuard System • Developer Reports" })
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));

    // Fetch the channel from API (not just cache) and ensure it's text-based
    const channel = await interaction.client.channels
      .fetch(config.devUpdatesChannelId)
      .catch(() => null);

    if (!channel || !channel.isTextBased?.()) {
      return interaction.reply({
        content: "⚠️ Dev updates channel is invalid or not text-based. Check `devUpdatesChannelId`.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check bot permissions
    const perms = channel.permissionsFor(interaction.client.user.id);
    if (
      !perms?.has(PermissionsBitField.Flags.ViewChannel) ||
      !perms?.has(PermissionsBitField.Flags.SendMessages) ||
      !perms?.has(PermissionsBitField.Flags.EmbedLinks)
    ) {
      return interaction.reply({
        content: "⚠️ I don’t have permission to send embeds in the dev updates channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Post the embed to the dev updates channel
    const msg = await channel.send({ embeds: [embed] });

    // Optionally start a thread for staff discussion
    if ("startThread" in msg && typeof msg.startThread === "function") {
      msg.startThread({
        name: `Discussion • Update by ${interaction.user.username}`,
        autoArchiveDuration: 1440, // 24h
        reason: "Dev update staff discussion",
      }).catch(() => null);
    }

    // Save to DB
    await DevUpdate.create({
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      content: updateText,
      createdAt: new Date(),
    });

    // Confirm to the user
    await interaction.reply({
      content: "✅ Developer update posted successfully.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
