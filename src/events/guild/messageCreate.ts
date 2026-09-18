import { Client, Events, Message } from 'discord.js';
import { readInventory, recordMovement, withInventoryLock } from '../../services/inventory';
import { InventoryError, parseMovement } from '../../utils/inventory';
import { parseTrade } from '../../utils/finance';
import { parseOrder, orderSummary } from '../../utils/orders';
import { publishOrder } from '../../services/orders';
import { writeBackup } from '../../utils/storage';

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(_client: Client, message: Message) {
    if (!message.guild || message.author.bot || message.webhookId || message.system) return;
    try {
      await withInventoryLock(message.guild.id, async () => {
        const inventory = readInventory(message.guild!.id);
        if (!inventory) return;
        if (message.channelId === inventory.orders_channel_id) {
          try {
            let order = inventory.orders?.find((entry) => entry.id === message.id);
            if (!order) {
              order = {
                ...parseOrder(message.content),
                id: message.id,
                channel_id: message.channelId,
                user_id: message.author.id,
                created_at: message.createdAt.toISOString(),
              };
              // Reserve room for completion details before accepting the order.
              orderSummary({
                ...order,
                completed_at: new Date().toISOString(),
                paid_cents: Number.MAX_SAFE_INTEGER,
              });
              inventory.orders = [...(inventory.orders ?? []), order];
              writeBackup(message.guild!.id, inventory);
            }
            await publishOrder(message.guild!, inventory, order);
          } catch (error) {
            console.error('Erro ao registrar encomenda:', error);
            await message.reply({
              content:
                error instanceof InventoryError
                  ? error.message
                  : `Falha ao salvar ou abrir o topico. Use /encomendas sincronizar pedido:${message.id} antes de reenviar o pedido.`,
              allowedMentions: { parse: [], repliedUser: false },
            });
          }
          return;
        }
        const tradeKind =
          message.channelId === inventory.purchase_channel_id
            ? 'purchase'
            : message.channelId === inventory.sale_channel_id
              ? 'sale'
              : null;
        const kind =
          tradeKind === 'purchase'
            ? 'add'
            : tradeKind === 'sale'
              ? 'remove'
              : message.channelId === inventory.add_channel_id
                ? 'add'
                : message.channelId === inventory.remove_channel_id
                  ? 'remove'
                  : null;
        if (!kind) return;
        try {
          const previous = inventory.movements.find((entry) => entry.id === message.id);
          const trade = !previous && tradeKind ? parseTrade(message.content) : null;
          const result = await recordMovement(
            message.guild!,
            inventory,
            previous ?? {
              id: message.id,
              user_id: message.author.id,
              channel_id: message.channelId,
              kind,
              created_at: message.createdAt.toISOString(),
              items: trade?.items ?? parseMovement(message.content),
              ...(trade && tradeKind
                ? { trade: { kind: tradeKind, total_cents: trade.total_cents } }
                : {}),
            },
          );
          if (result === 'pending') {
            await message.reply({
              content:
                'Movimentacao salva, mas um painel nao foi atualizado. Nao reenvie os itens. Um administrador pode sincronizar com /stock start e /financeiro start (sem saldo-inicial).',
              allowedMentions: { parse: [], repliedUser: false },
            });
          } else {
            await message.react('\u2705');
          }
        } catch (error) {
          if (!(error instanceof InventoryError)) throw error;
          await message.reply({
            content: error.message,
            allowedMentions: { parse: [], repliedUser: false },
          });
        }
      });
    } catch (error) {
      console.error('Erro ao processar mensagem de estoque:', error);
      // A notification can fail after the movement was saved; never ask for a blind retry.
      await message
        .reply({
          content:
            'Falha ao processar ou confirmar a movimentacao. Confira o estoque e os logs antes de reenviar.',
          allowedMentions: { parse: [], repliedUser: false },
        })
        .catch(() => undefined);
    }
  },
};
