# Discord TypeScript Bot

Bot Discord em TypeScript usando discord.js e PostgreSQL, pronto para Docker.

## Variáveis de ambiente
Copie `.env.example` para `.env` e preencha:

- `DISCORD_TOKEN` - Token do bot
- `CLIENT_ID` - ID da aplicação
- `GUILD_ID` - ID do servidor (para registro rápido de comandos)
- `NODE_ENV` - `development` no desenvolvimento ou `production` em produção
- `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE` - Postgres
- `MOD_LOG_CHANNEL_ID` - Canal de logs de moderação

## Comandos úteis
- `/ping` - Teste
- `/ban` - Banir usuário
- `/kick` - Expulsar usuário
- `/ticket` - Criar ticket
- `/close` - Fechar ticket

## Desenvolvimento
Instale dependências e rode em modo dev:

```bash
npm install
npm run deploy:commands # registra os comandos (usa GUILD_ID)
npm run dev
```

## Docker
Build e levantar com Docker Compose:

```bash
docker compose up --build
```

O serviço `db` roda o Postgres e `app` roda o bot.

## Observações
- Scripts de build/registro usam `ts-node-dev` para desenvolvimento. Em produção, rode `npm run build` e `npm start`.
- A pasta `src/db` já cria as tabelas básicas ao iniciar.

## Estoque por mensagens

