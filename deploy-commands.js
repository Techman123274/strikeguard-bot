// deploy-commands.js
import fs from 'fs';
import path from 'path';
import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [];
const commandsPath = path.resolve('./commands');
const commandFiles = fs.readdirSync(commandsPath);

for (const file of commandFiles) {
  const command = await import(`file://${commandsPath}/${file}`);
  if (command?.default?.data) {
    commands.push(command.default.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

try {
  console.log('📤 Deploying commands...');
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID), // your bot's client ID
    { body: commands }
  );
  console.log('✅ Commands deployed!');
} catch (error) {
  console.error('❌ Failed to deploy commands:', error);
}
