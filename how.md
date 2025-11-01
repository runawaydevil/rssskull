# Como o Sistema RSS Skull Funciona

## Visão Geral

O RSS Skull é um bot do Telegram que monitora feeds RSS e notifica os usuários sobre novos itens. O sistema foi projetado para ser altamente resiliente e nunca parar de funcionar, mesmo em caso de erros ou falhas.

## Arquitetura do Sistema

### Componentes Principais

1. **Bot Service** (`src/bot/bot.service.ts`)
   - Gerencia a comunicação com o Telegram
   - Processa comandos e mensagens
   - Gerencia o polling do Telegram API

2. **Feed Queue Service** (`src/jobs/feed-queue.service.ts`)
   - Gerencia filas de verificação de feeds RSS
   - Usa BullMQ com Redis para processamento assíncrono
   - Agenda verificações recorrentes de feeds

3. **Job Service** (`src/jobs/job.service.ts`)
   - Gerencia workers para processamento de jobs
   - Conecta-se ao Redis para filas
   - Processa jobs de verificação de feeds e envio de mensagens

4. **Database Service** (`src/database/database.service.ts`)
   - Gerencia conexão com SQLite (via Prisma)
   - Armazena feeds, configurações e estado

5. **Resilience System** (`src/resilience/`)
   - Sistema de resiliência para Telegram API
   - Circuit breakers, retry logic, filas de mensagens
   - Monitoramento de saúde da conexão

## Prevenção de Saída do Processo

### O Problema

Anteriormente, o processo Node.js podia sair silenciosamente após algum tempo, deixando apenas o Redis rodando. Isso acontecia porque:

1. Event loop vazio - quando não havia mais tarefas assíncronas pendentes
2. Promises não tratadas - causando crashes silenciosos
3. Erros não capturados - fazendo o processo terminar

### A Solução Implementada

#### 1. Loop Infinito de Keep-Alive

O sistema implementa **3 intervalos permanentes** que nunca são limpos (exceto durante graceful shutdown):

```typescript
// Intervalo primário - a cada 5 segundos
setInterval(() => {
  if (!gracefulShutdownFlag) {
    process.memoryUsage(); // Mantém event loop ativo
  }
}, 5000);

// Intervalo de heartbeat - a cada 30 segundos
setInterval(() => {
  // Loga status e mantém processo vivo
}, 30000);

// Intervalo de segurança - a cada 10 segundos
setInterval(() => {
  // Operação assíncrona adicional
}, 10000);
```

Estes intervalos garantem que **o event loop nunca fique vazio**, prevenindo que o processo saia automaticamente.

#### 2. Prevenção Real de Saída

O sistema intercepta o evento `beforeExit` e **previne ativamente** a saída:

```typescript
process.on('beforeExit', (code) => {
  if (gracefulShutdownFlag) {
    return; // Permite saída apenas em graceful shutdown
  }
  
  // PREVINE SAÍDA criando novas tarefas assíncronas
  setImmediate(() => { /* ... */ });
  setTimeout(() => { /* ... */ }, 0);
  process.nextTick(() => { /* ... */ });
});
```

Isso cria novas tarefas no event loop sempre que o Node.js tenta sair, mantendo o processo vivo.

#### 3. Tratamento de Promises

Todas as promises não tratadas são capturadas e **nunca causam saída**:

```typescript
process.on('unhandledRejection', (reason, promise) => {
  // Intercepta e trata - NÃO permite que o processo saia
  errorRecoveryService.interceptUnhandledRejection(error, promise);
  // Processo continua rodando
});
```

A função `safeAsync()` envolve operações críticas para garantir que nunca haja promises não tratadas.

#### 4. Bootstrap com Retry

Se o bootstrap falhar, o sistema tenta novamente com backoff exponencial:

```typescript
async function bootstrapWithRetry() {
  let attempt = 0;
  let delay = 5000;
  
  while (attempt < MAX_BOOTSTRAP_ATTEMPTS) {
    try {
      await bootstrap();
      return; // Sucesso
    } catch (error) {
      // Retry com backoff exponencial
      delay = Math.min(delay * 2, 60000);
    }
  }
  
  // Mesmo se todas as tentativas falharem, o processo permanece vivo
  setupKeepAlive();
}
```

## Service Watchdog

O sistema inclui um **watchdog** que monitora continuamente os serviços críticos:

```typescript
class ServiceWatchdog {
  // Verifica saúde dos serviços a cada 30 segundos
  checkServicesHealth() {
    // Verifica: Database, Redis, Server, Bot Polling
    // Se algum falhar 3 vezes consecutivas, tenta recuperar
  }
}
```

### Serviços Monitorados

1. **Database** - Verifica conexão e health check
2. **Redis** - Verifica conexão e ping
3. **HTTP Server** - Verifica se está escutando
4. **Bot Polling** - Verifica se o polling está ativo

### Recuperação Automática

Se um serviço falhar:
- Tenta reconectar automaticamente (Redis, Database)
- Reinicia o polling do bot se necessário
- Loga todos os eventos para diagnóstico

## Monitoramento do Bot Polling

O sistema verifica continuamente se o polling do Telegram está ativo:

