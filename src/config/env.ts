import 'dotenv/config';

const required = [
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'GUILD_ID',
  'NODE_ENV'
] as const;

type RequiredKeys = typeof required[number];

const missing: string[] = [];
for (const k of required) {
  if (!process.env[k]) missing.push(k);
}

if (missing.length) {
  // do not print tokens
  // eslint-disable-next-line no-console
  console.error('Missing required environment variables:', missing.join(', '));
  // exit so user supplies .env
  process.exit(1);
}

const env = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN as string,
  CLIENT_ID: process.env.CLIENT_ID as string,
  GUILD_ID: process.env.GUILD_ID as string,
  NODE_ENV: (process.env.NODE_ENV as string) || 'development',
  PG_HOST: process.env.PG_HOST || 'localhost',
  PG_PORT: Number(process.env.PG_PORT || 5432),
  PG_USER: process.env.PG_USER || '',
  PG_PASSWORD: process.env.PG_PASSWORD || '',
  PG_DATABASE: process.env.PG_DATABASE || ''
} as const;

export default env;
