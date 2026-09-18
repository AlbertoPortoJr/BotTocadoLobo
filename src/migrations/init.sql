-- Initial schema for Discord bot

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

CREATE TABLE IF NOT EXISTS inventories (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL UNIQUE,
  channel_id TEXT,
  message_id TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP DEFAULT NOW()
);
