import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { loadCommands } from './handlers/commandHandler';
import { loadEvents } from './handlers/eventHandler';
import { initDb } from './db';
import { info, error } from './utils/logger';
import env from './config/env';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

async function start() {
  try {
    loadCommands(client);
    loadEvents(client);
    try {
      await initDb();
      info('Database initialized');
    } catch (dbErr) {
      error('Database initialization failed (continuing without DB):', dbErr);
    }
    await client.login(env.DISCORD_TOKEN);
    info('Bot logged in');
  } catch (err) {
    if (err instanceof Error && /disallowed intents/i.test(err.message)) {
      error('Discord recusou o Message Content Intent. Abra https://discord.com/developers/applications, selecione o bot e habilite Bot > Privileged Gateway Intents > Message Content Intent. Salve e reinicie com npm run dev.');
    }
    error('Failed to start bot', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  error('Unhandled Rejection', reason);
});
process.on('uncaughtException', (err) => {
  error('Uncaught Exception', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  info('Shutting down...');
  await client.destroy();
  process.exit(0);
});

start();
