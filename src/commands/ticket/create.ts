import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { createTicket } from '../../db';

export default {
  data: new SlashCommandBuilder().setName('ticket').setDescription('Cria um ticket').addStringOption(o => o.setName('assunto').setDescription('Assunto do ticket').setRequired(false)),
  async execute(interaction: any) {
    const guild = interaction.guild;
    const topic = interaction.options.getString('assunto') || 'Ticket';
    const channel = await guild.channels.create({ name: `ticket-${interaction.user.username}` });
    await channel.permissionOverwrites.edit(interaction.user, { ViewChannel: true, SendMessages: true });
    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
    await createTicket(guild.id, channel.id, interaction.user.id);
    channel.send(`Olá ${interaction.user}, seu ticket foi aberto: **${topic}**`);
    return interaction.reply({ content: `Ticket criado: ${channel}`, ephemeral: true });
  }
};
