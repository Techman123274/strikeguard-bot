import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();

(async () => {
  try {
    // Load Commands
    const commandsPath = path.resolve('./commands');
    if (!fs.existsSync(commandsPath)) {
      console.warn('⚠️ "commands" folder not found.');
    } else {
      const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
      for (const file of commandFiles) {
        const command = await import(`./commands/${file}`);
        if (command.default?.data?.name) {
          client.commands.set(command.default.data.name, command.default);
        } else {
          console.warn(`⚠️ Invalid command file: ${file}`);
        }
      }
    }

    // Load Events
    const eventsPath = path.resolve('./events');
    if (!fs.existsSync(eventsPath)) {
      console.warn('⚠️ "events" folder not found.');
    } else {
      const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
      for (const file of eventFiles) {
        const event = await import(`./events/${file}`);
        if (typeof event.default === 'function') {
          event.default(client);
        } else {
          console.warn(`⚠️ Event file does not export default function: ${file}`);
        }
      }
    }

    // Connect to MongoDB
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not set in .env');
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Start bot
    if (!process.env.BOT_TOKEN) {
      throw new Error('BOT_TOKEN is not set in .env');
    }
    await client.login(process.env.BOT_TOKEN);
    console.log('🤖 Bot is online!');
  } catch (err) {
    console.error('❌ Failed to start bot:', err);
  }
})();
