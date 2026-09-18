import fs from 'fs';
import path from 'path';

const dataDir = path.join(__dirname, '..', '..', 'data');
const inventoriesFile = path.join(dataDir, 'inventories.json');

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

export function readAllBackups(): Record<string, any> {
  try {
    ensureDir();
    if (!fs.existsSync(inventoriesFile)) return {};
    const raw = fs.readFileSync(inventoriesFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Arquivo de estoque invalido. Restaure o backup antes de continuar.');
    }
    return parsed;
  } catch (err) {
    console.error('Failed to read backups', err);
    throw err;
  }
}

export function readBackup(guildId: string) {
  const all = readAllBackups();
  return all[guildId] || null;
}

export function writeBackup(guildId: string, data: any) {
  try {
    ensureDir();
    const all = readAllBackups();
    all[guildId] = data;
    const temporaryFile = `${inventoriesFile}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(all, null, 2), 'utf8');
    fs.renameSync(temporaryFile, inventoriesFile);
  } catch (err) {
    console.error('Failed to write backup', err);
    throw err;
  }
}
