import { Events } from 'discord.js';

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(client: any, interaction: any) {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return interaction.reply({ content: 'Comando não encontrado', ephemeral: true });
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error('Command error', err);
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: 'Erro ao executar comando', ephemeral: true });
      else await interaction.reply({ content: 'Erro ao executar comando', ephemeral: true });
    }
  }
};
