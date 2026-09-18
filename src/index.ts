import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { loadCommands } from './handlers/commandHandler';
import { initDb } from './db';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

loadCommands(client);

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  try {
    await initDb();
    console.log('Database initialized');
  } catch (err) {
    console.error('DB init failed', err);
  }
});

client.on(Events.InteractionCreate, async (interaction: any) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return interaction.reply({ content: 'Comando não encontrado', ephemeral: true });
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content: 'Erro ao executar comando', ephemeral: true });
    else await interaction.reply({ content: 'Erro ao executar comando', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
