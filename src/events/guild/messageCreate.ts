import { Client, Events, Message } from 'discord.js';
import { readInventory, recordMovement, withInventoryLock } from '../../services/inventory';
import { InventoryError, parseMovement } from '../../utils/inventory';

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(_client: Client, message: Message) {
    if (!message.guild || message.author.bot || message.webhookId || message.system) return;
    try {
      await withInventoryLock(message.guild.id, async () => {
        const inventory = readInventory(message.guild!.id);
        if (!inventory) return;
        const kind =
          message.channelId === inventory.add_channel_id
            ? 'add'
            : message.channelId === inventory.remove_channel_id
              ? 'remove'
              : null;
        if (!kind) return;
        try {
          const previous = inventory.movements.find((entry) => entry.id === message.id);
          const result = await recordMovement(
            message.guild!,
            inventory,
            previous ?? {
              id: message.id,
              user_id: message.author.id,
              channel_id: message.channelId,
              kind,
              created_at: message.createdAt.toISOString(),
              items: parseMovement(message.content),
            },
          );
          if (result === 'pending') {
            await message.reply({
              content:
                'Movimentacao salva, mas o painel nao foi atualizado. Nao reenvie os itens. Um administrador pode sincronizar com /stock start.',
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
