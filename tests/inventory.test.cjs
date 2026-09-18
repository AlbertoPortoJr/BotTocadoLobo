const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');
const core = require('../dist/utils/inventory');
const storage = require('../dist/utils/storage');
const db = require('../dist/db');
const service = require('../dist/services/inventory');
const handler = require('../dist/events/guild/messageCreate').default;
const command = require('../dist/commands/utility/stock').default;
const fs = require('node:fs');
const originalWriteBackup = storage.writeBackup;

let saved, edits, sends, guild, channel;
beforeEach(() => {
  saved = {
    channel_id: 'panel',
    message_id: 'panel-message',
    add_channel_id: 'in',
    remove_channel_id: 'out',
    items: [],
    movements: [],
  };
  edits = [];
  sends = [];
  channel = {
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    messages: { fetch: async () => ({ edit: async (payload) => edits.push(payload) }) },
    send: async (payload) => {
      sends.push(payload);
      return { id: 'replacement' };
    },
  };
  guild = { id: 'guild', channels: { fetch: async () => channel }, members: { me: {} } };
  mock.method(storage, 'readBackup', () => (saved ? structuredClone(saved) : null));
  mock.method(storage, 'writeBackup', (_guildId, value) => {
    saved = structuredClone(value);
  });
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

function message(id, content, channelId = 'in') {
  const replies = [],
    reactions = [];
  return {
    id,
    content,
    channelId,
    guild,
    author: { id: 'user', bot: false },
    createdAt: new Date(),
    replies,
    reactions,
    reply: async (value) => replies.push(value),
    react: async (value) => reactions.push(value),
  };
}

function interaction(sub, channelId, permitted = true) {
  const replies = [];
  return {
    guild,
    channelId,
    replies,
    memberPermissions: { has: () => permitted },
    options: { getSubcommand: () => sub, getChannel: () => ({ id: channelId }) },
    reply: async (value) => replies.push(value),
    deferReply: async () => {},
    editReply: async (value) => replies.push(value),
  };
}

test('parses multiple lines and names with spaces, accents and numbers', () => {
  assert.deepEqual(core.parseMovement(' Farinha de trigo 10\r\n\nTábua 2 3 '), [
    { name: 'Farinha de trigo', qty: 10 },
    { name: 'Tábua 2', qty: 3 },
  ]);
});

test('accepts quantity before or after the name in the same message', () => {
  assert.deepEqual(core.parseMovement('10 farinha de trigo\nMadeira 5\n  3   ACUCAR  '), [
    { name: 'Farinha de trigo', qty: 10 },
    { name: 'Madeira', qty: 5 },
    { name: 'Acucar', qty: 3 },
  ]);
});

test('rejects invalid leading quantities and ambiguous numeric ends', () => {
  for (const content of [
    '0 farinha',
    '-2 farinha',
    '1.5 farinha',
    '1,5 farinha',
    '9007199254740992 farinha',
    '10',
    '10 tabua 2',
  ]) {
    assert.throws(() => core.parseMovement(content), core.InventoryError);
  }
});

test('quantity-first messages work for entries and withdrawals', async () => {
  await handler.execute(null, message('leading-add', '10 farinha\n5 madeira'));
  await handler.execute(null, message('leading-remove', '3 FARINHA\nMadeira 2', 'out'));
  assert.deepEqual(saved.items, [
    { name: 'Farinha', qty: 7 },
    { name: 'Madeira', qty: 3 },
  ]);
});

test('rejects malformed names and quantities', () => {
  for (const value of [
    '',
    'Farinha',
    'Farinha -1',
    'Farinha 0',
    'Farinha 1.5',
    'Farinha 1,5',
    'Farinha 9007199254740992',
    '@everyone 10',
    '``` 10',
    '10 10',
  ]) {
    assert.throws(() => core.parseMovement(value), core.InventoryError, value);
  }
});

test('normalizes names and preserves zero balances', () => {
  const items = [{ name: 'Farinha de trigo', qty: 10 }];
  assert.deepEqual(
    core.applyMovement(items, [{ name: ' FARINHA  de trigo ', qty: 10 }], 'remove'),
    [{ name: 'Farinha de trigo', qty: 0 }],
  );
  assert.equal(items[0].qty, 10);
});

test('capitalizes new item names and combines case and whitespace variants', () => {
  const result = core.applyMovement(
    [],
    core.parseMovement('farinha 2\nFARINHA 3\nFaRiNhA 4\nFARINHA   DE TRIGO 5'),
    'add',
  );
  assert.deepEqual(result, [
    { name: 'Farinha', qty: 9 },
    { name: 'Farinha de trigo', qty: 5 },
  ]);
});

test('matches accentless input and preserves or learns accented spelling', () => {
  const added = core.applyMovement([], core.parseMovement('acucar 3\nAÇÚCAR 4'), 'add');
  assert.deepEqual(added, [{ name: 'Açúcar', qty: 7 }]);
  assert.deepEqual(core.applyMovement(added, core.parseMovement('acucar 2'), 'remove'), [
    { name: 'Açúcar', qty: 5 },
  ]);
  assert.equal(core.itemKey('AC\u0327U\u0301CAR'), core.itemKey('Açúcar'));
});

test('consolidates existing variants without losing quantities or merging different items', async () => {
  saved.items = [
    { name: 'acucar', qty: 2 },
    { name: 'AÇÚCAR', qty: 3 },
    { name: 'farinha de trigo', qty: 4 },
    { name: 'farinha de milho', qty: 5 },
  ];
  await handler.execute(null, message('merge', 'acucar 1', 'out'));
  assert.deepEqual(saved.items, [
    { name: 'Farinha de milho', qty: 5 },
    { name: 'Açúcar', qty: 4 },
    { name: 'Farinha de trigo', qty: 4 },
  ]);
});

test('normalization rejects merged overflow without mutating the original data', () => {
  const items = [
    { name: 'farinha', qty: Number.MAX_SAFE_INTEGER },
    { name: 'FARINHA', qty: 1 },
  ];
  assert.throws(() => core.normalizeInventory(items), /limite/);
  assert.equal(items[0].name, 'farinha');
});

test('validates repeated withdrawals together without changing the original balance', () => {
  const items = [{ name: 'Farinha', qty: 10 }];
  assert.throws(
    () => core.applyMovement(items, core.parseMovement('Farinha 6\nfarinha 6'), 'remove'),
    /Saldo insuficiente/,
  );
  assert.equal(items[0].qty, 10);
});

test('rejects arithmetic overflow and oversized panels', () => {
  assert.throws(() =>
    core.applyMovement(
      [{ name: 'Farinha', qty: Number.MAX_SAFE_INTEGER }],
      [{ name: 'Farinha', qty: 1 }],
      'add',
    ),
  );
  assert.throws(
    () =>
      core.formatInventory(
        Array.from({ length: 100 }, (_, index) => ({
          name: `Item ${index} nome comprido`,
          qty: 1,
        })),
      ),
    /tamanho do painel/,
  );
});

test('entry and exit messages update the saved panel and audit history', async () => {
  const entry = message('one', 'Farinha 10\nMadeira 20');
  await handler.execute(null, entry);
  const exit = message('two', 'Farinha 4', 'out');
  await handler.execute(null, exit);
  assert.deepEqual(saved.items, [
    { name: 'Madeira', qty: 20 },
    { name: 'Farinha', qty: 6 },
  ]);
  assert.equal(saved.movements.length, 2);
  assert.equal(saved.movements[0].user_id, 'user');
  assert.equal(saved.movements[1].kind, 'remove');
  assert.equal(entry.reactions.length, 1);
  assert.equal(exit.reactions.length, 1);
  assert.equal(edits.length, 2);
  assert.equal(sends.length, 0);
});

test('entry and withdrawal reorder stock by descending quantity with alphabetical ties', async () => {
  await handler.execute(null, message('sort-add', 'Farinha 10\nMadeira 20\nArroz 10'));
  assert.deepEqual(saved.items.map(item => item.name), ['Madeira', 'Arroz', 'Farinha']);
  await handler.execute(null, message('sort-remove', 'Madeira 15', 'out'));
  assert.deepEqual(saved.items.map(item => item.name), ['Arroz', 'Farinha', 'Madeira']);
  const panel = edits.at(-1).content;
  assert.ok(panel.indexOf('Arroz') < panel.indexOf('Farinha'));
  assert.ok(panel.indexOf('Farinha') < panel.indexOf('Madeira'));
});

test('panel sorts legacy stock without mutating its input', () => {
  const items = [{ name: 'Farinha', qty: 0 }, { name: 'Madeira', qty: 30 }];
  const panel = core.formatInventory(items);
  assert.ok(panel.indexOf('Madeira') < panel.indexOf('Farinha'));
  assert.equal(items[0].name, 'Farinha');
});

test('duplicate event reloads persisted ID without reapplying balance', async () => {
  await handler.execute(null, message('one', 'Farinha 10'));
  await handler.execute(null, message('one', 'Farinha 999'));
  assert.equal(saved.items[0].qty, 10);
  assert.equal(saved.movements.length, 1);
});

test('simultaneous movements are serialized', async () => {
  await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      handler.execute(null, message(String(index), 'Farinha 1')),
    ),
  );
  assert.equal(saved.items[0].qty, 10);
  assert.equal(saved.movements.length, 10);
});

