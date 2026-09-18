import { Events } from 'discord.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: any) {
    console.log(`Ready: ${client.user?.tag}`);
  }
};
