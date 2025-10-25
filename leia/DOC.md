# 📘 RSS Skull Bot - Documentação Técnica

## 🎯 Visão Geral

O **RSS Skull Bot** é um bot moderno e de alta performance para Telegram que monitora feeds RSS e envia notificações em tempo real. O sistema é desenvolvido com TypeScript, Node.js, e utiliza uma arquitetura robusta com Redis/BullMQ para processamento assíncrono.

**Versão Atual:** 0.2.2  
**Desenvolvedor:** Pablo Murad (@runawaydevil)  
**Licença:** MIT

---

## 🏗️ Arquitetura do Sistema

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Bot (Grammy)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Commands    │  │  Middleware  │  │   Handlers   │      │
│  │  (8 tipos)   │  │  (Auth, i18n)│  │ (Routing)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Services Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Feed Service │  │ RSS Service  │  │ Notification │      │
│  │              │  │              │  │   Service    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Reddit Service│  │Filter Service│  │Template Svc  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Job Queue (BullMQ)                         │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │Feed Checker  │  │MessageSender │                         │
│  │(5 workers)   │  │(5 workers)   │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Utilities Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Cache Service │  │User-Agent    │  │Rate Limiter  │      │
│  │              │  │Rotation      │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Circuit Breaker│  │Feed Interval │  │URL Converters│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Database (SQLite + Prisma)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │     Chat     │  │    Feed      │  │  Settings    │      │
│  │              │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Fluxo de Processamento

### 1. Adição de Feed

```
Usuário: /add Brasil https://reddit.com/r/brasil
    ↓
FeedService valida input
    ↓
ConverterService detecta Reddit
    ↓
Cria feed no database
    ↓
Schedule no BullMQ (intervalo: 6min para Reddit)
    ↓
Worker processa em background
```

### 2. Verificação de Feed (Job Processor)

```
Worker pega job da fila
    ↓
Rate Limiter: espera delay necessário
    ↓
Circuit Breaker: verifica se domínio está OK
    ↓
User-Agent Rotation: escolhe browser aleatório
    ↓
Cache Check: verifica se tem entrada válida
    ↓
HTTP Request com headers realistas
    ↓
Parse RSS/Atom/JSON Feed
    ↓
Detectar novos items (vs lastItemId)
    ↓
Aplicar filtros include/exclude
    ↓
Deduplicação (ItemDedupe table)
    ↓
Enviar notificações via Telegram
    ↓
Atualizar lastItemId e timestamps
```

---

## 🛡️ Proteções Anti-Bloqueio

### Problema: Reddit Bloqueia Requisições

O Reddit possui sistemas avançados de detecção de bots que bloqueiam requisições não-autenticadas quando identificam padrões suspeitos.

### Soluções Implementadas

#### 1. **User-Agent Rotation** (`user-agent.service.ts`)
- **7 perfis de navegadores reais**: Chrome, Firefox, Safari, Edge, Mobile
- **Sessões longas**: 20 minutos por sessão
- **Seleção aleatória**: sem padrões detectáveis
- **Headers completos**: Sec-Ch-Ua, Sec-Fetch-*, Accept-Language variado

```typescript
// Exemplo de headers gerados
{
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.reddit.com/r/brasil/',
  'Origin': 'https://www.reddit.com',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'DNT': '1'
}
```

#### 2. **Rate Limiting Inteligente** (`rate-limiter.service.ts`)
- **Limites por domínio**:
  - Reddit: 5 req/min, delay mínimo 5s
  - YouTube: 20 req/min, delay 2s
  - GitHub: 40 req/min, delay 1s
  - Default: 50 req/min, delay 0.5s
- **Exponential backoff** em caso de 429 errors
- **Delays adaptativos** baseados em histórico

#### 3. **Cache Inteligente** (`cache.service.ts`)
- **TTL variável por domínio**:
  - Reddit: 0ms (cache desabilitado, usa JSON API)
  - Hacker News: 5 min
  - YouTube: 15 min
  - GitHub: 60 min
  - Default: 20 min
