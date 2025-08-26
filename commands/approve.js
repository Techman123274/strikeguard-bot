import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Strike from '../models/Strike.js';
import Log from '../models/Log.js';
import config from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('approve')
    .setDescription('Approve a pending strike')
    .addStringOption(opt => opt.setName('id').setDescription('Strike ID').setRequired(true)),

  async execute(interaction) {
    if (interaction.user.id !== config.ownerId)
      return interaction.reply({ content: '🚫 Only the bot owner can use this command.', ephemeral: true });

    const id = interaction.options.getString('id');
    const strike = await Strike.findById(id);
    if (!strike) return interaction.reply({ content: '❌ Strike not found.', ephemeral: true });

    strike.approved = true;
    await strike.save();
    await Log.create({ type: 'strike_approved', data: { strike } });

    await interaction.reply(`✅ Strike ${id} approved.`);

    const userStrikes = await Strike.find({ userId: strike.userId, approved: true });
    if (userStrikes.length >= 3) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 Discipline Triggered')
        .setDescription(`<@${strike.userId}> has received 3 strikes.`)
        .addFields(userStrikes.map((s, i) => ({
          name: `Strike ${i + 1}`, value: `Reason: ${s.reason}\nDate: <t:${Math.floor(s.timestamp.getTime() / 1000)}:f>`
        })))
        .setTimestamp();

      interaction.client.channels.cache.get(config.disciplineChannelId)?.send({ embeds: [embed] });
    }
  }
};
