import { EmbedBuilder } from 'discord.js';
import Log from '../models/Log.js';

const joinTimestamps = new Map();

export default client => {
  client.on('guildMemberAdd', async member => {
    const guildId = member.guild.id;
    const now = Date.now();

    if (!joinTimestamps.has(guildId)) {
      joinTimestamps.set(guildId, []);
    }

    const timestamps = joinTimestamps.get(guildId);
    timestamps.push(now);

    // Remove entries older than 10 seconds
    while (timestamps.length && now - timestamps[0] > 10000) {
      timestamps.shift();
    }

    // Raid detected: 5+ joins in 10 seconds
    if (timestamps.length >= 5) {
      const logChannel = member.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

      const embed = new EmbedBuilder()
        .setTitle('🚨 Possible Raid Detected')
        .setDescription(`5+ users joined **${member.guild.name}** in under 10 seconds.`)
        .addFields(
          { name: 'Time', value: `<t:${Math.floor(now / 1000)}:f>`, inline: true },
          { name: 'Detected By', value: client.user.tag, inline: true }
        )
        .setColor('Red')
        .setTimestamp();

      if (logChannel) {
        await logChannel.send({ embeds: [embed] });
      }

      // Log to MongoDB
      await Log.create({
        type: 'anti_raid_trigger',
        data: {
          guildId,
          timestamp: new Date(),
          totalJoins: timestamps.length,
          trigger: '5+ joins in 10s'
        }
      });

      // Optional: Auto lockdown (commented)
      /*
      member.guild.channels.cache.forEach(channel => {
        channel.permissionOverwrites.edit(member.guild.roles.everyone, {
          SendMessages: false,
          Connect: false
        }).catch(console.error);
      });
      */
    }
  });
};
