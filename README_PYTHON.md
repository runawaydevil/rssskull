# RSS Skull Bot - Python Version

Migração completa do sistema de TypeScript/Node.js para Python.

## Stack Python

- **Bot Telegram**: aiogram 3.15.0
- **HTTP Server**: FastAPI 0.115.0
- **Agendador**: APScheduler 3.10.4
- **HTTP Client**: aiohttp 3.11.10
- **RSS Parser**: feedparser 6.0.11
- **Database ORM**: SQLModel 0.0.23 (SQLite)
- **Cache/Locks**: aioredis 2.0.1
- **Observabilidade**: prometheus-client + structlog

## Estrutura do Projeto

```
app/
├── __init__.py
├── main.py                 # FastAPI app + APScheduler
├── bot.py                  # BotService com aiogram
├── config.py               # Configuração (pydantic-settings)
├── database.py             # SQLModel setup
├── scheduler.py            # APScheduler setup
├── services/
│   ├── rss_service.py      # RSS fetching (aiohttp)
│   ├── reddit_service.py   # Reddit OAuth + JSON
│   ├── feed_service.py     # Feed management
├── models/
│   └── feed.py             # SQLModel models
├── commands/
│   ├── feed_commands.py    # /add, /remove, /list
│   └── __init__.py
├── jobs/
│   └── feed_checker.py     # APScheduler job
├── utils/
│   ├── logger.py           # Structured logging
│   └── cache.py            # Redis cache
└── resilience/
    ├── circuit_breaker.py   # Circuit breaker
    ├── retry.py            # Retry logic
    └── keep_alive.py       # Keep-alive service
```

## Como Executar

### Desenvolvimento Local

1. Instale as dependências:
```bash
pip install -r requirements.txt
```

2. Configure o `.env`:
```bash
cp .env.example .env
# Edite o .env com suas configurações
```

3. Execute:
```bash
python run.py
```

### Docker

1. Build e execute:
```bash
cd docker
docker-compose up -d --build
```

## Migração de Dados

Se você já tinha dados no banco SQLite antigo (Prisma), você precisará migrar os dados. O schema é compatível, então você pode:

1. Manter o arquivo de banco de dados existente
2. A aplicação Python criará as tabelas automaticamente se não existirem

## Funcionalidades Implementadas

- ✅ Bot Telegram com comandos básicos
- ✅ Verificação periódica de feeds (APScheduler)
- ✅ Detecção de novos posts (incluindo lógica especial para Reddit)
- ✅ Notificações via Telegram
- ✅ Cache Redis
- ✅ Health checks (/health, /metrics, /stats)
- ✅ Sistema de resiliência (circuit breaker, retry, keep-alive)
- ✅ Rate limiting por domínio
- ✅ Suporte a Reddit via RSS

## Comandos do Bot

- `/start` - Iniciar bot
- `/help` - Mostrar ajuda
- `/list` - Listar feeds
- `/add <name> <url>` - Adicionar feed
- `/remove <name>` - Remover feed
- `/enable <name>` - Habilitar feed
- `/disable <name>` - Desabilitar feed
- `/ping` - Verificar status

## Diferenças da Versão TypeScript

1. **Sem BullMQ**: Usa APScheduler diretamente (mais simples)
2. **Sem fila externa**: Processamento in-process mais direto
3. **Menos camadas**: Arquitetura simplificada
4. **SQLModel**: ORM moderno baseado em Pydantic + SQLAlchemy

## Próximos Passos

- [ ] Testar com feeds reais
- [ ] Migrar dados existentes
- [ ] Implementar filtros de feeds
- [ ] Adicionar mais comandos do bot
- [ ] Melhorar tratamento de erros
- [ ] Adicionar testes

## Notas

- O sistema mantém compatibilidade com o schema de banco de dados existente
- A lógica de detecção de novos posts (especialmente para Reddit) foi preservada
- O sistema de resiliência foi simplificado mas mantém funcionalidade essencial

