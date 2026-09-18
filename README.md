# Discord TypeScript Bot

Bot Discord em TypeScript usando discord.js e PostgreSQL, pronto para Docker.

## Variáveis de ambiente
Copie `.env.example` para `.env` e preencha:

- `DISCORD_TOKEN` - Token do bot
- `CLIENT_ID` - ID da aplicação
- `GUILD_ID` - ID do servidor (para registro rápido de comandos)
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
npm run register # registra os comandos (usa GUILD_ID)
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
