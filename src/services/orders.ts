import { Guild, PermissionFlagsBits } from 'discord.js';
import { Inventory, InventoryError } from '../utils/inventory';
import { Order, orderSummary } from '../utils/orders';
import { writeBackup } from '../utils/storage';
import { publishFinance, stockChannel } from './inventory';

export async function ordersChannel(guild: Guild, id: string) {
  const channel = await stockChannel(guild, id);
  const member = guild.members.me ?? (await guild.members.fetchMe());
  if (
    !channel
      .permissionsFor(member)
      ?.has([PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.SendMessagesInThreads])
  )
    throw new InventoryError(
      'O bot precisa criar topicos publicos e enviar mensagens em topicos no canal de encomendas.',
    );
  return channel;
}

// Caller holds the shared guild lock, including publication and persistence.
export async function publishOrder(guild: Guild, inventory: Inventory, order: Order) {
  const content = orderSummary(order);
  const channel = await ordersChannel(guild, order.channel_id);
  let thread = order.thread_id ? await guild.channels.fetch(order.thread_id) : null;
  if (!thread) {
    const source = await channel.messages.fetch(order.id);
    thread = source.hasThread
      ? await guild.channels.fetch(source.id)
      : await source.startThread({ name: `Pedido ${order.id}`, autoArchiveDuration: 1440 });
    if (!thread) throw new InventoryError('Topico indisponivel. Confira a mensagem original.');
    order.thread_id = thread.id;
    writeBackup(guild.id, inventory);
  }
  if (!thread.isThread() || thread.parentId !== order.channel_id)
    throw new InventoryError('Topico da encomenda invalido.');
  if (thread.archived) await thread.setArchived(false);
  let summary;
  if (order.summary_id) {
    try {
      summary = await thread.messages.fetch(order.summary_id);
    } catch (error) {
      if ((error as { code?: number }).code !== 10008) throw error;
    }
  }
  const payload = { content, allowedMentions: { parse: [] as never[] } };
  if (summary) await summary.edit(payload);
  else {
    const sent = await thread.send(payload);
    order.summary_id = sent.id;
    writeBackup(guild.id, inventory);
  }
}

export async function finishOrder(
  guild: Guild,
  inventory: Inventory,
  order: Order,
  userId: string,
  paid: number,
) {
  if (!inventory.finance)
    throw new InventoryError('Configure o financeiro com /financeiro start primeiro.');
  const duplicate = !!order.completed_at;
  if (!duplicate) {
    if (!Number.isSafeInteger(paid) || paid <= 0)
      throw new InventoryError('O valor pago deve ser maior que zero e estar dentro do limite.');
    const balance = inventory.finance.balance_cents + paid;
    if (!Number.isSafeInteger(balance))
      throw new InventoryError('Saldo financeiro fora do limite.');
    const completed = {
      ...order,
      paid_cents: paid,
      completed_by: userId,
      completed_at: new Date().toISOString(),
    };
    orderSummary(completed);
    const next = {
      ...inventory,
      finance: { ...inventory.finance, balance_cents: balance },
      orders: inventory.orders!.map((entry) => (entry.id === order.id ? completed : entry)),
    };
    writeBackup(guild.id, next);
    inventory = next;
    order = completed;
  }
  const results = await Promise.allSettled([
    publishFinance(guild, inventory),
    publishOrder(guild, inventory, order),
  ]);
  if (results.some((result) => result.status === 'rejected')) {
    console.error('Encomenda finalizada com publicacao pendente:', results);
    return 'Pagamento salvo no caixa, mas uma mensagem nao foi atualizada. Use /encomendas sincronizar com o ID do pedido. Nao registre outra venda para este pagamento.';
  }
  return duplicate
    ? 'Encomenda ja finalizada. O pagamento nao foi somado novamente.'
    : 'Encomenda finalizada e pagamento adicionado ao caixa.';
}
