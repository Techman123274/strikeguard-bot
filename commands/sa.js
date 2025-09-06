import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Log from '../models/Log.js';
import config from '../config.js';

function toHex(str) {
  return Buffer.from(str, 'utf8').toString('hex').substring(0, 2000);
}

export default {
  data: new SlashCommandBuilder()
    .setName('sa')
    .setDescription('Session Annihilate a user: send them a message, but obfuscate it in chat.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to target')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The real message to send to the user')
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const message = interaction.options.getString('message');

    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
      return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
    }

    const hexMessage = toHex(message);

    // 1. Send obfuscated message in chat
    await interaction.reply({
      content: `📡 <@${target.id}>: \`${hexMessage}\``,
      allowedMentions: { users: [target.id] }
    });

    // 2. Send real message in DM
    try {
      await target.send(`💀 **Council MESSAGE:**\n${message}`);
    } catch {
      await interaction.followUp({ content: '⚠️ Could not DM the user (they may have DMs off).', ephemeral: true });
    }

    // 3. Log to MongoDB
    await Log.create({
      type: 'session_annihilated',
      data: {
        userId: target.id,
        adminId: interaction.user.id,
        channelId: interaction.channel.id,
        original: message,
        hex: hexMessage
      },
      timestamp: new Date()
    });

    // 4. Log to logs channel
    const logEmbed = new EmbedBuilder()
      .setTitle('💀 Session Annihilated')
      .addFields(
        { name: 'User', value: `<@${target.id}> (${target.id})`, inline: true },
        { name: 'By Admin', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Channel', value: `<#${interaction.channel.id}>` },
        { name: 'Message (DM)', value: message },
        { name: 'Obfuscated (Chat)', value: hexMessage }
      )
      .setTimestamp();

    const logChannel = interaction.client.channels.cache.get(config.logChannelId);
    if (logChannel) {
      logChannel.send({ embeds: [logEmbed] });
    }
  }
};
