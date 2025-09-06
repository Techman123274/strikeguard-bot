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
    // Check if user has the mod/admin role
    const hasPermission =
      interaction.member.roles.cache.has(config.adminRoleId) ||
      interaction.user.id === config.ownerId;

    if (!hasPermission) {
      return interaction.reply({
        content: '🚫 Only moderators can use this command.',
        ephemeral: true
      });
    }

    const id = interaction.options.getString('id');
    const strike = await Strike.findById(id);

    if (!strike) {
      return interaction.reply({ content: '❌ Strike not found.', ephemeral: true });
    }

    if (strike.approved) {
      return interaction.reply({ content: '⚠️ This strike has already been approved.', ephemeral: true });
    }

    // Approve the strike
    strike.approved = true;
    await strike.save();

    // Log to database
    await Log.create({
      type: 'strike_approved',
      data: {
        strike,
        approvedBy: {
          id: interaction.user.id,
          tag: interaction.user.tag
        },
        approvedAt: new Date()
      }
    });

    await interaction.reply(`✅ Strike \`${id}\` approved by <@${interaction.user.id}>.`);

    // Check if 3+ strikes now
    const userStrikes = await Strike.find({ userId: strike.userId, approved: true });
    if (userStrikes.length >= 3) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 Discipline Triggered')
        .setDescription(`<@${strike.userId}> has received 3 approved strikes.`)
        .addFields(userStrikes.map((s, i) => ({
          name: `Strike ${i + 1}`,
          value: `**Reason:** ${s.reason}\n**Date:** <t:${Math.floor(s.timestamp.getTime() / 1000)}:f>`
        })))
        .setColor('Red')
        .setFooter({ text: 'StrikeGuard Auto Discipline' })
        .setTimestamp();

      const disciplineChannel = interaction.client.channels.cache.get(config.disciplineChannelId);
      if (disciplineChannel) {
        disciplineChannel.send({ embeds: [embed] });
      }
    }
  }
};