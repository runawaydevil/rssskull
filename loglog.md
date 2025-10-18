# Comandos Docker para Logs do Reddit

## Sistema de Manutenção Automática

O bot agora possui um sistema de manutenção **completamente automático** que:

### 🔄 Auto-reset de Feeds Problemáticos
- **A cada 30 minutos**: Reseta feeds que não foram atualizados há 6+ horas
- **A cada 2 horas**: Reseta feeds que não foram atualizados há 2+ horas (limpeza mais agressiva)

### 🧹 Limpeza Automática de Jobs Órfãos
- **Na inicialização**: Remove todos os jobs órfãos
- **A cada 30 minutos**: Limpeza preventiva
- **A cada 2 horas**: Limpeza completa e abrangente

### 📊 Logs Importantes para Monitorar

- `🧹 Running scheduled maintenance tasks` - Manutenção a cada 30 min
- `🧹 Running thorough maintenance tasks` - Limpeza completa a cada 2h
- `🔄 Reset lastItemId for feed` - Feed sendo resetado automaticamente
- `🗑️ Removed orphaned job` - Job órfão sendo removido
- `✅ Thorough cleanup successful` - Sistema limpo e funcionando

## Comandos básicos para monitorar logs do bot

### Ver logs em tempo real (seguir)
```bash
docker logs -f rss-skull-bot
```

### Ver logs das últimas 100 linhas
```bash
docker logs --tail 100 rss-skull-bot
```

### Ver logs com timestamps
```bash
docker logs -f --timestamps rss-skull-bot
```

## Comandos específicos para Reddit

### Filtrar logs do Reddit
```bash
docker logs -f rss-skull-bot | grep reddit
```

### Ver logs de feeds específicos do Reddit
```bash
docker logs -f rss-skull-bot | grep -E "UsenetInvites|OpenSignups|portalidea"
```

### Ver logs de debug do Reddit (novos logs adicionados)
```bash
docker logs -f rss-skull-bot | grep -E "🔍|UsenetInvites|OpenSignups"
```

### Ver logs de duplicação (rastreamento)
```bash
docker logs -f rss-skull-bot | grep -E "🔥|📤|📰|📊"
```

### Ver logs de jobs órfãos
```bash
docker logs -f rss-skull-bot | grep -E "🧹|🗑️|orphaned|not found in database"
```

## Comandos para investigar problemas

### Ver logs das últimas 6 horas
```bash
docker logs --since 6h rss-skull-bot
```

### Ver logs de um período específico
```bash
docker logs --since 2h rss-skull-bot | grep reddit
```

### Ver logs de processamento de feeds
```bash
docker logs -f rss-skull-bot | grep -E "Feed check|new items|lastItemId"
```

### Ver logs de mensagens enviadas
```bash
docker logs -f rss-skull-bot | grep -E "TELEGRAM MESSAGE SENT|RSS BATCH"
```

## Comandos para salvar logs

### Salvar logs em arquivo
```bash
docker logs rss-skull-bot > logs.txt
```

### Salvar logs do Reddit em arquivo
```bash
docker logs rss-skull-bot | grep reddit > reddit-logs.txt
```

### Salvar logs de debug em arquivo
```bash
docker logs rss-skull-bot | grep -E "🔍|🔥|📤" > debug-logs.txt
```

## Comandos úteis para troubleshooting

### Ver logs de erro
```bash
docker logs rss-skull-bot | grep -E "ERROR|WARN"
```

### Ver logs de feeds não encontrados
```bash
docker logs rss-skull-bot | grep "not found in database"
```

### Ver logs de jobs duplicados
```bash
docker logs rss-skull-bot | grep "already being processed"
```

### Ver logs de manutenção automática
```bash
docker logs -f rss-skull-bot | grep -E "🧹|maintenance|scheduled|thorough"
```

### Ver logs de auto-reset de feeds problemáticos
```bash
docker logs -f rss-skull-bot | grep -E "🔄|auto-reset|problematic feeds"
```

### Ver logs de limpeza do Redis
```bash
docker logs rss-skull-bot | grep -E "🧹|cleanup|orphaned"
```

## Exemplo de uso para investigar problema específico

Para investigar por que o feed UsenetInvites não está detectando novos itens:

```bash
# 1. Ver logs em tempo real filtrados
docker logs -f rss-skull-bot | grep -E "UsenetInvites|🔍"

# 2. Ver logs das últimas 2 horas
docker logs --since 2h rss-skull-bot | grep UsenetInvites

# 3. Ver logs de debug específicos
docker logs rss-skull-bot | grep -E "🔍.*UsenetInvites"
```

## Logs importantes para monitorar

- `🔍 DEBUG:` - Logs de debug para investigar problemas
- `🔥 CREATING MESSAGE JOB` - Criação de jobs de mensagem
- `🔥 PROCESSING MESSAGE JOB` - Processamento de jobs
- `📤 TELEGRAM MESSAGE SENT` - Mensagens enviadas ao Telegram
- `📰 RSS BATCH SENDING` - Envio de lotes de RSS
- `🧹` - Limpeza de jobs órfãos
- `🗑️` - Remoção de jobs órfãos
- `Last item ID not found` - Problema com lastItemId
- `Feed not found in database` - Jobs órfãos
- `already being processed` - Jobs duplicados
