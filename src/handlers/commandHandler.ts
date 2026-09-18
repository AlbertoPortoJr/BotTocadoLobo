import fs from 'fs';
import path from 'path';
import { Collection } from 'discord.js';
import { BotCommand } from '../types/Command';

export function loadCommands(client: any): void {
  client.commands = new Collection<string, BotCommand>();
  const commandsPath = path.join(__dirname, '..', 'commands');

  function walk(dir: string) {
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (file.endsWith('.ts') || file.endsWith('.js')) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cmd = require(full);
        const command = cmd.default || cmd;
        if (command?.data && command?.execute) {
          client.commands.set(command.data.name, command);
        }
      }
    }
  }

  if (fs.existsSync(commandsPath)) walk(commandsPath);
}
