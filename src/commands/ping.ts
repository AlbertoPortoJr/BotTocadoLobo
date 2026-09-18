import { SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../types/Command';

const command: BotCommand = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Responde com pong'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pong!', fetchReply: true });
    const diff = (sent.createdTimestamp || Date.now()) - interaction.createdTimestamp;
    await interaction.editReply(`Pong! ${diff}ms`);
  }
};

export default command;
