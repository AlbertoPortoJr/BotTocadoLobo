import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../../types/Command';
import {
  loadInventory,
  publishInventory,
  recordMovement,
  stockChannel,
  withInventoryLock,
} from '../../services/inventory';
import { writeBackup } from '../../utils/storage';
import { InventoryError, validateItem } from '../../utils/inventory';
import { assertDistinctChannel } from '../../utils/finance';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Gerencia o estoque')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Cria ou atualiza o painel de estoque')
        .addChannelOption((c) =>
          c
            .setName('channel')
            .setDescription('Canal do painel')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('set-add')
        .setDescription('Define o canal de entrada de itens')
        .addChannelOption((c) =>
          c
            .setName('canal')
            .setDescription('Canal de entrada')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('set-remove')
        .setDescription('Define o canal de saida de itens')
        .addChannelOption((c) =>
          c
            .setName('canal')
            .setDescription('Canal de saida')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Adiciona um item no canal de entrada')
        .addStringOption((o) => o.setName('name').setDescription('Nome do item').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('qty').setDescription('Quantidade').setMinValue(1).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Retira um item no canal de saida')
        .addStringOption((o) => o.setName('name').setDescription('Nome do item').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('qty').setDescription('Quantidade').setMinValue(1).setRequired(true),
        ),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Use este comando em um servidor.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    const configuring = ['start', 'set-add', 'set-remove'].includes(sub);
    if (configuring && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: 'Voce precisa da permissao Gerenciar Servidor para configurar o estoque.',
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const response = await withInventoryLock(guild.id, async () => {
        const inventory = await loadInventory(guild.id);
        if (sub === 'set-add' || sub === 'set-remove') {
          const channelId = interaction.options.getChannel('canal', true).id;
          assertDistinctChannel(
            inventory,
            sub === 'set-add' ? 'add_channel_id' : 'remove_channel_id',
            channelId,
          );
          const otherId =
            sub === 'set-add' ? inventory.remove_channel_id : inventory.add_channel_id;
          if (channelId === otherId || channelId === inventory.channel_id)
            throw new InventoryError('Entrada, saida e painel precisam usar canais distintos.');
          await stockChannel(guild, channelId, true);
          if (sub === 'set-add') inventory.add_channel_id = channelId;
          else inventory.remove_channel_id = channelId;
          writeBackup(guild.id, inventory);
          return `Canal de ${sub === 'set-add' ? 'entrada' : 'saida'} definido: <#${channelId}>. Envie um item por linha, por exemplo: Farinha 10.`;
        }
        if (sub === 'start') {
          const channelId =
            interaction.options.getChannel('channel')?.id ??
            inventory.channel_id ??
            interaction.channelId;
          assertDistinctChannel(inventory, 'channel_id', channelId);
          if (channelId === inventory.add_channel_id || channelId === inventory.remove_channel_id)
            throw new InventoryError(
              'O painel precisa ficar separado dos canais de entrada e saida.',
            );
          await stockChannel(guild, channelId);
          if (channelId !== inventory.channel_id) inventory.message_id = undefined;
          inventory.channel_id = channelId;
          await publishInventory(guild, inventory);
          writeBackup(guild.id, inventory);
          return `Painel de estoque atualizado em <#${channelId}>.`;
        }
        if (sub !== 'add' && sub !== 'remove') throw new InventoryError('Subcomando invalido.');
        const channelId = sub === 'add' ? inventory.add_channel_id : inventory.remove_channel_id;
        if (!channelId || channelId !== interaction.channelId)
          throw new InventoryError(`Use o canal configurado com /stock set-${sub}.`);
        const item = validateItem({
          name: interaction.options.getString('name', true),
          qty: interaction.options.getInteger('qty', true),
        });
        const result = await recordMovement(guild, inventory, {
          id: interaction.id,
          user_id: interaction.user.id,
          channel_id: interaction.channelId,
          kind: sub,
          created_at: interaction.createdAt.toISOString(),
          items: [item],
        });
        return result === 'pending'
          ? 'Movimentacao salva, mas o painel nao foi atualizado. Nao repita a movimentacao. Um administrador pode sincronizar com /stock start.'
          : `Estoque atualizado: ${item.name} (${item.qty}).`;
      });
      await interaction.editReply({ content: response, allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('Erro no comando de estoque:', error);
      await interaction.editReply({
        content:
          error instanceof InventoryError
            ? error.message
            : 'Nao foi possivel concluir a operacao. Consulte os logs do bot.',
        allowedMentions: { parse: [] },
      });
    }
  },
};

export default command;
