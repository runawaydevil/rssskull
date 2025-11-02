# RSS Skull Bot - Docker Setup

Este documento explica como executar o RSS Skull Bot usando Docker.

## Pré-requisitos

- Docker Engine 20.10+
- Docker Compose 2.0+

## Configuração

1. **Criar arquivo `.env`** na raiz do projeto com as variáveis necessárias:

```bash
# Bot Configuration
BOT_TOKEN=seu_token_aqui

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379

# Database Configuration
DATABASE_URL=file:/app/data/production.db

# Reddit API Configuration (opcional)
REDDIT_CLIENT_ID=seu_client_id
REDDIT_CLIENT_SECRET=seu_client_secret
REDDIT_USERNAME=seu_username
REDDIT_PASSWORD=seu_password
USE_REDDIT_API=true
USE_REDDIT_JSON_FALLBACK=true

# Access Control
ALLOWED_USER_ID=seu_user_id_telegram
```

## Executar

### Desenvolvimento (com build local)

```bash
docker-compose up --build
```

### Produção (preservando dados)

```bash
# Atualizar sem perder dados
docker-compose up -d --build

# Limpar tudo e recriar (remove dados)
docker-compose down -v && docker-compose up -d --build
```

## Verificar Status

```bash
# Ver logs
docker-compose logs -f rss-skull-bot

# Ver status dos serviços
docker-compose ps

# Verificar saúde do bot
curl http://localhost:8916/health
```

## Volumes

Os seguintes volumes são criados para persistência:

- `app_data`: Dados do banco SQLite (`/app/data`)
- `backups_data`: Backups do banco (`/app/backups`)
- `redis_data`: Dados do Redis

## Variáveis de Ambiente

O `docker-compose.yml` suporta todas as variáveis de ambiente da aplicação. Consulte `app/config.py` para a lista completa.

## Troubleshooting

### Bot não inicia

1. Verifique os logs: `docker-compose logs rss-skull-bot`
2. Verifique se o Redis está rodando: `docker-compose ps redis`
3. Verifique as variáveis de ambiente: `docker-compose config`

### Redis não conecta

O bot aguarda o Redis estar pronto antes de iniciar (ver `docker-entrypoint.sh`).

### Problemas de permissão

O container roda como usuário não-root (`nodejs:1001`). Certifique-se de que os volumes têm as permissões corretas.

## Build Manual

```bash
# Build apenas a imagem
docker build -t rss-skull-bot:latest .

# Executar container manualmente
docker run -d \
  --name rss-skull-bot \
  -p 8916:8916 \
  -e BOT_TOKEN=seu_token \
  -e DATABASE_URL=file:/app/data/production.db \
  -v app_data:/app/data \
  rss-skull-bot:latest
```

