import { SlashCommandBuilder } from 'discord.js';
import { hasModPermission } from '../../utils/permissions';
import { logModAction } from '../../db';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um membro')
    .addUserOption(opt => opt.setName('target').setDescription('Membro a expulsar').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Motivo')),
  async execute(interaction: any) {
    if (!hasModPermission(interaction.member)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'Sem motivo';
    const member = interaction.guild.members.cache.get(target.id);
    if (!member) return interaction.reply({ content: 'Membro não encontrado.', ephemeral: true });
    await member.kick(reason);
    await logModAction(interaction.guild.id, 'kick', target.id, interaction.user.id, reason);
    const modChannelId = process.env.MOD_LOG_CHANNEL_ID;
    if (modChannelId) {
      const ch = interaction.guild.channels.cache.get(modChannelId);
      ch?.send(`👢 **Kick**: ${target.tag} (${target.id})\nModerador: ${interaction.user.tag}\nMotivo: ${reason}`);
    }
    return interaction.reply({ content: `Expulsou ${target.tag}`, ephemeral: false });
  }
};
