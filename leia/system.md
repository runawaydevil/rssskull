# RSS Skull Bot - Documentação do Sistema

## 📋 Visão Geral

O **RSS Skull Bot** é um bot moderno e de alta performance para Telegram que monitora feeds RSS e envia notificações em tempo real. Desenvolvido em TypeScript com Node.js, utiliza processamento paralelo com filas assíncronas para garantir eficiência e confiabilidade.

**Versão:** 0.2.2  
**Autor:** Pablo Murad ([@runawaydevil](https://github.com/runawaydevil))

---

## 🎯 O Que Este Bot Faz

### Funcionalidades Principais

1. **Monitoramento de Feeds RSS**
   - Verifica feeds RSS automaticamente a cada 10 minutos
   - Suporta Reddit, sites normais e descoberta automática de feeds
   - Conversão automática de URLs (ex: subreddit → RSS)

2. **Notificações em Tempo Real**
   - Envia notificações instantâneas quando novos items aparecem
   - Agrupa mensagens para evitar spam
   - Suporta grupos e canais do Telegram

3. **Filtros Inteligentes**
   - Filtros de inclusão/exclusão por palavras-chave
   - Suporte a regex
   - Aplicação automática aos feeds

4. **Múltiplos Idiomas**
   - Português e Inglês
   - Interface bilíngue completa

5. **Estatísticas e Monitoramento**
   - Health checks HTTP
   - Estatísticas de uso
   - Logs detalhados

---

## 🏗️ Arquitetura do Sistema

### Stack Tecnológica

- **Runtime:** Node.js 20+ (ESM)
- **Linguagem:** TypeScript
- **Bot API:** Grammy.js
- **Banco de Dados:** Prisma ORM + SQLite
- **Filas:** BullMQ + Redis
- **Server:** Fastify (health checks)
- **Deploy:** Docker + Docker Compose

### Estrutura de Diretórios

```
src/
├── bot/               # Bot Telegram
│   ├── commands/      # Comandos do bot
│   ├── handlers/      # Handlers de comandos
│   ├── middleware/    # Middleware (auth, i18n)
│   └── types/         # Tipos TypeScript
├── config/            # Configurações do sistema
├── database/          # Banco de dados (Prisma)
│   └── repositories/  # Camada de acesso a dados
├── jobs/              # Sistema de filas
│   └── processors/   # Processadores de jobs
├── services/          # Lógica de negócio
│   ├── feed.service.ts
│   ├── rss.service.ts
│   ├── parser.service.ts
│   └── notification.service.ts
└── utils/             # Utilitários diversos
```

---

## 🔄 Fluxo de Funcionamento

### 1. Adicionar um Feed (`/add`)

```
Usuário → /add nome https://reddit.com/r/pirataria
    ↓
Validação de URL
    ↓
Conversão de URL (Reddit → RSS)
    ↓
Validação do Feed
    ↓
Salva no Banco de Dados (sem lastItemId inicialmente)
    ↓
Agenda Verificação Recorrente (10 min)
    ↓
Confirmação para o Usuário
```

### 2. Verificação Periódica (a cada 10 min)

```
Feed Check Queue (BullMQ)
    ↓
Worker Pega Job da Fila
    ↓
Busca Feed no Banco de Dados
    ↓
RSS Service → Busca Feed RSS
    ↓
Parser Service → Detecta Novos Items
    ↓
Se Há Novos Items:
    ↓
Message Send Queue
    ↓
Worker Envia Mensagens
    ↓
Telegram API → Notifica Chat
    ↓
Atualiza lastItemId no Banco
```

### 3. Detecção de Novos Items

```typescript
// Lógica de detecção (rss.service.ts)

if (!lastItemId) {
  // Primeira vez - não processa nada, apenas salva referência
  return { items: [], lastItemIdToSave: firstItemId };
}

// Busca último item conhecido no feed
const lastItemIndex = items.findIndex(item => item.id === lastItemId);

if (lastItemIndex === -1) {
  // Item não encontrado - feed mudou
  // Para Reddit: retorna items da última hora
  // Para outros: retorna até 5 items mais recentes
}

if (lastItemIndex === 0) {
  // Ainda no item mais recente - não há novos
  return { items: [], firstItemId };
}

// Retorna apenas items antes do lastItemId
return { items: items.slice(0, lastItemIndex), firstItemId };
```

---

## 🗄️ Banco de Dados

### Schema Prisma

```prisma
model Chat {
  id          String   @id
  type        String   // 'private', 'group', 'channel'
  title       String?
  settings    ChatSettings?
  feeds       Feed[]
  statistics  Statistic[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Feed {
  id          String   @id @default(cuid())
  chatId      String
  name        String
  url         String   // URL original
  rssUrl      String   // URL convertida para RSS
  lastItemId  String?  // ID do último item processado
  enabled     Boolean  @default(true)
  filters     FeedFilter[]
  failures    Int      @default(0)
  lastCheck   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  chat        Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
  
  @@unique([chatId, name])
}

model ChatSettings {
  chatId           String   @id
  language         String   @default("en")
  checkInterval    Int      @default(120)
  maxFeeds         Int      @default(50)
  enableFilters    Boolean  @default(true)
  timezone         String   @default("America/Sao_Paulo")
  rateLimitEnabled Boolean  @default(true)
  maxRequestsPerMinute Int  @default(3)
  minDelayMs       Int      @default(200000)
  cacheEnabled     Boolean  @default(true)
  cacheTTLMinutes  Int      @default(20)
  retryEnabled     Boolean  @default(true)
  maxRetries       Int      @default(3)
  timeoutSeconds   Int      @default(10)
  
  chat             Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
}

model FeedFilter {
  id       String @id @default(cuid())
  feedId   String
  type     String // 'include', 'exclude'
  pattern  String
  isRegex  Boolean @default(false)
  
  feed     Feed   @relation(fields: [feedId], references: [id], onDelete: Cascade)
}

model Statistic {
  id        String   @id @default(cuid())
  chatId    String
  feedId    String?
  action    String   // 'message_sent', 'feed_added', 'feed_checked'
  count     Int      @default(1)
  date      DateTime @default(now())
  
  chat      Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
}
```

### Campos Importantes

#### Feed.lastItemId
- **Descrição:** ID do último item processado do feed
- **Uso:** Rastreamento de estado para detectar novos items
- **Atualização:** Sempre atualizado após cada verificação (mesmo sem novos items)
- **Problema Resolvido:** Antes não era atualizado quando não havia novos items, causando perda de notificações

#### Feed.lastCheck
- **Descrição:** Timestamp da última verificação
- **Uso:** Rastreamento de health do feed
- **Manutenção:** Auto-reset de feeds não verificados há 6+ horas

#### Feed.failures
- **Descrição:** Contador de falhas consecutivas
- **Uso:** Backoff exponencial em caso de erro
- **Reset:** Zero ao ter sucesso

---

## ⚙️ Componentes Principais

### 1. Bot Service (`bot.service.ts`)
- Gerencia o bot do Telegram
- Registra comandos e handlers
- Processa atualizações
- Rate limiting e segurança

### 2. Feed Service (`feed.service.ts`)
- Validação de URLs
- Conversão de URLs (Reddit, etc.)
- Descoberta automática de feeds
- Verificação de duplicatas

### 3. RSS Service (`rss.service.ts`)
- Fetching de feeds RSS
- Circuit breaker com retry
- Cache inteligente
- Normalização de formatos (RSS/Atom)
- Geração de IDs únicos

### 4. Parser Service (`parser.service.ts`)
- Detecção de novos items
- Deduplicação
- Ordenação por data
- Filtros de items
- **Critically:** Atualização correta do lastItemId

### 5. Notification Service (`notification.service.ts`)
- Formatação de mensagens
- Envio via Telegram API
- Agrupamento de mensagens
- Rate limiting

### 6. Job Service (`job.service.ts`)
- Gerenciamento de filas BullMQ
- Workers paralelos (5 workers por fila)
- Locks distribuídos (Redis)
- Health checks

### 7. Feed Queue Service (`feed-queue.service.ts`)
- Agendamento de verificações recorrentes
- Limpeza de jobs órfãos
- Auto-reset de feeds problemáticos
- Manutenção automática (30 min e 2 horas)

---

## 🔄 Sistema de Filas

### Filas BullMQ

1. **feed-check** (Verificação de Feeds)
   - **Workers:** 5 paralelos
   - **Intervalo:** 10 minutos por feed
   - **Processo:** Busca feed → Detecta novos → Atualiza banco

2. **message-send** (Envio de Mensagens)
   - **Workers:** 5 paralelos
   - **Prioridade:** Alta
   - **Retries:** 5 tentativas com backoff exponencial
   - **Processo:** Formata → Envia → Logs resultado

### Jobs Recorrentes

```typescript
// Padrão de job recorrente
{
  id: `recurring-feed-${feedId}`,
  repeat: { pattern: '*/10 * * * *' }, // A cada 10 minutos
  data: {
    feedId,
    chatId,
    feedUrl,
    lastItemId,
    failureCount: 0
  }
}
```

---

## 🛡️ Segurança e Confiabilidade

### Circuit Breaker
- Proteção contra falhas em cascata
- Retry automático com backoff exponencial
- Timeout configurável por feed

### Rate Limiting
- Limite por chat configurável
- Delay mínimo entre requests
- Throttling adaptativo

### Locks Distribuídos
- Prevenção de processamento duplicado
- Lock por feed durante verificação
- TTL de 1 minuto

### Cache Inteligente
- TTL adaptativo (20min padrão)
- Cache por URL
- Invalidação automática

### Validação de Segurança
- Filtro anti-spam (items com mais de 24h são bloqueados)
- Verificação de duplicatas
- Sanitização de URLs

---

## 📊 Fluxo de Dados Completo

```
┌─────────────────────────────────────────────────────────────┐
│                     USUÁRIO                                │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Bot Telegram (Grammy.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Comandos     │  │ Middleware   │  │ Handlers     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│             Feed Service / Feed Queue Service              │
│  • Validação   • Conversão   • Agendamento                │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Banco de Dados (SQLite)                  │
│  • Feeds   • ChatSettings   • Filters   • Statistics      │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Feed Check Queue                        │
│              (5 Workers Paralelos)                         │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 RSS Service + Parser                       │
│  • Fetch Feed   • Detect New Items   • Update State       │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Message Send Queue                       │
│              (5 Workers Paralelos)                         │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Notification Service                          │
│  • Format   • Group   • Send via Telegram                  │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 Telegram Chat                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎮 Comandos Disponíveis

### Comandos Básicos
- `/start` ou `/iniciar` - Iniciar o bot
- `/help` ou `/ajuda` - Mostrar ajuda
- `/ping` - Testar resposta do bot

### Gerenciamento de Feeds
- `/add <nome> <url>` ou `/adicionar` - Adicionar feed RSS
- `/list` ou `/listar` - Listar todos os feeds
- `/remove <nome>` ou `/remover` - Remover feed
- `/enable <nome>` ou `/habilitar` - Habilitar feed
- `/disable <nome>` ou `/desabilitar` - Desabilitar feed
- `/discover <url>` ou `/descobrir` - Descobrir feeds de um site

### Configurações
- `/settings` ou `/configuracoes` - Ver configurações do chat
- `/filters <nome>` ou `/filtros` - Gerenciar filtros do feed
- `/process` ou `/processar` - Processar manualmente todos os feeds
- `/stats` ou `/estatisticas` - Ver estatísticas

---

## 🔍 Debugging e Logs

### Níveis de Log

- **debug:** Informações detalhadas (requer LOG_LEVEL=debug)
- **info:** Informações gerais de operação
- **warn:** Avisos importantes
- **error:** Erros e falhas

### Logs Importantes

```
🔍 DEBUG: Feed detection and item processing
🔥 CREATING MESSAGE JOB: Job creation tracking
🔥 QUEUEING MESSAGE JOB: Job queuing tracking
🔥 PROCESSING MESSAGE JOB: Job processing tracking
📅 First item date: Item age tracking
⚠️ Refusing to send: Security filter trigger
```

### Ver Logs

```bash
# Docker
docker-compose logs -f rss-skull-bot

# Filtrar por tipo
docker-compose logs rss-skull-bot | grep "DEBUG"
docker-compose logs rss-skull-bot | grep "ERROR"
```

---

## 🐛 Problemas Conhecidos e Soluções

### Problema 1: Items Antigos Sendo Processados

**Causa:** Ao adicionar feed novo, o bot não tinha `lastItemId` e processava todos os items.

**Solução Implementada:**
- Primeira verificação retorna array vazio
- Salva `firstItemId` como referência
- Verificações seguintes só processam items realmente novos

### Problema 2: lastItemId Não Atualizado

**Causa:** Quando não havia novos items, o Prisma ignorava `undefined` e não atualizava o campo.

**Solução Implementada:**
- Sempre atualiza `lastItemId` mesmo sem novos items
- Usa `firstItemId` para manter sincronização com feed
- Método `updateLastCheck` lida corretamente com `undefined`

### Problema 3: Items Muito Antigos Sendo Enviados

**Causa:** Bug anterior permitia que items de 19+ horas fossem enviados.

**Solução Implementada:**
- Filtro de segurança bloqueia items com mais de 24 horas
- Log de idade dos items para debugging
- Warning explícito quando bloqueado

---

## 🔧 Manutenção Automática

### Tarefas Agendadas

1. **Limpeza de Jobs Órfãos** (30 min)
   - Remove jobs de feeds deletados
   - Limpa jobs com IDs inválidos

2. **Auto-Reset de Feeds Problemáticos** (30 min)
   - Reseta feeds não verificados há 6+ horas
   - Limpa `lastItemId` para forçar reprocessamento

3. **Limpeza Completa** (2 horas)
   - Limpeza profunda de todos os jobs
   - Reset de feeds stale (2h sem atualização)

### Prevenção de Duplicação

- Lock distribuído por feed durante verificação
- Flag `isMaintenanceRunning` para evitar execução simultânea
- Job IDs únicos para prevenir duplicação

---

## 📈 Performance

### Otimizações

- **Processamento Paralelo:** 5 workers por fila
- **Sharding:** Distribuição baseada em hash do feedId
- **Cache:** TTL adaptativo reduz requests redundantes
- **Batching:** Agrupamento de mensagens reduz chamadas API
- **Lazy Loading:** Database connection apenas quando necessário

### Limites Configuráveis

- `MAX_FEEDS_PER_CHAT`: 50 feeds por chat
- `RSS_CHECK_INTERVAL`: 300 segundos (10 min)
- `maxConcurrentWorkers`: 5 workers paralelos
- Cache TTL: 20 minutos (padrão)

---

## 🚀 Deploy

### Docker Compose

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    
  rss-skull-bot:
    build: .
    ports: ["8916:8916"]
    environment:
      - BOT_TOKEN=${BOT_TOKEN}
      - DATABASE_URL=file:/app/data/production.db
      - REDIS_HOST=redis
      - LOG_LEVEL=info
```

### Health Checks

- `http://localhost:8916/health` - Status geral
- `http://localhost:8916/cache-stats` - Estatísticas de cache
- `http://localhost:8916/user-agent-stats` - Stats de user agents

---

## 📝 Licença

MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

## 👨‍💻 Desenvolvedor

**Pablo Murad** - [@runawaydevil](https://github.com/runawaydevil)

📧 Email: runawaydevil@pm.me  
🐛 Issues: [GitHub Issues](https://github.com/runawaydevil/rssskull/issues)  
💬 Discussões: [GitHub Discussions](https://github.com/runawaydevil/rssskull/discussions)

---

**Versão do Documento:** 1.0  
**Última Atualização:** Outubro 2024

