import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../../types/Command';
import { loadInventory, publishFinance, withInventoryLock } from '../../services/inventory';
import { finishOrder, ordersChannel, publishOrder } from '../../services/orders';
import { assertDistinctChannel, parseMoney } from '../../utils/finance';
import { InventoryError } from '../../utils/inventory';
import { writeBackup } from '../../utils/storage';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('encomendas')
    .setDescription('Configura e finaliza encomendas')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('set-canal')
        .setDescription('Define o canal de encomendas')
        .addChannelOption((o) =>
          o
            .setName('canal')
            .setDescription('Canal dos pedidos')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('finalizar')
        .setDescription('Confirma o pagamento da encomenda neste topico')
        .addStringOption((o) =>
          o
            .setName('valor-pago')
            .setDescription('Total recebido, se diferente do previsto. Exemplo: 5.100,00'),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('sincronizar')
        .setDescription('Recupera o topico e atualiza as mensagens sem repetir pagamentos')
        .addStringOption((o) =>
          o.setName('pedido').setDescription('ID da mensagem original do pedido').setRequired(true),
        ),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: 'Use em um servidor com a permissao Gerenciar Servidor.',
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const response = await withInventoryLock(guild.id, async () => {
        const inventory = await loadInventory(guild.id);
        const sub = interaction.options.getSubcommand();
        if (sub === 'set-canal') {
          const id = interaction.options.getChannel('canal', true).id;
          assertDistinctChannel(inventory, 'orders_channel_id', id);
          await ordersChannel(guild, id);
          inventory.orders_channel_id = id;
          writeBackup(guild.id, inventory);
          return `Canal de encomendas definido: <#${id}>. Envie o Pedido com itens, Total, Valor por Und, Local e Telegrama.`;
        }
        const order = inventory.orders?.find((entry) =>
          sub === 'sincronizar'
            ? entry.id === interaction.options.getString('pedido', true)
            : entry.thread_id === interaction.channelId,
        );
        if (!order)
          throw new InventoryError(
            'Encomenda nao encontrada. Finalize dentro do topico do pedido ou sincronize pelo ID da mensagem original.',
          );
        if (sub === 'finalizar') {
          const value = interaction.options.getString('valor-pago');
          return finishOrder(
            guild,
            inventory,
            order,
            interaction.user.id,
            value === null ? order.total_cents : parseMoney(value),
          );
        }
        if (sub !== 'sincronizar') throw new InventoryError('Subcomando invalido.');
        await publishOrder(guild, inventory, order);
        if (order.completed_at) await publishFinance(guild, inventory);
        return `Encomenda sincronizada: <#${order.thread_id}>. Nenhum pagamento foi adicionado.`;
      });
      await interaction.editReply({ content: response, allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('Erro em encomendas:', error);
      await interaction.editReply({
        content:
          error instanceof InventoryError
            ? error.message
            : 'Falha ao processar ou publicar. Confira o caixa e use /encomendas sincronizar com o ID original antes de reenviar.',
        allowedMentions: { parse: [] },
      });
    }
  },
};
export default command;