test('one invalid line or insufficient balance rejects the whole message', async () => {
  saved.items = [{ name: 'Farinha', qty: 10 }];
  for (const content of ['Farinha 2\nMadeira 1', 'Farinha 2\ntexto invalido']) {
    const value = message(content, content, 'out');
    await handler.execute(null, value);
    assert.equal(saved.items[0].qty, 10);
    assert.equal(saved.movements.length, 0);
    assert.equal(value.replies.length, 1);
    assert.equal(value.reactions.length, 0);
  }
});

test('ignores other channels, bots, webhooks, system messages and DMs', async () => {
  const ignored = [
    message('other', 'Farinha 10', 'other'),
    { ...message('bot', 'Farinha 10'), author: { bot: true } },
    { ...message('webhook', 'Farinha 10'), webhookId: 'webhook' },
    { ...message('system', 'Farinha 10'), system: true },
    { ...message('dm', 'Farinha 10'), guild: null },
  ];
  for (const value of ignored) await handler.execute(null, value);
  assert.equal(saved.movements.length, 0);
  assert.equal(edits.length, 0);
});

test('persistence failure does not edit the panel or confirm success', async () => {
  mock.method(storage, 'writeBackup', () => {
    throw new Error('disk full');
  });
  const value = message('one', 'Farinha 10');
  await handler.execute(null, value);
  assert.equal(saved.items.length, 0);
  assert.equal(edits.length, 0);
  assert.equal(value.reactions.length, 0);
  assert.match(value.replies[0].content, /Falha/);
});

