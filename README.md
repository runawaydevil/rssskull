# RSS Skull Bot

![RSS Skull Bot](rssskull.png)

Um bot moderno e de alta performance para Telegram que monitora feeds RSS e envia notificações em tempo real. Desenvolvido com TypeScript, Node.js e Docker.

## 🚀 Características

- **Alta Performance**: Processamento paralelo com 5 workers simultâneos
- **Rate Limiting Inteligente**: Adaptive throttling que se ajusta automaticamente
- **Circuit Breaker Avançado**: Proteção contra falhas em cascata
- **Cache Inteligente**: Sistema de cache otimizado com TTL adaptativo
- **Suporte a Canais**: Funciona em grupos e canais do Telegram
- **Comandos Bilíngues**: Português e inglês
- **Docker Ready**: Containerização completa com Docker Compose

## 📋 Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- Bot Token do Telegram (obtenha com [@BotFather](https://t.me/botfather))

## 🛠️ Instalação

### Método 1: Docker (Recomendado)

1. **Clone o repositório**
   ```bash
   git clone https://github.com/runawaydevil/rssskull.git
   cd rssskull
   ```

2. **Configure as variáveis de ambiente**
   ```bash
   cp .env.example .env
   # Edite o arquivo .env com seu BOT_TOKEN
   ```

3. **Execute com Docker Compose**
   ```bash
   docker-compose up -d
   ```

### Método 2: Desenvolvimento Local

1. **Instale as dependências**
   ```bash
   npm install
   ```

2. **Configure o ambiente**
   ```bash
   cp .env.example .env
   # Edite o arquivo .env com seu BOT_TOKEN
   ```

3. **Gere o cliente Prisma**
   ```bash
   npm run db:generate
   ```

4. **Compile o projeto**
   ```bash
   npm run build
   ```

5. **Execute o bot**
   ```bash
   npm start
   ```

## 🎮 Comandos Disponíveis

### Comandos Básicos
- `/start` ou `/iniciar` - Iniciar o bot
- `/help` ou `/ajuda` - Mostrar ajuda
- `/ping` - Testar resposta do bot

### Gerenciamento de Feeds
- `/add <nome> <url>` ou `/adicionar <nome> <url>` - Adicionar feed RSS
- `/list` ou `/listar` - Listar todos os feeds
- `/remove <nome>` ou `/remover <nome>` - Remover feed
- `/enable <nome>` ou `/habilitar <nome>` - Habilitar feed
- `/disable <nome>` ou `/desabilitar <nome>` - Desabilitar feed
- `/discover <url>` ou `/descobrir <url>` - Descobrir feeds de um site

### Configurações
- `/settings` ou `/configuracoes` - Ver configurações do chat
- `/filters <nome>` ou `/filtros <nome>` - Gerenciar filtros do feed
- `/process` ou `/processar` - Processar manualmente todos os feeds

## ⚙️ Configuração Avançada

### Variáveis de Ambiente

```env
# Bot Configuration
BOT_TOKEN=your_telegram_bot_token_here

# Server Configuration
PORT=8916
HOST=0.0.0.0

# Database Configuration
DATABASE_URL=file:/app/data/production.db

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info

# Optional: Advanced Settings
MAX_FEEDS_PER_CHAT=50
RSS_CHECK_INTERVAL=300
```

### Cache do Reddit

⚠️ **Importante**: Feeds do Reddit usam configurações de cache fixas (20min TTL) para melhor performance e não podem ser modificadas pelo usuário.

### Reset do Banco de Dados

Se você precisar resetar completamente o banco de dados (por exemplo, após recriar o bot):

```bash
# Linux/Mac
./scripts/reset-database.sh

# Windows PowerShell
.\scripts\reset-database.ps1
```

**⚠️ Atenção:** Isso apagará TODOS os dados (feeds, configurações, estatísticas).

### Comandos de Administração

- `/resetdb` - Resetar banco de dados (apenas administradores)
- `/processar` - Processar feeds perdidos desde que o bot ficou online
- `/processarfeed <nome>` - Processar um feed específico

## 🐳 Docker

### Build Local
```bash
# Usar script automatizado (Linux/Mac)
./build-local.sh

# Ou manualmente
docker build -t rssskull:local .
docker-compose up -d
```

### Scripts Disponíveis
- `build-local.sh` - Script de build para Linux/Mac
- `build-local.ps1` - Script de build para Windows PowerShell

### Comandos Docker Úteis
```bash
# Ver logs
docker-compose logs -f rss-skull-bot

# Parar serviços
docker-compose down

# Rebuild e restart
docker-compose up -d --build

# Verificar status
docker-compose ps
```

## 🔧 Desenvolvimento

### Estrutura do Projeto
```
src/
├── bot/                 # Bot do Telegram
├── config/              # Configurações
├── database/            # Banco de dados (Prisma)
├── jobs/                # Sistema de filas (BullMQ)
├── services/            # Serviços principais
└── utils/               # Utilitários
```

### Scripts NPM
```bash
npm run build          # Compilar TypeScript
npm run dev            # Modo desenvolvimento
npm run start          # Iniciar produção
npm run db:generate    # Gerar cliente Prisma
npm run db:migrate     # Executar migrações
npm run db:studio      # Interface Prisma Studio
```

## 🚀 Deploy

### GitHub Actions
O projeto inclui workflow automatizado para deploy:
- Build automático em releases
- Deploy com Docker Compose
- Health checks integrados
- Rollback automático em caso de falha

### Deploy Manual
1. Configure as variáveis de ambiente no servidor
2. Execute `docker-compose -f docker-compose.prod.yml up -d`
3. Monitore os logs com `docker-compose logs -f`

## 📊 Monitoramento

### Health Checks
- `http://localhost:8916/health` - Status geral
- `http://localhost:8916/cache-stats` - Estatísticas de cache
- `http://localhost:8916/user-agent-stats` - Estatísticas de User-Agent

### Logs
```bash
# Docker
docker-compose logs -f rss-skull-bot

# Local
npm run dev
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 👨‍💻 Desenvolvedor

**Pablo Murad** - [@runawaydevil](https://github.com/runawaydevil)

## 🆘 Suporte

- 📧 Email: runawaydevil@pm.me
- 🐛 Issues: [GitHub Issues](https://github.com/runawaydevil/rssskull/issues)
- 💬 Discussões: [GitHub Discussions](https://github.com/runawaydevil/rssskull/discussions)

---

⭐ **Se este projeto te ajudou, considere dar uma estrela!**