import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import config from '../config.js';
import Log from '../models/Log.js';

const nukeActions = [
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.EmojiDelete,
  AuditLogEvent.GuildBanAdd
];

export default client => {
  client.on('guildAuditLogEntryCreate', async entry => {
    const { action, executor, target, guild } = entry;

    if (!nukeActions.includes(action)) return;
    if (!guild || !executor || executor.bot || executor.id === config.ownerId) return;

    const logChannel = client.channels.cache.get(config.logChannelId);

    // Log to MongoDB
    await Log.create({
      type: 'anti_nuke_trigger',
      data: {
        action,
        executorId: executor.id,
        executorTag: executor.tag,
        targetId: target?.id || null,
        targetType: target?.constructor?.name || 'Unknown',
        timestamp: new Date(),
        guildId: guild.id
      }
    });

    // Fetch executor as guild member
    const member = await guild.members.fetch(executor.id).catch(() => null);

    if (member && member.manageable) {
      const removedRoles = member.roles.cache.map(r => r.id);
      await member.roles.set([], '⚠️ Auto-stripped by anti-nuke');

      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🚨 Nuke Action Blocked')
          .setColor('DarkRed')
          .addFields(
            { name: 'Executor', value: `<@${executor.id}> (${executor.tag})`, inline: true },
            { name: 'Action Type', value: action, inline: true },
            { name: 'Target', value: target?.name || target?.id || 'Unknown' },
            { name: 'Removed Roles', value: removedRoles.map(id => `<@&${id}>`).join(', ') || 'None' },
            { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>` }
          )
          .setFooter({ text: `Guild: ${guild.name}` })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] });
      }
    }
  });
};