test('panel failure preserves movement and reports saved status; replay repairs without doubling', async () => {
  channel.messages.fetch = async () => {
    throw new Error('Discord offline');
  };
  const value = message('one', 'Farinha 10');
  await handler.execute(null, value);
  assert.equal(saved.items[0].qty, 10);
  assert.match(value.replies[0].content, /Movimentacao salva/);
  assert.equal(value.reactions.length, 0);
  channel.messages.fetch = async () => ({ edit: async (payload) => edits.push(payload) });
  await handler.execute(null, value);
  assert.equal(saved.items[0].qty, 10);
  assert.equal(value.reactions.length, 1);
});

test('deleted panel is recreated only in the configured stock channel', async () => {
  const fetched = [];
  guild.channels.fetch = async (id) => {
    fetched.push(id);
    return channel;
  };
  channel.messages.fetch = async () => {
    throw Object.assign(new Error('Unknown Message'), { code: 10008 });
  };
  await handler.execute(null, message('one', 'Farinha 10'));
  assert.deepEqual(fetched, ['panel']);
  assert.equal(saved.message_id, 'replacement');
  assert.equal(sends.length, 1);
});

test('requires a panel before recording movements', async () => {
  delete saved.channel_id;
  const value = message('one', 'Farinha 10');
  await handler.execute(null, value);
  assert.match(value.replies[0].content, /stock start/);
  assert.equal(saved.movements.length, 0);
});

