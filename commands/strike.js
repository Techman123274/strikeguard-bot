import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Strike from '../models/Strike.js';
import Log from '../models/Log.js';
import config from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('strike')
    .setDescription('Issue a strike to a user (requires owner approval).')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to strike')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the strike')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
      return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const strike = await Strike.create({
      userId: user.id,
      reason,
      timestamp: new Date(),
      approved: false
    });

    // Full log entry in MongoDB
    await Log.create({
      type: 'strike_issued',
      data: {
        strikeId: strike._id.toString(),
        userId: user.id,
        userTag: user.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        approved: false,
        channelId: interaction.channel.id,
        timestamp: new Date()
      }
    });

    // Send log embed
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Strike Issued (Pending Approval)')
      .setColor('Orange')
      .addFields(
        { name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Strike ID', value: strike._id.toString() },
        { name: 'Approved', value: '❌ No (requires owner)' }
      )
      .setTimestamp();

    interaction.client.channels.cache.get(config.logChannelId)?.send({ embeds: [embed] });

    await interaction.reply({ content: `✅ Strike issued to ${user.tag}. Awaiting approval.`, ephemeral: true });
  }
};
