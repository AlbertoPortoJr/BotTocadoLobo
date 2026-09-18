import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../../types/Command';
import {
  loadInventory,
  publishFinance,
  stockChannel,
  withInventoryLock,
} from '../../services/inventory';
import { InventoryError } from '../../utils/inventory';
import { assertDistinctChannel, parseMoney } from '../../utils/finance';
import { writeBackup } from '../../utils/storage';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('financeiro')
    .setDescription('Configura o financeiro, compras e vendas')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Configura ou sincroniza o painel financeiro')
        .addChannelOption((o) =>
          o
            .setName('canal')
            .setDescription('Canal do painel financeiro')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((o) =>
          o
            .setName('saldo-inicial')
            .setDescription('Obrigatorio na primeira configuracao. Exemplo: 1.000,00'),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('set-compras')
        .setDescription('Define o chat de compras')
        .addChannelOption((o) =>
          o
            .setName('canal')
            .setDescription('Canal das compras')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('set-vendas')
        .setDescription('Define o chat de vendas')
        .addChannelOption((o) =>
          o
            .setName('canal')
            .setDescription('Canal das vendas')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: 'Use em um servidor com a permissao Gerenciar Servidor.',
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const response = await withInventoryLock(guild.id, async () => {
        const inventory = await loadInventory(guild.id);
        const sub = interaction.options.getSubcommand();
        if (sub === 'set-compras' || sub === 'set-vendas') {
          const key = sub === 'set-compras' ? 'purchase_channel_id' : 'sale_channel_id';
          const id = interaction.options.getChannel('canal', true).id;
          assertDistinctChannel(inventory, key, id);
          await stockChannel(guild, id, true);
          inventory[key] = id;
          writeBackup(guild.id, inventory);
          return `Canal de ${sub === 'set-compras' ? 'compras' : 'vendas'} definido: <#${id}>. Use: Farinha 10 25,00 (valor total da linha).`;
        }
        if (sub !== 'start') throw new InventoryError('Subcomando invalido.');
        const initial = interaction.options.getString('saldo-inicial');
        if (inventory.finance && initial !== null)
          throw new InventoryError(
            'O saldo ja foi inicializado. Omita saldo-inicial para preservar o saldo atual.',
          );
        if (!inventory.finance && initial === null)
          throw new InventoryError(
            'Informe saldo-inicial na primeira configuracao, por exemplo: 1.000,00.',
          );
        const id =
          interaction.options.getChannel('canal')?.id ??
          inventory.finance?.channel_id ??
          interaction.channelId;
        assertDistinctChannel(inventory, 'finance', id);
        await stockChannel(guild, id);
        const cents = initial !== null ? parseMoney(initial) : 0;
        inventory.finance = inventory.finance
          ? {
              ...inventory.finance,
              channel_id: id,
              message_id:
                inventory.finance.channel_id === id ? inventory.finance.message_id : undefined,
            }
          : { channel_id: id, initial_cents: cents, balance_cents: cents };
        writeBackup(guild.id, inventory);
        try {
          await publishFinance(guild, inventory);
        } catch (error) {
          console.error('Painel financeiro pendente:', error);
          return 'Configuracao salva, mas o painel nao foi atualizado. Use /financeiro start sem saldo-inicial para sincronizar.';
        }
        return `Painel financeiro atualizado em <#${id}>.`;
      });
      await interaction.editReply({ content: response, allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('Erro no financeiro:', error);
      await interaction.editReply({
        content:
          error instanceof InventoryError
            ? error.message
            : 'Nao foi possivel concluir. Consulte os logs do bot.',
        allowedMentions: { parse: [] },
      });
    }
  },
};
export default command;
