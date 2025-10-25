# RSS Skull Bot

![RSS Skull Bot](rssskull.png)

> **Modern RSS to Telegram Bot with Reddit OAuth API Integration**

A powerful, feature-rich Telegram bot that fetches RSS feeds and delivers content directly to your Telegram channels. Built with TypeScript, featuring Reddit OAuth API integration, HTTP caching, performance metrics, and intelligent rate limiting.

## ✨ Features

### 🔗 **RSS Feed Processing**
- **Multi-format Support**: RSS 2.0, Atom, JSON Feed 1.1
- **Smart Parsing**: Automatic content extraction and normalization
- **Deduplication**: Prevents duplicate posts using intelligent ID matching
- **Content Filtering**: Advanced filtering based on keywords, domains, and patterns

### 🔴 **Reddit Integration**
- **OAuth API**: Official Reddit API with proper authentication (primary method)
- **Smart Fallback**: Automatic fallback to public JSON API on OAuth failures
- **Rate Limiting**: Intelligent request management (10 requests per 10 minutes per feed)
- **Token Management**: Automatic token refresh with database persistence
- **Circuit Breaker**: Exponential backoff on 403 errors (10min to 4h)

### ⚡ **Performance & Reliability**
- **HTTP Caching**: ETag and Last-Modified header support
- **Circuit Breaker**: Intelligent fault tolerance with exponential backoff
- **Database Persistence**: All data persisted across Docker deployments
- **Auto-Migrations**: Prisma migrations applied automatically on startup
- **Smart Rate Limiting**: Adaptive throttling per domain (6-8 min for Reddit)
- **User-Agent Management**: Realistic browser headers to avoid detection

### 🤖 **Telegram Bot Features**
- **Interactive Commands**: `/add`, `/remove`, `/list`, `/help`
- **Real-time Notifications**: Instant feed updates
- **Channel Management**: Support for multiple channels
- **Error Handling**: Graceful error recovery and user feedback

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ 
- Docker & Docker Compose (recommended)
- Redis (optional, can be disabled)
- Telegram Bot Token
- Reddit OAuth credentials (optional, for enhanced Reddit support)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/runawaydevil/rssskull.git
cd rssskull
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Initialize database**
```bash
npx prisma generate
npx prisma migrate dev --name init
```

5. **Run the bot**
```bash
npm run dev
```

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Clone and navigate to project
git clone https://github.com/runawaydevil/rssskull.git
cd rssskull

# Configure environment
cp .env.example .env
# Edit .env with your BOT_TOKEN and settings

# Start containers
docker-compose up -d --build

# View logs
docker-compose logs -f rss-skull-bot

# Stop containers (data persists in volumes)
docker-compose down

