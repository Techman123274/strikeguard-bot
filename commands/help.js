import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import config from '../config.js';
import Log from '../models/Log.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all bot commands and features.'),

  async execute(interaction, client) {
    const isAdmin = interaction.member.roles.cache.has(config.adminRoleId);
    const user = interaction.user;

    const embed = new EmbedBuilder()
      .setTitle('📖 SLS Bot Help')
      .setColor('DarkBlue')
      .setDescription('Welcome to the Sub Level Society Bot.\nHere are the available commands:')
      .setFooter({ text: `Requested by ${user.tag}` })
      .setTimestamp();

    embed.addFields(
      {
        name: '🛡️ Moderation',
        value: [
          '`/modpanel <user>` - Open mod panel with buttons',
          '`/strike <user> <reason>` - Issue a strike',
          '`/sa <user> <message>` - End user session (hex scramble)',
          isAdmin ? '`/approve <strike_id>` - Approve a strike' : '',
          isAdmin ? '`/deny <strike_id>` - Deny a strike' : ''
        ].filter(Boolean).join('\n')
      },
      {
        name: '📦 Utilities',
        value: [
          '`/help` - Show this help panel',
          '`/rules` - Display server rules',
          '`/warnings <user>` - View user strikes/warnings'
        ].join('\n')
      },
      {
        name: '🕵️‍♂️ Security (Automatic)',
        value: [
          '• Raid detection (5+ joins in 10s)',
          '• Anti-nuke protection (removes perms)',
          '• All actions are logged to logs channel & DB'
        ].join('\n')
      }
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });

    // Log usage
    await Log.create({
      type: 'help_used',
      data: {
        userId: user.id,
        userTag: user.tag,
        timestamp: new Date()
      }
    });

    const logChannel = client.channels.cache.get(config.logChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('📘 Help Command Used')
        .setColor('Blue')
        .addFields(
          { name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true },
          { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>` }
        )
        .setFooter({ text: 'Help Panel Accessed' });

      await logChannel.send({ embeds: [logEmbed] });
    }
  }
};
