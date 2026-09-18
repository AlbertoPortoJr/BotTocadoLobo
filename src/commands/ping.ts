import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Responde com pong'),
  async execute(interaction: any) {
    const sent = await interaction.reply({ content: 'Pong!', fetchReply: true });
    const diff = (sent.createdTimestamp || Date.now()) - interaction.createdTimestamp;
    return interaction.editReply(`Pong! ${diff}ms`);
  }
};
