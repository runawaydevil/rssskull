# Telegram Resilience System

Sistema robusto de recuperação de erros e reconexão automática para o RSS Skull Bot, projetado especificamente para resolver problemas de conectividade com a API do Telegram (erros 502 Bad Gateway).

## 🎯 Funcionalidades Principais

### ✅ Recuperação Automática de Erros
- **Exponential Backoff**: 1s → 2s → 4s → 8s → 16s → 32s → 60s (máximo)
- **Jitter**: Previne thundering herd problem
- **Circuit Breaker**: Threshold de 5 falhas consecutivas
- **Retry Inteligente**: Até 30 minutos de tentativas antes de escalar

### ✅ Sistema de Fila de Mensagens Offline
- **Fila Híbrida**: Memória + persistência em banco SQLite
- **Prioridades**: LOW, NORMAL, HIGH, CRITICAL
- **Rate Limiting**: 20 mensagens por minuto
- **TTL**: 1 hora para mensagens
- **Capacidade**: Máximo de 1000 mensagens

### ✅ Monitoramento e Alertas
- **Health Monitoring**: Métricas de uptime/downtime
- **Alertas Automáticos**: Para problemas críticos (15+ min downtime)
- **Endpoints HTTP**: `/health`, `/resilience-stats`, `/metrics`
- **Persistência**: Métricas com retenção de 7 dias

### ✅ Logging Estruturado
- **Níveis**: ERROR (falhas), WARN (tentativas), INFO (recuperação), DEBUG (sucesso)
- **Contexto Completo**: Timestamps, códigos de erro, duração
- **Classificação**: Automática de tipos de erro (502, 429, 5xx, etc.)

## 🏗️ Arquitetura

```
src/resilience/
├── types.ts                    # Interfaces e tipos principais
├── error-classifier.ts         # Classificação automática de erros
├── resilience-handler.ts       # Handler principal de resiliência
├── connection-manager.ts       # Gerenciamento de estado da conexão
├── connection-persistence.ts   # Persistência do estado
├── exponential-backoff.ts     # Algoritmo de backoff com jitter
├── telegram-circuit-breaker.ts # Circuit breaker específico para Telegram
├── recovery-manager.ts        # Gerenciamento de recuperação adaptativa
├── message-queue.ts           # Fila de mensagens em memória
├── persistent-message-queue.ts # Fila com persistência
├── queue-processor.ts         # Processador de fila com rate limiting
├── health-monitor.ts          # Monitor de saúde do sistema
├── health-endpoints.ts        # Endpoints HTTP para monitoramento
├── config.ts                  # Sistema de configuração
└── index.ts                   # Exportações principais
```

## 🚀 Como Usar

### Integração Automática
O sistema é inicializado automaticamente no `BotService`:

```typescript
// Já integrado no bot.service.ts
await this.initializeResilienceSystem();
```

### Configuração via Variáveis de Ambiente

```bash
# Resilience Configuration
TELEGRAM_RESILIENCE_ENABLED=true
TELEGRAM_MAX_RETRIES=10
TELEGRAM_BASE_DELAY=1000
TELEGRAM_MAX_DELAY=60000
TELEGRAM_CIRCUIT_BREAKER_THRESHOLD=5
TELEGRAM_CIRCUIT_BREAKER_TIMEOUT=300000

# Message Queue Configuration
MESSAGE_QUEUE_MAX_SIZE=1000
MESSAGE_QUEUE_BATCH_SIZE=20
MESSAGE_QUEUE_PROCESSING_INTERVAL=5000
MESSAGE_QUEUE_MESSAGE_TTL=3600000

# Health Monitoring
HEALTH_CHECK_INTERVAL=30000
ALERT_THRESHOLD_ERROR_RATE=0.1
ALERT_THRESHOLD_DOWNTIME_MINUTES=15
```

### Endpoints de Monitoramento

#### `/health` - Status Geral
```json
{
  "status": "ok",
  "timestamp": "2025-10-29T01:30:00.000Z",
  "uptime": 3600000,
  "services": {
    "telegram": {
      "status": "connected",
      "errorRate": 0.02,
      "consecutiveFailures": 0
    },
    "messageQueue": {
      "status": "processing",
      "size": 5,
      "backlog": 5
    }
  }
}
```

#### `/resilience-stats` - Estatísticas Detalhadas
```json
{
  "timestamp": "2025-10-29T01:30:00.000Z",
  "overview": {
    "successRate": 0.98,
    "averageResponseTime": 250,
    "totalRequests": 1000,
    "failedRequests": 20
  },
  "connection": {
    "state": {
      "status": "connect