test('configuration persists channels and rejects overlap', async () => {
  await command.execute(interaction('set-add', 'new-in'));
  assert.equal(saved.add_channel_id, 'new-in');
  const conflicting = interaction('set-remove', 'new-in');
  await command.execute(conflicting);
  assert.equal(saved.remove_channel_id, 'out');
  assert.match(conflicting.replies[0].content, /distintos/);
  const panelConflict = interaction('start', 'new-in');
  await command.execute(panelConflict);
  assert.equal(saved.channel_id, 'panel');
});

test('configuration requires Manage Server and bot channel permissions', async () => {
  const denied = interaction('set-add', 'new-in', false);
  await command.execute(denied);
  assert.equal(saved.add_channel_id, 'in');
  assert.match(denied.replies[0].content, /Gerenciar Servidor/);
  channel.permissionsFor = () => ({ has: () => false });
  const missing = interaction('set-add', 'new-in');
  await command.execute(missing);
  assert.equal(saved.add_channel_id, 'in');
  assert.match(missing.replies[0].content, /O bot precisa/);
});

test('local legacy data takes priority and gets an empty history', async () => {
  delete saved.movements;
  mock.method(db, 'getInventory', () => {
    throw new Error('should not query DB');
  });
  const loaded = await service.loadInventory('guild');
  assert.deepEqual(loaded.movements, []);
  assert.equal(loaded.channel_id, 'panel');
});

test('imports database-only stock and refuses to silently reset during an outage', async () => {
  saved = null;
  mock.method(db, 'getInventory', async () => ({
    items: [{ name: 'Farinha', qty: 20 }],
    channel_id: 'old-panel',
    message_id: 'old-message',
  }));
  assert.equal((await service.loadInventory('guild')).items[0].qty, 20);
  mock.method(db, 'getInventory', async () => {
    throw new Error('DB offline');
  });
  await assert.rejects(service.loadInventory('guild'), /Sem estoque local/);
});

test('rejected queued operation does not block following work', async () => {
  await assert.rejects(
    service.withInventoryLock('guild', async () => {
      throw new Error('failed');
    }),
  );
  assert.equal(await service.withInventoryLock('guild', async () => 'ok'), 'ok');
});

test('command payload includes required text channel options', () => {
  const payload = command.data.toJSON();
  for (const name of ['set-add', 'set-remove']) {
    const option = payload.options.find((item) => item.name === name).options[0];
    assert.equal(option.name, 'canal');
    assert.equal(option.required, true);
    assert.deepEqual(option.channel_types, [ChannelType.GuildText]);
  }
});

test('file writes preserve other guilds and replace the complete file atomically', () => {
  mock.method(fs, 'existsSync', () => true);
  mock.method(fs, 'readFileSync', () =>
    JSON.stringify({ other: { items: [{ name: 'Madeira', qty: 5 }] } }),
  );
  const writes = [],
    renames = [];
  mock.method(fs, 'writeFileSync', (target, content) => writes.push({ target, content }));
  mock.method(fs, 'renameSync', (from, to) => renames.push({ from, to }));
  originalWriteBackup('guild', saved);
  assert.equal(writes.length, 1);
  assert.match(writes[0].target, /inventories\.json\.tmp$/);
  assert.equal(JSON.parse(writes[0].content).other.items[0].qty, 5);
  assert.deepEqual(JSON.parse(writes[0].content).guild, saved);
  assert.equal(renames[0].from, writes[0].target);
  assert.match(renames[0].to, /inventories\.json$/);
});

test('corrupt storage never gets silently replaced by empty stock', () => {
  mock.method(fs, 'existsSync', () => true);
  const write = mock.method(fs, 'writeFileSync', () => {});
  for (const data of ['', '{broken', 'null', '[]']) {
    mock.method(fs, 'readFileSync', () => data);
    assert.throws(() => originalWriteBackup('guild', saved));
  }
  assert.equal(write.mock.callCount(), 0);
});

test('failed file replacement is surfaced to the caller', () => {
  mock.method(fs, 'existsSync', () => true);
  mock.method(fs, 'readFileSync', () => '{}');
  mock.method(fs, 'writeFileSync', () => {});
  mock.method(fs, 'renameSync', () => {
    throw new Error('access denied');
  });
  assert.throws(() => originalWriteBackup('guild', saved), /access denied/);
});
