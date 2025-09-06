// commands/status.js
"use strict";

import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getLockdown } from "../utils/lockdown.js";

export default {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show bot status (lockdown)"),
  async execute(interaction) {
    const locked = await getLockdown();
    await interaction.reply({
      content: locked ? "🔒 Bot is in **lockdown**." : "🔓 Bot is **unlocked**.",
      flags: MessageFlags.Ephemeral
    });
  }
};
