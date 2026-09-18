import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

const pool = new Pool({
  connectionTimeoutMillis: 5000,
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
});

export async function initDb() {
  const migPath = path.join(__dirname, '..', 'migrations', 'init.sql');
  if (fs.existsSync(migPath)) {
    const sql = fs.readFileSync(migPath, 'utf8');
    // run migration file (may contain multiple statements)
    await pool.query(sql);
    return;
  }

  // fallback: create tables if migration file is not present
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventories (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL UNIQUE,
      channel_id TEXT,
      message_id TEXT,
      items JSONB DEFAULT '[]'::jsonb,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mod_logs (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export async function logModAction(guildId: string, action: string, targetId: string, moderatorId: string, reason?: string) {
  await pool.query(
    'INSERT INTO mod_logs (guild_id, action, target_id, moderator_id, reason) VALUES ($1,$2,$3,$4,$5)',
    [guildId, action, targetId, moderatorId, reason || null]
  );
}

export async function createTicket(guildId: string, channelId: string, userId: string) {
  const res = await pool.query(
    'INSERT INTO tickets (guild_id, channel_id, user_id, status) VALUES ($1,$2,$3,$4) RETURNING *',
    [guildId, channelId, userId, 'open']
  );
  return res.rows[0];
}

export async function closeTicket(channelId: string) {
  await pool.query('UPDATE tickets SET status=$1 WHERE channel_id=$2', ['closed', channelId]);
}

// Inventory functions
export async function getInventory(guildId: string) {
  const res = await pool.query('SELECT * FROM inventories WHERE guild_id=$1', [guildId]);
  return res.rows[0];
}

export async function createOrEnsureInventory(guildId: string) {
  const existing = await getInventory(guildId);
  if (existing) return existing;
  const res = await pool.query('INSERT INTO inventories (guild_id, items) VALUES ($1, $2) RETURNING *', [guildId, JSON.stringify([])]);
  return res.rows[0];
}

export async function setInventoryMessage(guildId: string, channelId: string, messageId: string) {
  await pool.query('UPDATE inventories SET channel_id=$1, message_id=$2, updated_at=NOW() WHERE guild_id=$3', [channelId, messageId, guildId]);
}

export async function updateInventoryItems(guildId: string, items: any[]) {
  await pool.query('UPDATE inventories SET items=$1, updated_at=NOW() WHERE guild_id=$2', [JSON.stringify(items), guildId]);
}

export default pool;
