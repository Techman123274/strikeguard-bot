import { EmbedBuilder } from 'discord.js';
import config from '../config.js';
import Log from '../models/Log.js';


const messageCache = new Map();
const SPAM_WINDOW = 7000; // 7 seconds
const MAX_MESSAGES = 5;
const MAX_MENTIONS = 5;
const MAX_CAPS_PERCENT = 0.7;

export default client => {
  client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const now = Date.now();

    // Create user's entry if not exists
    if (!messageCache.has(userId)) {
      messageCache.set(userId, []);
    }

    const logs = messageCache.get(userId);
    logs.push({ content: message.content, time: now });

    // Filter old messages outside the spam window
    const recent = logs.filter(msg => now - msg.time < SPAM_WINDOW);
    messageCache.set(userId, recent);

    // Detection: too many messages
    if (recent.length > MAX_MESSAGES) {
      await takeAction(message, 'Spamming messages too quickly');
      return;
    }

    // Detection: duplicate messages
    const duplicates = recent.filter(m => m.content === message.content);
    if (duplicates.length > 3) {
      await takeAction(message, 'Repeated duplicate messages');
      return;
    }

    // Detection: mass mentions
    if (message.mentions.users.size >= MAX_MENTIONS) {
      await takeAction(message, 'Mention spam detected');
      return;
    }

    // Detection: excessive CAPS
    const content = message.content.replace(/[^a-zA-Z]/g, '');
    const caps = content.replace(/[^A-Z]/g, '');
    if (content.length > 10 && caps.length / content.length > MAX_CAPS_PERCENT) {
      await takeAction(message, 'Excessive capital letters');
      return;
    }

    // Detection: multiple links
    const links = (message.content.match(/https?:\/\//g) || []).length;
    if (links >= 3) {
      await takeAction(message, 'Link spam detected');
      return;
    }
  });
};

async function takeAction(message, reason) {
  const member = message.member;
  const mutedRole = message.guild.roles.cache.get(process.env.MUTED_ROLE_ID);
  const logChannel = message.client.channels.cache.get(config.logChannelId);

  // Mute the user
  if (mutedRole && !member.roles.cache.has(mutedRole.id)) {
    await member.roles.add(mutedRole, `[AutoMute] ${reason}`);
  }

  // Delete offending message
  await message.delete().catch(() => {});

  // Log to channel
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setTitle('🔇 Auto-Mute Triggered')
      .setColor('Red')
      .addFields(
        { name: 'User', value: `<@${member.id}> (${member.id})` },
        { name: 'Reason', value: reason },
        { name: 'Channel', value: `<#${message.channel.id}>` }
      )
      .setTimestamp();
    logChannel.send({ embeds: [embed] });
  }

  // Log to Mongo
  await Log.create({
    type: 'auto_mute',
    data: {
      userId: member.id,
      reason,
      timestamp: new Date(),
      channelId: message.channel.id,
      triggeredBy: 'antiSpam'
    }
  });
}
