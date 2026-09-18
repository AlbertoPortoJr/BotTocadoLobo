export interface InventoryItem {
  name: string;
  qty: number;
}

export type MovementKind = 'add' | 'remove';

export interface Movement {
  id: string;
  user_id: string;
  channel_id: string;
  kind: MovementKind;
  created_at: string;
  items: InventoryItem[];
}

export interface Inventory {
  channel_id?: string;
  message_id?: string;
  add_channel_id?: string;
  remove_channel_id?: string;
  items: InventoryItem[];
  movements: Movement[];
}

export class InventoryError extends Error {}

export function normalizeName(name: string): string {
  return name
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')
    .replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('pt-BR'));
}

export function itemKey(name: string): string {
  return normalizeName(name).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

function preferredName(current: string, incoming: string): string {
  const accents = (name: string) => (name.normalize('NFD').match(/\p{M}/gu) ?? []).length;
  return accents(incoming) > accents(current) ? incoming : current;
}

export function normalizeInventory(items: InventoryItem[]): InventoryItem[] {
  const merged = new Map<string, InventoryItem>();
  for (const item of items) {
    const name = normalizeName(item.name);
    const key = itemKey(name);
    const existing = merged.get(key);
    const qty = (existing?.qty ?? 0) + item.qty;
    if (!Number.isSafeInteger(item.qty) || item.qty < 0 || !Number.isSafeInteger(qty)) {
      throw new InventoryError(`Quantidade fora do limite para ${name}.`);
    }
    merged.set(key, { name: existing ? preferredName(existing.name, name) : name, qty });
  }
  return [...merged.values()];
}

export function validateItem(item: InventoryItem): InventoryItem {
  const name = normalizeName(item.name);
  if (!name || name.length > 100 || /[\p{Cc}\p{Cf}`|<>@]/u.test(name) || !/\p{L}/u.test(name)) {
    throw new InventoryError(
      'Nome invalido: use de 1 a 100 caracteres, incluindo letras, sem mencoes ou crases.',
    );
  }
  if (!Number.isSafeInteger(item.qty) || item.qty <= 0) {
    throw new InventoryError('A quantidade deve ser um numero inteiro maior que zero.');
  }
  return { name, qty: item.qty };
}

export function parseMovement(content: string): InventoryItem[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length)
    throw new InventoryError(
      'Informe um item por linha. Use: Farinha de trigo 10 ou 10 Farinha de trigo',
    );
  return lines.map((line, index) => {
    const trailing = /^(.+?)\s+(\d+)$/.exec(line);
    const leading = /^(\d+)\s+(.+)$/.exec(line);
    if (trailing && leading) {
      throw new InventoryError(
        `Linha ${index + 1} ambigua: ha numeros nas duas pontas. Coloque o nome primeiro e a quantidade no final, por exemplo: Tabua 2 10.`,
      );
    }
    if (trailing) return validateItem({ name: trailing[1], qty: Number(trailing[2]) });
    if (leading) return validateItem({ name: leading[2], qty: Number(leading[1]) });
    throw new InventoryError(
      `Linha ${index + 1} invalida. Use: Farinha de trigo 10 ou 10 Farinha de trigo`,
    );
  });
}

export function applyMovement(
  current: InventoryItem[],
  entries: InventoryItem[],
  kind: MovementKind,
): InventoryItem[] {
  const items = normalizeInventory(current);
  for (const entry of entries) {
    const { name, qty } = validateItem(entry);
    const key = itemKey(name);
    let item = items.find((candidate) => itemKey(candidate.name) === key);
    if (kind === 'remove' && (!item || item.qty < qty)) {
      throw new InventoryError(
        `Saldo insuficiente para ${name}. Disponivel: ${item?.qty ?? 0}. Nenhum item foi alterado.`,
      );
    }
    if (!item) {
      item = { name, qty: 0 };
      items.push(item);
    }
    const nextQty = item.qty + (kind === 'add' ? qty : -qty);
    if (!Number.isSafeInteger(nextQty) || nextQty < 0)
      throw new InventoryError(`Quantidade fora do limite para ${name}.`);
    item.qty = nextQty;
    item.name = preferredName(item.name, name);
  }
  return sortInventory(items);
}

function sortInventory(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'pt-BR'));
}

export function formatInventory(items: InventoryItem[]): string {
  const width = Math.max(4, ...items.map((item) => item.name.length));
  const rows = items.length
    ? [
        `${'Item'.padEnd(width)} | Quantidade`,
        ...sortInventory(items).map((item) => `${item.name.padEnd(width)} | ${item.qty}`),
      ].join('\n')
    : 'Nenhum item em estoque.';
  const content = `**Estoque atual**\n\n\`\`\`md\n${rows}\n\`\`\``;
  if (content.length > 2000)
    throw new InventoryError(
      'O estoque excede o tamanho do painel. Nenhuma movimentacao foi salva.',
    );
  return content;
}
