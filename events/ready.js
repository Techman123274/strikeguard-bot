import { ActivityType } from 'discord.js';

export default client => {
  client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity('Strikes', { type: ActivityType.Watching });
  });
};