# For clean deployment (WARNING: deletes all data):
docker-compose down -v
docker-compose up -d --build
```

**Data Persistence:**
- Database: Persisted in `app_data` Docker volume
- Backups: Stored in `backups_data` Docker volume  
- Migrations: Applied automatically on container startup

### Docker Volumes

The bot uses Docker volumes for data persistence:

- **`app_data`**: Database storage (`/app/data`)
- **`backups_data`**: Automated backups (`/app/backups`)

To backup your data:
```bash
docker-compose exec rss-skull-bot node scripts/backup-database.js
```

Data is automatically persisted across container restarts and updates.

## ⚙️ Configuration

### Environment Variables

**Required:**
| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token | **Required** |
| `DATABASE_URL` | SQLite database path | `file:/app/data/production.db` |
| `REDIS_HOST` | Redis host | `redis` |
| `REDIS_PORT` | Redis port | `6379` |

**Reddit OAuth (Optional - for enhanced support):**
| Variable | Description | Required |
|----------|-------------|---------|
| `REDDIT_CLIENT_ID` | Reddit app client ID | For OAuth |
| `REDDIT_CLIENT_SECRET` | Reddit app secret | For OAuth |
| `REDDIT_USERNAME` | Reddit username | For OAuth |
| `REDDIT_PASSWORD` | Reddit password | For OAuth |
| `USE_REDDIT_API` | Enable Reddit OAuth API | `false` |
| `USE_REDDIT_JSON_FALLBACK` | Enable JSON fallback | `true` |

**Other Settings:**
| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `LOG_LEVEL` | Log level | `info` |
| `MAX_FEEDS_PER_CHAT` | Max feeds per chat | `50` |

### Reddit App Setup (Optional)

For enhanced Reddit support with OAuth API:

1. Go to [Reddit App Preferences](https://www.reddit.com/prefs/apps)
2. Create new app with type **"Script"** (not "web app" or "installed app")
3. Copy Client ID and Secret to `.env`
4. Use your Reddit username and password (or app password if using 2FA)
5. Enable `USE_REDDIT_API=true` in `.env`

**Note:** If OAuth is disabled or fails, the bot automatically falls back to the public Reddit JSON API, ensuring continuous operation.

## 📱 Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot and show welcome message |
| `/help` | Show available commands |
| `/add <name> <url>` | Add RSS feed to monitoring |
| `/discover <url>` | Auto-discover feeds from a website |
| `/remove <name>` | Remove RSS feed from monitoring |
| `/list` | List all monitored feeds |
| `/status` | Show bot status and statistics |
| `/filters` | Manage content filters |
| `/settings` | Configure bot settings |

## 🏗️ Architecture

```
src/
├── bot/                        # Telegram bot implementation
│   ├── commands/              # Bot command handlers
│   ├── handlers/              # Message handlers
│   └── middleware/            # Bot middleware
├── services/                   # Core business logic
│   ├── feed.service.ts        # RSS feed processing
│   ├── reddit.service.ts     # Reddit OAuth + JSON API
│   ├── reddit-api-provider.ts # OAuth API provider
│   ├── reddit-token-manager.ts # Token management
│   ├── token-manager.service.ts # DB token persistence
│   └── notification.service.ts # Telegram notifications
├── providers/                  # External API providers
├── database/                  # Database services & repositories
├── jobs/                      # Background job processing (BullMQ)
├── config/                    # Configuration services
└── utils/                     # Utility functions
```

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build TypeScript
npm run start        # Start production server
npm run lint         # Run Biome linter
npm run format       # Format code with Biome

# Docker
docker-compose up -d --build  # Build and start containers
docker-compose logs -f bot    # View bot logs
docker-compose restart bot    # Restart bot container

# Database
npx prisma studio            # Open Prisma Studio (GUI)
npx prisma migrate dev       # Create new migration
node scripts/backup-database.js  # Backup database
```

### Database Management

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name <migration-name>

# Reset database
npx prisma migrate reset
```

## 📊 Monitoring & Reliability

The bot includes comprehensive monitoring and fault tolerance:

- **Performance Metrics**: Request latency tracking
- **Error Monitoring**: Automatic error logging and recovery
- **Circuit Breaker**: Exponential backoff on API failures (10min → 4h)
- **Smart Rate Limiting**: Adaptive throttling per domain
- **Health Checks**: Service availability monitoring
- **Database Persistence**: Automatic migrations and backups
- **Graceful Degradation**: OAuth → JSON fallback → RSS when needed

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

We use conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆕 Changelog

### v0.5.0 - "Halfway to definitive"
- ✨ Reddit OAuth API integration with smart fallback
- ⚡ HTTP caching with ETag support
- 📊 Performance metrics tracking
- 🔄 Circuit breaker with exponential backoff
- 🚀 Intelligent rate limiting (6-8 min for Reddit)
- 💾 Database persistence across Docker deployments
- 🔐 Token management with automatic refresh
- 🐳 Robust Docker deployment with entrypoint scripts
- 🛡️ Graceful error handling and recovery
- 🧹 Code cleanup and optimization

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/runawaydevil/rssskull/issues)
- **Discussions**: [GitHub Discussions](https://github.com/runawaydevil/rssskull/discussions)

---

**Made with ❤️ by [Pablo Murad](https://github.com/runawaydevil)**