No [Discord Developer Portal](https://discord.com/developers/applications), selecione o bot e habilite **Bot > Privileged Gateway Intents > Message Content Intent**. O código usa os intents Guilds, GuildMessages e MessageContent. Consulte a [documentação oficial sobre intents](https://docs.discord.com/developers/events/gateway#privileged-intents).

Depois de registrar os comandos e reiniciar o bot, configure:

```text
/stock start channel:#estoque-atual
/stock set-add canal:#entrada-de-itens
/stock set-remove canal:#saida-de-itens
```

Quem configura precisa de **Gerenciar Servidor**. Os três canais precisam ser distintos. O bot precisa de Ver Canal, Enviar Mensagens e Ler Histórico de Mensagens nos três canais, e Adicionar Reações nos canais de entrada e saída. Controle quem pode movimentar o estoque pela permissão de enviar mensagens nesses canais.

Envie uma mensagem no canal de entrada para somar, ou no de saída para retirar:

```text
Farinha de trigo 10
Madeira 25
5 Farinha de trigo
```

A quantidade pode vir antes ou depois do nome, inclusive misturando os formatos em uma mensagem. Se houver números separados nas duas pontas (`10 Tábua 2`), a linha será rejeitada por ambiguidade; nesse caso, use `Tábua 2 10`.

- Um item por linha, com quantidade inteira positiva no início ou no final. Nomes aparecem com a primeira letra maiúscula e as demais minúsculas. A busca ignora maiúsculas, acentos e espaços repetidos: `farinha`, `FARINHA` e `Farinha` são o mesmo item. A grafia acentuada é preservada quando conhecida (`acucar` encontra `Açúcar`). Duplicatas antigas com essas diferenças são unificadas somando os saldos na próxima movimentação ou `/stock start`. Não há correção automática de erros de digitação nem adivinhação de acentos de itens novos.
- A entrada cadastra itens novos. A saída exige item existente e saldo suficiente. Itens zerados continuam no painel.
- O painel é ordenado por quantidade, da maior para a menor, após cada entrada ou saída. Empates seguem a ordem alfabética em português.
- Todas as linhas são validadas juntas. Uma linha inválida ou saldo insuficiente rejeita a mensagem inteira.
- O bot confirma com uma reação de check após salvar e atualizar o painel. Erros são respondidos sem marcar usuários.
- Bots, webhooks, mensagens de sistema e outros canais são ignorados. Apenas mensagens novas recebidas pelo bot são processadas; não há busca retroativa de mensagens enviadas enquanto ele estava desligado.
- Editar ou apagar uma mensagem não desfaz a movimentação. Para corrigir, envie uma movimentação contrária.
- `/stock add` e `/stock remove` continuam disponíveis, mas apenas nos canais correspondentes, com as mesmas validações.
- Se a atualização do painel falhar depois de salvar, o bot avisa para não reenviar. `/stock start` sem canal sincroniza o painel configurado. Um painel apagado é recriado apenas no canal de estoque.

### Persistência e limites

O arquivo `data/inventories.json` é a fonte de verdade do estoque: guarda canais, painel, saldos e histórico com ID da mensagem/interação, autor, data, tipo e itens. Arquivos existentes são compatíveis. Se não houver estoque local para o servidor, a configuração consulta o PostgreSQL para importar o estoque antigo; se o banco estiver indisponível, a configuração é bloqueada para não criar um saldo vazio por engano.

Novas movimentações não atualizam a tabela legada `inventories`. Faça backup de `data/` e mantenha essa pasta persistente. Tickets e moderação continuam usando PostgreSQL. A gravação troca o arquivo por uma versão temporária completa; falhas de leitura ou escrita não são tratadas como sucesso. Não execute mais de uma instância do bot sobre o mesmo arquivo: a fila de movimentações é por servidor e por processo.

O ID de cada movimentação é salvo junto com o saldo para impedir reaplicação de eventos repetidos, inclusive após reiniciar. Uma nova mensagem com outro ID representa uma nova movimentação. O painel usa uma mensagem de até 2.000 caracteres; operações que excederiam esse limite são rejeitadas antes de salvar. O histórico local cresce com as movimentações.

## Financeiro, compras e vendas

Registre os novos comandos com `npm run deploy:commands` e reinicie o bot depois do build (`npm run build`). Com o painel de estoque configurado, use:

```text
/financeiro start canal:#financeiro saldo-inicial:1.000,00
/financeiro set-compras canal:#compras
/financeiro set-vendas canal:#vendas
```

Esses comandos exigem **Gerenciar Servidor**. Os canais de compras, vendas, financeiro, estoque, entrada e saída precisam ser distintos. O bot precisa das mesmas permissões dos canais de estoque, incluindo Adicionar Reações em compras e vendas. As permissões de enviar mensagens nesses chats controlam quem pode registrar operações.

Nos chats de compras e vendas, envie um item por linha:

```text
Farinha de trigo 10 25,50
2 Madeira 10,00
```

O último valor é o **total da linha**, não o preço unitário. Nesse exemplo, a operação soma 35,50. Não é necessário usar separadores especiais; o formato anterior com `|` também é aceito. Use valores positivos no formato brasileiro, com até duas casas decimais (`25`, `25,50`, `1.250,00` ou `R$ 25,50`).

- Compras adicionam os itens ao estoque e descontam o custo do financeiro. O saldo financeiro pode ficar negativo.
- Vendas retiram os itens do estoque e adicionam a receita. Estoque insuficiente ou qualquer linha inválida rejeita a mensagem inteira, sem alterar itens ou dinheiro.
- O financeiro exibe saldo inicial e saldo atual em uma mensagem Markdown no mesmo padrão do estoque. Ambos os painéis são atualizados após cada compra ou venda.
- Entradas e saídas comuns do estoque continuam sem movimentar dinheiro.
- O saldo inicial é informado apenas na primeira configuração. `/financeiro start` sincroniza o painel; com `canal`, muda sua localização preservando o saldo. Informar novamente `saldo-inicial` é rejeitado para evitar apagar o resultado das operações.
- Estoque, dinheiro e histórico são gravados juntos em `data/inventories.json`, com valores monetários em centavos e proteção contra eventos duplicados. Faça backup dessa pasta.
- Se a atualização de um painel falhar após salvar, não reenvie a operação: use `/stock start` e `/financeiro start` sem saldo inicial. Painéis apagados são recriados. Editar ou apagar mensagens não estorna operações; mensagens enviadas com o bot desligado não são importadas.

## Encomendas

Após registrar os comandos e reiniciar o bot, configure um canal de texto separado dos outros canais:

```text
/encomendas set-canal canal:#encomendas
```

O bot precisa de Ver Canal, Enviar Mensagens, Ler Histórico de Mensagens, Criar Tópicos Públicos e Enviar Mensagens em Tópicos. Quem pode enviar mensagens nesse canal pode cadastrar pedidos. Configuração, finalização e sincronização exigem **Gerenciar Servidor**.

Envie o pedido neste formato, em uma linha ou separando os itens por quebras de linha (o marcador `•` é opcional quando cada item está em sua própria linha):

```text
Pedido
10000 Canas de açucar
10000 Trigos
10000 Milhos
Total: 30000unidades
Valor: 0,17 Und
Local: Vet Strawberry
Telegrama: via dc
```

O bot verifica se o total corresponde à soma dos itens, salva o pedido e abre um tópico na mensagem original com seu resumo. O valor é **por unidade**: nesse exemplo, 30.000 × 0,17 = **5.100,00**. A abertura não altera o caixa.

Depois de receber o pagamento, execute **dentro do tópico**:

```text
/encomendas finalizar
```

Esse comando credita o total previsto no financeiro. Se o valor recebido for diferente, informe o total efetivamente pago:

```text
/encomendas finalizar valor-pago:5.000,00
```

- Configure o caixa com `/financeiro start` antes de finalizar. O valor pago deve ser positivo.
- A finalização salva o valor pago, responsável e data junto com o novo saldo, e atualiza o resumo do tópico e o painel financeiro. Finalizar novamente o mesmo pedido não repete o crédito.
- Encomendas não retiram itens automaticamente do estoque. Quando necessário, use o canal de saída ou `/stock remove`. **Não registre a mesma encomenda no chat de vendas**, pois isso lançaria uma segunda receita.
- Pedidos e pagamentos ficam em `data/inventories.json`, preservados após reiniciar. Trocar o canal de encomendas não impede finalizar os pedidos antigos nos respectivos tópicos.
- Se a criação do tópico ou a atualização das mensagens falhar, use `/encomendas sincronizar pedido:ID_DA_MENSAGEM_ORIGINAL`. Esse comando recupera a publicação sem adicionar pagamentos. Ele depende do canal e da mensagem original ainda existirem quando precisar criar o tópico.
- Mensagens inválidas não criam encomendas. Editar/apagar a mensagem original não altera nem estorna um pedido salvo; uma nova mensagem representa outro pedido. Não há importação de mensagens enviadas enquanto o bot estava desligado.

### Verificação local

```bash
npm run typecheck
npm test
```

Os testes usam canais simulados e armazenamento isolado, sem conectar ao Discord ou alterar o estoque real.
