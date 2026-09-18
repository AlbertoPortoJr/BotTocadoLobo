import { InventoryError, InventoryItem, parseMovement } from './inventory';
import { parseMoney } from './finance';

export interface Order {
  id: string;
  channel_id: string;
  user_id: string;
  created_at: string;
  items: InventoryItem[];
  total_qty: number;
  unit_cents: number;
  total_cents: number;
  location: string;
  contact: string;
  thread_id?: string;
  summary_id?: string;
  completed_at?: string;
  completed_by?: string;
  paid_cents?: number;
}

export function parseOrder(content: string) {
  const match =
    /^\s*Pedido\s*([\s\S]+?)\s+Total:\s*(\d+)\s*unidades?\s+Valor:\s*(.*?)\s+Und\.?\s+Local:\s*([\s\S]+?)\s+Telegrama:\s*([\s\S]+?)\s*$/i.exec(
      content,
    );
  if (!match)
    throw new InventoryError(
      'Use: Pedido • 10000 Canas de açucar • 10000 Trigos • 10000 Milhos Total: 30000unidades Valor: 0,17 Und Local: Vet Strawberry Telegrama: via dc',
    );
  const lines = match[1]
    .replace(/^\s*•\s*/, '')
    .split(/[•\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items = parseMovement(lines.join('\n'));
  const total_qty = items.reduce((sum, item) => sum + item.qty, 0);
  if (!Number.isSafeInteger(total_qty) || total_qty !== Number(match[2]))
    throw new InventoryError('O Total deve ser igual a soma das quantidades dos itens.');
  const unit_cents = parseMoney(match[3]);
  const total_cents = total_qty * unit_cents;
  if (unit_cents <= 0 || !Number.isSafeInteger(total_cents))
    throw new InventoryError('Valor da encomenda invalido ou fora do limite.');
  const location = match[4].trim();
  const contact = match[5].trim();
  if (location.length > 200 || contact.length > 200 || /[`\p{Cc}\p{Cf}]/u.test(location + contact))
    throw new InventoryError(
      'Local e Telegrama devem ter ate 200 caracteres, sem quebras de linha ou crases.',
    );
  return { items, total_qty, unit_cents, total_cents, location, contact };
}

export function orderSummary(order: Order): string {
  const money = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const content = `**Encomenda ${order.completed_at ? 'finalizada' : 'aberta'}**\nPedido: ${order.id}\n\n\`\`\`md\n${order.items.map((item) => `${item.qty} ${item.name}`).join('\n')}\nTotal: ${order.total_qty} unidades\nValor: R$ ${money(order.unit_cents)} Und\nTotal previsto: R$ ${money(order.total_cents)}\nLocal: ${order.location}\nTelegrama: ${order.contact}\n${order.completed_at ? `Valor pago: R$ ${money(order.paid_cents!)}\nFinalizada em: ${order.completed_at}` : 'Status: aguardando finalizacao'}\n\`\`\`\n${order.completed_at ? 'Pagamento registrado no caixa.' : 'Ao receber o pagamento, use /encomendas finalizar neste topico. O valor-pago e opcional.'}`;
  if (content.length > 2000)
    throw new InventoryError(
      'Encomenda grande demais para o painel. Reduza os nomes ou a quantidade de linhas.',
    );
  return content;
}
