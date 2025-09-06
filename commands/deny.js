import { SlashCommandBuilder } from 'discord.js';
import Strike from '../models/Strike.js';
import Log from '../models/Log.js';
import config from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('deny')
    .setDescription('Deny a pending strike')
    .addStringOption(opt => opt.setName('id').setDescription('Strike ID').setRequired(true)),

  async execute(interaction) {
    if (interaction.user.id !== config.ownerId)
      return interaction.reply({ content: '🚫 Only the bot owner can use this command.', ephemeral: true });

    const id = interaction.options.getString('id');
    const strike = await Strike.findByIdAndDelete(id);
    if (!strike) return interaction.reply({ content: '❌ Strike not found.', ephemeral: true });

    await Log.create({ type: 'strike_denied', data: { strike } });
    await interaction.reply(`❌ Strike ${id} has been denied and removed.`);
  }
};
