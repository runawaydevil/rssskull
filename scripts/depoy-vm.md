# Script de Deploy na VM

## No Servidor (VM)

Execute os seguintes comandos na VM onde o bot está rodando:

```bash
# 1. Entrar no diretório do projeto
cd /path/to/rssskull

# 2. Parar o container atual
docker compose down

# 3. Fazer pull do código mais recente
git fetch origin
git checkout main
git pull origin main

# 4. Rebuild da imagem Docker localmente (sem cache para garantir código novo)
docker compose build --no-cache

# 5. Subir o container novamente
docker compose up -d

# 6. Monitorar os logs
docker compose logs -f rss-skull-bot
```

## Alternativa: Usar Imagem do GHCR

Se preferir usar a imagem do GitHub Container Registry:

```bash
# 1. Parar o container atual
docker compose down

# 2. Fazer pull da imagem mais recente do GHCR
docker pull ghcr.io/runawaydevil/rss-skull-bot:latest

# 3. Subir o container (pegará a imagem mais recente)
docker compose up -d

# 4. Monitorar os logs
docker compose logs -f rss-skull-bot
```

## Verificar se Funcionou

Procure nos logs por estas mensagens indicando que está usando o código NOVO:

- ✅ "Content-Type:" (validação de Content-Type)
- ✅ "Response body snippet:" (snippet HTML de erro)
- ✅ "Reddit circuit breaker is open. Skipping fallback for r/..." (CB impedindo fallback)
- ❌ NÃO deve aparecer: "Reddit API 403 error: <body class=" sem usar clone