- **Cache compartilhado**: 1 request serve N usuários
- **Conditional requests**: ETag e Last-Modified
- **Hit rate**: ~70-90% de cache hits

#### 4. **Circuit Breaker** (`circuit-breaker.service.ts`)
- **Estados**: CLOSED → OPEN → HALF_OPEN
- **Threshold adaptativo**: 5-20 falhas (baseado em performance)
- **Reset timeout**: 3 minutos
- **Slow response detection**: > 10 segundos
- **Monitoramento por domínio**: isola falhas

#### 5. **Reddit JSON API** (`reddit.service.ts`)
- **Detecção automática**: URLs com `.rss` são convertidas para JSON API
- **Delay adicional**: 2 segundos antes de cada requisição
- **Headers realistas**: sem User-Agent de bot
- **Monitoramento**: headers `X-Ratelimit-Remaining` e `X-Ratelimit-Reset`
- **Tratamento de 429**: respeita `Retry-After` header
- **Fallback automático**: se JSON falhar, usa RSS tradicional

---

## ⚙️ Configurações e Comportamentos

### Intervalos de Verificação

| Feed Type   | Interval (min) | Max Age (min) | Cache TTL |
|-------------|----------------|---------------|-----------|
| Reddit      | 6              | 90            | 0 (JSON)  |
| YouTube     | 10             | 1440          | 15        |
| GitHub      | 30             | 1440          | 60        |
| Hacker News | 5              | 1440          | 5         |
| Default     | 10             | 1440          | 20        |

### Processamento Paralelo

- **5 workers simultâneos** para feed checker
- **5 workers simultâneos** para message sender
- **Sharding**: hash-based por feedId
- **Jitter**: ±1 minuto para evitar thundering herd

### Deduplicação

- **ItemDedupe table**: armazena items já vistos
- **TTL**: 7 dias automático
- **IDs normalizados**: especialmente para Reddit (`reddit_xxx`)
- **Cleanup automático**: remove entradas expiradas

---

## 🔧 Comandos Disponíveis

### Comandos Básicos
- `/start` ou `/iniciar` - Iniciar o bot
- `/help` ou `/ajuda` - Mostrar ajuda
- `/ping` - Testar resposta do bot

### Gerenciamento de Feeds
- `/add <nome> <url>` - Adicionar feed RSS
- `/list` - Listar todos os feeds
- `/remove <nome>` - Remover feed
- `/enable <nome>` - Habilitar feed
- `/disable <nome>` - Desabilitar feed
- `/discover <url>` - Descobrir feeds de um site

### Configurações
- `/settings` - Ver configurações do chat
- `/filters <nome>` - Gerenciar filtros do feed
- `/process` - Processar manualmente todos os feeds

### Comandos Secretos/Debug
- `/stats` - Estatísticas de uso
- `/log` - Logs em tempo real
- `/loge` - Logs de erro
- `/resetdb` - Reset do database (admin)
- `/cbstats` - Circuit breaker stats

---

## 🐛 Problemas Conhecidos e Soluções

### 1. Reddit Bloqueio de Requisições

**Sintoma:**
```
You've been blocked by network security.
```

**Causa:**
- Reddit detecta padrões de requisições automatizadas
- User-Agent específico de bot identificado
- Rate limits excedidos

**Solução Implementada:**
1. ✅ User-Agent rotation com browsers reais
2. ✅ Delay adicional de 2s para Reddit JSON API
3. ✅ Headers realistas (Referer, Origin, Sec-Fetch-*)
4. ✅ Monitoramento de rate limits
5. ✅ Fallback automático para RSS tradicional

**Status:** Em observação - melhorias aplicadas mas ainda pode ocorrer bloqueios ocasionais

### 2. Migração de Banco de Dados

**Sintoma:**
```
The column main.Feed.lastNotifiedAt does not exist
```

**Causa:**
- Schema Prisma atualizado mas migrações não aplicadas
- Banco de dados SQLite desatualizado

**Solução:**
- Migração criada: `20251024174900_add_notification_timestamps`
- Docker Compose aplica migrações automaticamente no startup
- Comando: `npx prisma migrate deploy`

