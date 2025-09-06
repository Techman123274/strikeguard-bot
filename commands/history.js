import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Log from '../models/Log.js';
import config from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View all moderation history for a user.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to view moderation history for')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
      return interaction.reply({ content: '🚫 You do not have permission.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const logs = await Log.find({ 'data.userId': user.id }).sort({ timestamp: -1 });

    if (logs.length === 0) {
      return interaction.reply({ content: `📂 No moderation history found for <@${user.id}>.`, ephemeral: true });
    }

    const counts = {
      warn: 0,
      kick: 0,
      ban: 0,
      mute: 0,
      note: 0
    };

    const details = logs.map((log, index) => {
      const time = `<t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:f>`;
      const moderator = log.data.moderatorTag ? `${log.data.moderatorTag} (${log.data.moderatorId})` : 'Unknown';
      const base = `\`#${index + 1}\` • **${log.type.toUpperCase()}** • ${time}\n`;

      counts[log.type]++;

      switch (log.type) {
        case 'warn':
        case 'mute':
        case 'ban':
          return `${base}> Reason: ${log.data.reason}\n> Moderator: ${moderator}\n> Duration: ${log.data.duration || 'N/A'}\n`;
        case 'kick':
          return `${base}> Reason: ${log.data.reason}\n> Moderator: ${moderator}\n`;
        case 'note':
          return `${base}> Note: ${log.data.note}\n> Moderator: ${moderator}\n`;
        default:
          return `${base}> No data\n`;
      }
    });

    const embed = new EmbedBuilder()
      .setTitle(`📑 History for ${user.tag}`)
      .setDescription(details.join('\n'))
      .setColor('DarkPurple')
      .setFooter({ text: `Total: ${logs.length} logs | WARN: ${counts.warn} | KICK: ${counts.kick} | BAN: ${counts.ban} | MUTE: ${counts.mute} | NOTE: ${counts.note}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
};
