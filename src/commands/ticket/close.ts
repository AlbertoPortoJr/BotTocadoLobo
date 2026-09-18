import { SlashCommandBuilder } from 'discord.js';
import { closeTicket } from '../../db';

export default {
  data: new SlashCommandBuilder().setName('close').setDescription('Fecha o ticket atual'),
  async execute(interaction: any) {
    const channel = interaction.channel;
    await closeTicket(channel.id);
    await channel.send('Ticket fechado. Este canal será arquivado.');
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: false });
    return interaction.reply({ content: 'Ticket fechado.', ephemeral: true });
  }
};