**Status:** ✅ Resolvido

### 3. Detecção de URLs Reddit com `.rss`

**Sintoma:**
```
Reddit JSON API não é usado para URLs com .rss
```

**Causa:**
- `isRedditUrl()` só detectava URLs que começavam com `/r/`
- Não detectava URLs como `reddit.com/r/brasil/.rss`

**Solução:**
```typescript
// Antes
urlObj.pathname.startsWith('/r/')

// Depois
urlObj.pathname.startsWith('/r/') || urlObj.pathname.includes('/r/')
```

**Status:** ✅ Resolvido

### 4. Orphaned Jobs no Redis

**Sintoma:**
- Jobs antigos acumulando no Redis
- Feeds removidos continuam sendo processados

**Solução:**
- Cleanup automático a cada 30 minutos
- Verificação de feeds existentes vs jobs no Redis
- Auto-reset de feeds problemáticos

**Status:** ✅ Resolvido

---

## 📊 Monitoramento

### Health Checks

```bash
curl http://localhost:8916/health
```

Resposta:
```json
{
  "status": "ok",
  "database": true,
  "redis": true,
  "timestamp": "2025-10-24T21:00:00.000Z",
  "uptime": 3600,
  "mode": "full-bot"
}
```

### Cache Stats

```bash
curl http://localhost:8916/cache-stats
```

### User-Agent Stats

```bash
curl http://localhost:8916/user-agent-stats
```

---

## 🚀 Deploy

### Ambiente de Desenvolvimento

```bash
npm install
npm run db:generate
npm run build
npm start
```

### Docker Compose

```bash
# Build e start
docker-compose up -d --build

# Ver logs
docker-compose logs -f rss-skull-bot

# Parar
docker-compose down

# Remover volumes (reset completo)
docker-compose down -v
```

### Variáveis de Ambiente

```bash
BOT_TOKEN=your_telegram_bot_token
DATABASE_URL=file:/app/data/production.db
REDIS_HOST=redis
REDIS_PORT=6379
PORT=8916
LOG_LEVEL=info
```

---

## 🔮 Melhorias Futuras

### Curto Prazo
- [ ] Implementar autenticação OAuth para Reddit (maior rate limit)
- [ ] Adicionar proxy rotation para evitar IP bans
- [ ] Dashboard web para monitoramento
- [ ] Export/Import de feeds (OPML)

### Médio Prazo
- [ ] Integração com WhatsApp Business API
- [ ] Integração com Discord
- [ ] IA para filtragem de conteúdo
- [ ] Analytics avançados

### Longo Prazo
- [ ] Suporte multi-plataforma (Slack, Teams)
- [ ] Arquitetura multi-tenant
- [ ] High availability com load balancing
- [ ] Kubernetes deployment

---

## 📝 Notas Técnicas

### Por que usar JSON API para Reddit?

1. **Latência menor**: JSON é mais leve que XML/RSS
2. **Menos bloqueios**: Requisições mais "naturais"
3. **Melhor estrutura**: Dados estruturados vs parsing de XML
4. **Rate limits**: Geralmente menos restritivos que RSS

### Por que User-Agent Rotation?

Browsers reais mantêm sessões de User-Agent consistentes por um período (10-50 requests). Nosso sistema simula isso com sessões de 20 minutos para parecer mais humano.

### Por que Circuit Breaker?

Evita falhas em cascata quando um serviço externo está instável. Abre o circuit após N falhas, testa periodicamente, e fecha quando recupera.

### Por que Cache Desabilitado para Reddit?

Reddit tem cache muito curto (~30s) e o sistema já usa JSON API que é mais eficiente. Cache para Reddit causaria mais problemas que benefícios.

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## 📞 Suporte

- **Email**: runawaydevil@pm.me
- **GitHub**: [@runawaydevil](https://github.com/runawaydevil)
- **Issues**: [GitHub Issues](https://github.com/runawaydevil/rssskull/issues)

---

**Última Atualização:** 24 de Outubro de 2025  
**Versão do Documento:** 1.0

