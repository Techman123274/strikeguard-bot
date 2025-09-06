// commands/lockdown.js
"use strict";

import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { setLockdown } from "../utils/lockdown.js";
import config from "../config.js";

export default {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("DEV ONLY: Lock the bot (disable all commands for non-devs)")
    .addStringOption(o =>
      o.setName("reason").setDescription("Why locking").setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const dev = interaction.user.id === config.ownerId || member?.roles?.cache?.has(config.devRoleId);
    if (!dev) {
      return interaction.reply({ content: "🚫 Dev-only command.", flags: MessageFlags.Ephemeral });
    }

    const reason = interaction.options.getString("reason") || "No reason provided";
    await setLockdown(true, interaction.user);

    const emb = new EmbedBuilder()
      .setTitle("🔒 Global Lockdown Enabled")
      .setDescription("All commands/components are now disabled for non-devs.")
      .addFields(
        { name: "By", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setColor(0xED4245)
      .setTimestamp();

    await interaction.reply({ embeds: [emb] });
  }
};
