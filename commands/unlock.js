// commands/unlock.js
"use strict";

import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { setLockdown } from "../utils/lockdown.js";
import config from "../config.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("DEV ONLY: Unlock the bot (re-enable commands)"),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const dev = interaction.user.id === config.ownerId || member?.roles?.cache?.has(config.devRoleId);
    if (!dev) {
      return interaction.reply({ content: "🚫 Dev-only command.", flags: MessageFlags.Ephemeral });
    }

    await setLockdown(false, interaction.user);

    const emb = new EmbedBuilder()
      .setTitle("🔓 Global Lockdown Disabled")
      .setDescription("Commands/components re-enabled for everyone.")
      .addFields({ name: "By", value: `<@${interaction.user.id}>`, inline: true })
      .setColor(0x57F287)
      .setTimestamp();

    await interaction.reply({ embeds: [emb] });
  }
};
