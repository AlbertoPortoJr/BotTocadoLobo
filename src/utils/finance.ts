import { Inventory, InventoryError, parseMovement } from './inventory';

export function parseMoney(value: string): number {
  const text = value.trim().replace(/^R\$\s*/i, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text))
    throw new InventoryError('Valor invalido. Use 25,00 ou 1.250,50 (ate duas casas decimais).');
  const [whole, fraction = ''] = text.replace(/\./g, '').split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0) throw new InventoryError('Valor fora do limite.');
  return cents;
}

export function parseTrade(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length)
    throw new InventoryError('Use um item por linha: Farinha 10 25,00 (valor total da linha).');
  let total_cents = 0;
  const items = lines.map((line) => {
    const match = /^(.*?)\s+(R\$\s*\S+|\S+)$/i.exec(line);
    const parts = line.includes('|') ? line.split('|') : match?.slice(1);
    if (!parts || parts.length !== 2)
      throw new InventoryError('Use um item por linha: Farinha 10 25,00 (valor total da linha).');
    const cost = parseMoney(parts[1]);
    if (cost <= 0) throw new InventoryError('O valor de cada linha deve ser maior que zero.');
    total_cents += cost;
    if (!Number.isSafeInteger(total_cents)) throw new InventoryError('Valor fora do limite.');
    return parseMovement(parts[0])[0];
  });
  return { items, total_cents };
}

export function formatFinance(finance: NonNullable<Inventory['finance']>): string {
  const money = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `**Controle financeiro**\n\n\`\`\`md\nSaldo inicial | R$ ${money(finance.initial_cents)}\nSaldo atual   | R$ ${money(finance.balance_cents)}\n\`\`\``;
}

export function assertDistinctChannel(inventory: Inventory, key: string, channelId: string) {
  const channels: Record<string, string | undefined> = {
    channel_id: inventory.channel_id,
    add_channel_id: inventory.add_channel_id,
    remove_channel_id: inventory.remove_channel_id,
    purchase_channel_id: inventory.purchase_channel_id,
    sale_channel_id: inventory.sale_channel_id,
    orders_channel_id: inventory.orders_channel_id,
    finance: inventory.finance?.channel_id,
  };
  if (Object.entries(channels).some(([name, id]) => name !== key && id === channelId))
    throw new InventoryError('Os paineis e canais de movimentacao precisam usar canais distintos.');
}
