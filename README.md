<div align="center">
  <img src="rssskull.png" alt="RSS Skull Bot" width="200" height="200">
  
  # RSS Skull Bot v2
  
  *A modern, high-performance RSS to Telegram bot with bilingual support*
  
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
  [![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
  [![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  
</div>

---

## ✨ Features

- 🚀 **High Performance**: 3x faster than v1 with 50% less memory usage
- 🌍 **Bilingual Support**: Portuguese and English commands with automatic detection
- 🔗 **Smart URL Conversion**: Automatic Reddit and YouTube URL to RSS conversion
- 🎯 **Advanced Filtering**: Include/exclude patterns with regex support
- 📊 **Statistics**: Comprehensive usage tracking and analytics
- ⚙️ **Customizable**: Message templates and chat-specific settings
- 🔄 **Background Processing**: Efficient job queue system with Redis
- 🛡️ **Production Ready**: Health checks, monitoring, and Docker deployment
- 📱 **Modern Architecture**: Clean code with repository pattern and dependency injection

## 🛠️ Tech Stack

### Core Technologies
- **Runtime**: [Node.js 20+](https://nodejs.org/) with [TypeScript 5.6+](https://www.typescriptlang.org/)
- **Bot Framework**: [grammY](https://grammy.dev/) - Modern Telegram bot library
- **Web Server**: [Fastify](https://fastify.dev/) - High performance web framework
- **Database**: [SQLite](https://www.sqlite.org/) with [Prisma ORM](https://www.prisma.io/)
- **Queue System**: [BullMQ](https://docs.bullmq.io/) + [Redis](https://redis.io/)

### Development & Quality
- **Validation**: [Zod](https://zod.dev/) - TypeScript-first schema validation
- **Linting/Formatting**: [Biome](https://biomejs.dev/) - Fast toolchain for web projects
- **Testing**: [Vitest](https://vitest.dev/) - Blazing fast unit test framework
- **Package Manager**: [npm](https://www.npmjs.com/) with Node.js 20+ support

### Infrastructure & Deployment
- **Containerization**: [Docker](https://www.docker.com/) + [Docker Compose](https://docs.docker.com/compose/)
- **Reverse Proxy**: [Nginx](https://nginx.org/) with SSL/TLS support
- **Process Management**: Multi-stage Docker builds with health checks
- **Monitoring**: Built-in health endpoints and logging system

### Additional Libraries
- **RSS Parsing**: [rss-parser](https://www.npmjs.com/package/rss-parser) - Fast RSS/Atom feed parser
- **ID Generation**: [@paralleldrive/cuid2](https://www.npmjs.com/package/@paralleldrive/cuid2) - Collision-resistant IDs
- **Database Migration**: Custom migration scripts with SQLite3 support

## 🏗️ Architecture

RSS Skull Bot v2 follows a clean, modular architecture:

```
src/
├── bot/                    # Telegram bot layer
│   ├── commands/          # Command handlers (bilingual)
│   ├── handlers/          # Base command and message handlers
│   └── middleware/        # Authentication, logging, i18n
├── services/              # Business logic layer
│   ├── feed.service.ts    # Feed management
│   ├── rss.service.ts     # RSS processing
│   ├── notification.service.ts # Message sending
│   └── statistic.service.ts    # Usage tracking
├── jobs/                  # Background job processors
│   ├── feed-queue.service.ts   # Feed checking jobs
│   └── job.service.ts          # Job queue management
├── database/              # Data access layer
│   ├── repositories/      # Repository pattern implementation
│   └── database.service.ts     # Database connection
├── utils/                 # Utilities and helpers
│   ├── converters/        # URL conversion (Reddit, YouTube)
│   ├── validators/        # Input validation schemas
│   └── logger/           # Logging system
├── config/                # Configuration management
└── main.ts               # Application entry point
```

## 🤖 Available Commands

### English Commands
- `/start` - Initialize the bot and show welcome message
- `/help` - Display all available commands and usage
- `/add <name> <url>` - Add a new RSS feed to the chat
- `/list` - List all active feeds in the chat
- `/remove <name>` - Remove a feed from the chat
- `/enable <name>` - Enable a disabled feed
- `/disable <name>` - Temporarily disable a feed
- `/settings` - View and modify chat settings
- `/filters <name>` - Manage include/exclude filters for a feed
- `/stats` - View usage statistics for the last 30 days

### Portuguese Commands
- `/iniciar` - Inicializar o bot e mostrar mensagem de boas-vindas
- `/ajuda` - Mostrar todos os comandos disponíveis
- `/adicionar <nome> <url>` - Adicionar um novo feed RSS ao chat
- `/listar` - Listar todos os feeds ativos no chat
- `/remover <nome>` - Remover um feed do chat
- `/habilitar <nome>` - Habilitar um feed desabilitado
- `/desabilitar <nome>` - Desabilitar temporariamente um feed
- `/configuracoes` - Ver e modificar configurações do chat
- `/filtros <nome>` - Gerenciar filtros de inclusão/exclusão para um feed
- `/estatisticas` - Ver estatísticas de uso dos últimos 30 dias

## 🔧 Smart Features

### URL Auto-Conversion
The bot automatically converts various URL formats to their RSS equivalents:

- **Reddit**: `reddit.com/r/programming` → `reddit.com/r/programming.rss`
- **YouTube Channels**: `youtube.com/channel/UCxxx` → `youtube.com/feeds/videos.xml?channel_id=UCxxx`
- **YouTube Users**: `youtube.com/user/username` → RSS feed via API lookup

### Advanced Filtering
Create powerful filters for your feeds:

- **Include Patterns**: Only show items matching specific keywords
- **Exclude Patterns**: Hide items containing unwanted terms
- **Regex Support**: Use regular expressions for complex pattern matching
- **Multiple Filters**: Combine multiple include/exclude rules per feed

### Message Templates
Customize how RSS items are displayed:

```
Available variables:
{{title}} - Article title
{{link}} - Article URL
{{description}} - Article description
{{author}} - Article author
{{pubDate}} - Publication date
{{feedName}} - Feed name
```

Example template:
```
🔗 **{{title}}**

{{description}}

👤 By {{author}} | 📅 {{pubDate}}
[Read more]({{link}})
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- Telegram Bot Token (from @BotFather)

### Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd rss-skull-v2
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your bot token and settings
   ```

3. **Setup development environment**:
   ```bash
   npm run setup
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token | Required |
| `PORT` | Server port | 8916 |
| `HOST` | Server host | 0.0.0.0 |
| `DATABASE_URL` | SQLite database path | file:./dev.db |
| `REDIS_HOST` | Redis host | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `LOG_LEVEL` | Logging level | info |
| `NODE_ENV` | Environment | development |

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run test` - Run tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix code style issues
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run database migrations
- `npm run docker:dev` - Start Redis for development
- `npm run setup` - Complete development setup

### Project Structure

```
src/
├── bot/                    # Telegram bot layer
├── services/              # Business logic layer
├── jobs/                  # Background job processors
├── database/              # Database layer
├── utils/                 # Utilities and helpers
├── config/                # Configuration management
└── main.ts               # Application entry point
```

## 🚀 Production Deployment

### Quick Deploy with Docker

1. **Configure environment**:
   ```bash
   cp .env.production .env
   # Edit .env with your bot token and settings
   ```

2. **Deploy with single command**:
   ```bash
   npm run deploy:prod
   ```

3. **Monitor deployment**:
   ```bash
   docker-compose -f docker-compose.prod.yml logs -f
   ```

### Advanced Production Setup

For production environments with SSL and reverse proxy:

1. **Setup SSL certificates** (place in `nginx/ssl/`):
   ```bash
   # Your SSL certificate files
   nginx/ssl/cert.pem
   nginx/ssl/key.pem
   ```

2. **Deploy with Nginx**:
   ```bash
   docker-compose -f docker-compose.prod.yml --profile with-nginx up -d
   ```

3. **Health check**:
   ```bash
   curl http://localhost:8916/health
   ```

### Manual Deployment

For custom deployment scenarios:

1. **Install dependencies**:
   ```bash
   npm ci --only=production
   ```

2. **Build the application**:
   ```bash
   npm run build
   ```

3. **Setup database**:
   ```bash
   npm run db:deploy
   ```

4. **Start Redis** (required for job queue):
   ```bash
   redis-server
   ```

5. **Start the application**:
   ```bash
   npm start
   ```

### Environment Configuration

Key environment variables for production:

```env
# Bot Configuration
BOT_TOKEN=your_telegram_bot_token_here
WEBHOOK_URL=https://your-domain.com/webhook  # Optional

# Server Configuration
PORT=8916
HOST=0.0.0.0

# Database Configuration
DATABASE_URL=file:/app/data/production.db

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379

# Performance Configuration
MAX_FEEDS_PER_CHAT=50
RSS_CHECK_INTERVAL=300
MAX_CONCURRENT_JOBS=10
```

## Commands

### English Commands
- `/start` - Initialize the bot
- `/help` - Show available commands
- `/add <name> <url>` - Add RSS feed
- `/list` - List all feeds
- `/remove <name>` - Remove feed
- `/enable <name>` - Enable feed
- `/disable <name>` - Disable feed
- `/settings` - View chat settings
- `/filters <name>` - Manage feed filters
- `/stats` - View usage statistics

### Portuguese Commands
- `/iniciar` - Inicializar o bot
- `/ajuda` - Mostrar comandos disponíveis
- `/adicionar <nome> <url>` - Adicionar feed RSS
- `/listar` - Listar todos os feeds
- `/remover <nome>` - Remover feed
- `/habilitar <nome>` - Habilitar feed
- `/desabilitar <nome>` - Desabilitar feed
- `/configuracoes` - Ver configurações do chat
- `/filtros <nome>` - Gerenciar filtros do feed
- `/estatisticas` - Ver estatísticas de uso

## 📈 Performance Improvements

RSS Skull Bot v2 delivers significant performance improvements over v1:

- **3x Faster Processing**: Optimized RSS parsing and message delivery
- **50% Less Memory Usage**: Efficient data structures and garbage collection
- **Background Processing**: Non-blocking job queue system
- **Connection Pooling**: Optimized database and Redis connections
- **Smart Caching**: Intelligent feed caching and deduplication

## 🔧 Migration from v1

If you're upgrading from RSS Skull Bot v1, we provide a comprehensive migration tool:

```bash
# Install dependencies
npm install

# Run migration (replace with your v1 database path)
npm run migrate:v1 /path/to/old/database.db
```

See [Migration Guide](scripts/MIGRATION.md) for detailed instructions.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Pablo Murad**
- GitHub: [@runawaydevil](https://github.com/runawaydevil)
- Email: runawaydevil@pm.me

---

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/runawaydevil">Pablo Murad</a></p>
  <p>If this project helped you, please consider giving it a ⭐!</p>
</div>