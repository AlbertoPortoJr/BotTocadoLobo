import fs from 'fs';
import path from 'path';
import { Collection } from 'discord.js';

export interface Command {
  data: any;
  execute: Function;
}

export function loadCommands(client: any) {
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, '..', 'commands');

  function walk(dir: string) {
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (file.endsWith('.ts') || file.endsWith('.js')) {
        const cmd = require(full);
        const command = cmd.default || cmd;
        if (command?.data && command?.execute) {
          client.commands.set(command.data.name, command);
        }
      }
    }
  }

  walk(commandsPath);
}
