import { ChannelType, Guild, PermissionFlagsBits, TextChannel } from 'discord.js';
import { getInventory } from '../db';
import { readBackup, writeBackup } from '../utils/storage';
import { formatFinance } from '../utils/finance';
import {
  applyMovement,
  formatInventory,
  Inventory,
  InventoryError,
  Movement,
  normalizeInventory,
} from '../utils/inventory';

const queues = new Map<string, Promise<unknown>>();

// Serialize the entire read/save/publish operation for each guild in this bot process.
export async function withInventoryLock<T>(guildId: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(guildId) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(action);
  queues.set(guildId, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(guildId) === pending) queues.delete(guildId);
  }
}

export function readInventory(guildId: string): Inventory | null {
  const saved = readBackup(guildId);
  if (!saved) return null;
  if (
    saved.finance &&
    (typeof saved.finance.channel_id !== 'string' ||
      !Number.isSafeInteger(saved.finance.initial_cents) ||
      saved.finance.initial_cents < 0 ||
      !Number.isSafeInteger(saved.finance.balance_cents))
  )
    throw new Error('Dados financeiros invalidos. Restaure o arquivo de estoque.');
  if (
    !Array.isArray(saved.items) ||
    (saved.orders !== undefined && !Array.isArray(saved.orders)) ||
    (saved.movements !== undefined && !Array.isArray(saved.movements))
  ) {
    throw new Error('Dados de estoque invalidos. Restaure o arquivo de estoque.');
  }
  return { ...saved, items: normalizeInventory(saved.items), movements: saved.movements ?? [] };
}

export async function loadInventory(guildId: string): Promise<Inventory> {
  const saved = readInventory(guildId);
  if (saved) return saved;
  // Import legacy PostgreSQL inventory only before a local inventory exists.
  let legacy;
  try {
    legacy = await getInventory(guildId);
  } catch {
    throw new InventoryError(
      'Sem estoque local e sem acesso ao banco. Restaure data/inventories.json ou conecte o PostgreSQL antes de configurar.',
    );
  }
  return {
    items: normalizeInventory(legacy?.items ?? []),
    channel_id: legacy?.channel_id ?? undefined,
    message_id: legacy?.message_id ?? undefined,
    movements: [],
  };
}

export async function stockChannel(
  guild: Guild,
  channelId: string,
  reactions = false,
): Promise<TextChannel> {
  const channel = await guild.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText)
    throw new InventoryError('Selecione um canal de texto do servidor.');
  const member = guild.members.me ?? (await guild.members.fetchMe());
  const required = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];
  if (reactions) required.push(PermissionFlagsBits.AddReactions);
  if (!channel.permissionsFor(member)?.has(required)) {
    throw new InventoryError(
      'O bot precisa ver o canal, enviar mensagens, ler o historico e, nos canais de movimentacao, adicionar reacoes.',
    );
  }
  return channel;
}

export async function publishInventory(guild: Guild, inventory: Inventory): Promise<void> {
  if (!inventory.channel_id)
    throw new InventoryError('Configure o painel com /stock start primeiro.');
  const content = formatInventory(inventory.items);
  const channel = await stockChannel(guild, inventory.channel_id);
  let message;
  if (inventory.message_id) {
    try {
      message = await channel.messages.fetch(inventory.message_id);
    } catch (error) {
      if ((error as { code?: number }).code !== 10008) throw error;
    }
  }
  if (message) {
    await message.edit({ content, allowedMentions: { parse: [] } });
  } else {
    message = await channel.send({ content, allowedMentions: { parse: [] } });
    inventory.message_id = message.id;
    writeBackup(guild.id, inventory);
  }
}

export async function recordMovement(
  guild: Guild,
  inventory: Inventory,
  movement: Movement,
): Promise<'saved' | 'duplicate' | 'pending'> {
  if (!inventory.channel_id)
    throw new InventoryError(
      'Configure o painel com /stock start primeiro. Nenhum item foi alterado.',
    );
  const duplicate = inventory.movements.some((entry) => entry.id === movement.id);
  if (!duplicate) {
    const items = applyMovement(inventory.items, movement.items, movement.kind);
    formatInventory(items);
    let finance = inventory.finance;
    if (movement.trade) {
      if (!finance)
        throw new InventoryError('Configure o financeiro com /financeiro start primeiro.');
      const { kind, total_cents } = movement.trade;
      if (
        !Number.isSafeInteger(total_cents) ||
        total_cents <= 0 ||
        movement.kind !== (kind === 'purchase' ? 'add' : 'remove')
      )
        throw new InventoryError('Movimentacao financeira invalida.');
      const balance = finance.balance_cents + (kind === 'purchase' ? -total_cents : total_cents);
      if (!Number.isSafeInteger(balance))
        throw new InventoryError('Saldo financeiro fora do limite.');
      finance = { ...finance, balance_cents: balance };
    }
    const next = { ...inventory, finance, items, movements: [...inventory.movements, movement] };
    // Commit balance and deduplication ID together, before any Discord notification.
    writeBackup(guild.id, next);
    inventory = next;
  }
  try {
    const results = await Promise.allSettled([
      publishInventory(guild, inventory),
      ...(movement.trade ? [publishFinance(guild, inventory)] : []),
    ]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  } catch (error) {
    console.error('Movimentacao salva, mas painel de estoque pendente:', error);
    return 'pending';
  }
  return duplicate ? 'duplicate' : 'saved';
}

export async function publishFinance(guild: Guild, inventory: Inventory): Promise<void> {
  const finance = inventory.finance;
  if (!finance) throw new InventoryError('Configure o financeiro com /financeiro start primeiro.');
  const channel = await stockChannel(guild, finance.channel_id);
  let message;
  if (finance.message_id) {
    try {
      message = await channel.messages.fetch(finance.message_id);
    } catch (error) {
      if ((error as { code?: number }).code !== 10008) throw error;
    }
  }
  const payload = { content: formatFinance(finance), allowedMentions: { parse: [] as never[] } };
  if (message) await message.edit(payload);
  else {
    message = await channel.send(payload);
    finance.message_id = message.id;
    writeBackup(guild.id, inventory);
  }
}