```typescript
async isPollingActive(): Promise<boolean> {
  // Tenta obter informações do bot
  await this.bot.api.getMe();
  return true; // Se funcionar, polling está ativo
}

async restartPollingIfNeeded(): Promise<boolean> {
  // Para o polling existente
  // Limpa webhooks
  // Reinicia com grammY Runner ou polling padrão
}
```

O watchdog chama este método automaticamente se detectar que o polling parou.

## Sistema de Resiliência

### Componentes

1. **Connection Manager**
   - Monitora estado da conexão com Telegram
   - Persiste estado de conexão no banco
   - Detecta desconexões e tenta reconectar

2. **Circuit Breaker**
   - Previne chamadas excessivas quando API está instável
   - Abre/fecha automaticamente baseado em falhas

3. **Message Queue**
   - Enfileira mensagens quando API falha
   - Processa fila quando API volta a funcionar
   - Prioriza mensagens importantes

4. **Health Monitor**
   - Monitora métricas de saúde
   - Detecta padrões de falha
   - Gera alertas quando necessário

## Fluxo de Processamento

### 1. Inicialização

```
bootstrapWithRetry()
  ↓
bootstrap()
  ↓
- Inicializa Database
- Inicia HTTP Server (Fastify)
- Inicializa Redis Connection
- Inicia Bot Service
- Carrega feeds do banco
- Agenda verificações recorrentes
  ↓
setupKeepAlive() - CRÍTICO: mantém processo vivo
watchdog.start() - Monitora serviços
```

### 2. Processamento de Feeds

```
Feed Queue Service
  ↓
Agenda job recorrente (ex: a cada 5 minutos)
  ↓
Worker processa job
  ↓
Fetch RSS feed
  ↓
Detecta novos itens
  ↓
Cria jobs de notificação
  ↓
Message Sender Processor
  ↓
Envia mensagens via Telegram
```

### 3. Tratamento de Erros

```
Erro ocorre
  ↓
Error Recovery Service intercepta
  ↓
Classifica erro (recoverable/non-recoverable)
  ↓
Se recoverable: agenda retry
  ↓
Se non-recoverable: apenas loga
  ↓
Processo CONTINUA rodando (não sai)
```

## Logs e Monitoramento

### Heartbeat

A cada 30 segundos, o sistema loga:

```
💓 HEARTBEAT - Process running for X minutes, Memory: YMB, PID: Z
```

Isso confirma que o processo está vivo e ativo.

### Logs de Status

- `🔒 Keep-alive setup complete` - Confirma que keep-alive está ativo
- `💓 HEARTBEAT` - Processo está vivo
- `⚠️ BEFORE EXIT DETECTED` - Tentativa de saída foi prevenida
- `🛑 GRACEFUL SHUTDOWN INITIATED` - Shutdown intencional iniciado

### Endpoints HTTP

- `GET /health` - Health check completo (usado pelo Docker)
- `GET /stats` - Estatísticas gerais do sistema
- `GET /resilience-stats` - Status do sistema de resiliência
- `GET /metrics` - Métricas detalhadas

## Docker e Deploy

### Configuração Docker Compose

```yaml
restart: always  # Sempre reinicia se falhar
healthcheck:
  interval: 30s
  timeout: 10s
  retries: 10
  start_period: 60s
```

### Restart Policy

- **`restart: always`** - Docker sempre reinicia o container se ele parar
- Healthcheck verifica se o serviço está respondendo
- Se healthcheck falhar 10 vezes consecutivas, Docker reinicia

## Graceful Shutdown

O processo só sai quando há um **shutdown graceful explícito**:

1. Recebe SIGINT ou SIGTERM
2. Define `gracefulShutdownFlag = true`
3. Para todos os intervalos de keep-alive
4. Para watchdog e serviços
5. Para bot, fecha conexões
6. Fecha HTTP server
7. Desconecta database
8. **Agora sim** chama `process.exit(0)`

## Por Que o Sistema Não Para Mais

1. **Múltiplos intervalos** mantêm o event loop permanentemente ativo
2. **Interceptação de beforeExit** previne saídas não intencionais
3. **Tratamento de promises** previne crashes silenciosos
4. **Retry automático** recupera de falhas temporárias
5. **Watchdog** monitora e reinicia serviços automaticamente
6. **Docker restart policy** garante reinício se o container parar
7. **Logs verbosos** facilitam diagnóstico

## Troubleshooting

### Processo ainda está parando?

1. Verifique logs para `BEFORE EXIT DETECTED` - deve prevenir
2. Verifique se `keep-alive setup complete` apareceu nos logs
3. Verifique heartbeat a cada 30 segundos
4. Verifique se há erros não tratados nos logs

### Serviços não estão funcionando?

1. Watchdog deve detectar e tentar recuperar
2. Verifique logs do watchdog para tentativas de recuperação
3. Health check endpoint (`/health`) mostra status de cada serviço

### Bot não está respondendo?

1. Watchdog verifica polling a cada 30 segundos
2. Se polling parar, tenta reiniciar automaticamente
3. Verifique logs para `Bot polling is not active - attempting restart`

## Conclusão

Este sistema foi projetado para ser **extremamente resiliente**. Através de múltiplas camadas de proteção (keep-alive, interceptação de eventos, tratamento de erros, watchdog, Docker restart), o processo deve **nunca sair silenciosamente**. Se algo der errado, o sistema tenta recuperar automaticamente ou permanece vivo para intervenção manual.

