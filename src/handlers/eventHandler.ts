import fs from 'fs';
import path from 'path';

export function loadEvents(client: any) {
  const eventsPath = path.join(__dirname, '..', 'events');
  if (!fs.existsSync(eventsPath)) return;

  function walk(dir: string) {
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (file.endsWith('.ts') || file.endsWith('.js')) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const evt = require(full);
        const event = evt.default || evt;
        if (!event || !event.name || !event.execute) continue;
        if (event.once) client.once(event.name, (...args: any[]) => event.execute(client, ...args));
        else client.on(event.name, (...args: any[]) => event.execute(client, ...args));
      }
    }
  }

  walk(eventsPath);
}
