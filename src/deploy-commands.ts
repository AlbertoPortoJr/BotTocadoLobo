import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { REST, Routes } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('DISCORD_TOKEN, CLIENT_ID and GUILD_ID must be set in env');
  process.exit(1);
}

const commands: any[] = [];
const commandsPath = path.join(__dirname, 'commands');
function walk(dir: string) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (file.endsWith('.ts') || file.endsWith('.js')) {
      const cmd = require(full);
      const command = cmd.default || cmd;
      if (command?.data) commands.push(command.data.toJSON());
    }
  }
}
walk(commandsPath);

const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
