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
- **OAuth API**: Official Reddit API with proper authentication
- **Rate Limiting**: Intelligent request management (60 requests/minute)
- **Token Management**: Automatic token refresh and error handling
- **Fallback Support**: JSON Feed fallback for better reliability

### ⚡ **Performance & Reliability**
- **HTTP Caching**: ETag and Last-Modified header support
- **Circuit Breaker**: Fault tolerance for external services
- **Metrics Tracking**: Latency monitoring and SLO violation detection
- **User-Agent Rotation**: Mimics real browser behavior

### 🤖 **Telegram Bot Features**
- **Interactive Commands**: `/add`, `/remove`, `/list`, `/help`
- **Real-time Notifications**: Instant feed updates
- **Channel Management**: Support for multiple channels
- **Error Handling**: Graceful error recovery and user feedback

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Redis (optional, can be disabled for development)
- SQLite database
- Telegram Bot Token

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

# For clean deployment (will delete all data):
docker-compose down -v
docker-compose up -d --build

# For updates preserving data:
docker-compose up -d --build
```

### Using Docker Image

```bash
# Pull latest image
docker pull ghcr.io/runawaydevil/rss-skull-bot:latest

# Run container
docker run -d \
  --name rss-skull-bot \
  --env-file .env \
  ghcr.io/runawaydevil/rss-skull-bot:latest
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Required |
| `TELEGRAM_CHANNEL_ID` | Target channel ID | Required |
| `REDDIT_CLIENT_ID` | Reddit app client ID | Required |
| `REDDIT_CLIENT_SECRET` | Reddit app secret | Required |
| `REDDIT_USERNAME` | Reddit username | Required |
| `REDDIT_PASSWORD` | Reddit password | Required |
| `DATABASE_URL` | SQLite database path | `file:./data/production.db` |
| `REDIS_HOST` | Redis host | `redis` |
| `REDIS_PORT` | Redis port | `6380` |
| `NODE_ENV` | Environment | `production` |

### Reddit App Setup

1. Go to [Reddit App Preferences](https://www.reddit.com/prefs/apps)
2. Create new app with type "Script"
3. Copy Client ID and Secret to `.env`
4. Use your Reddit username and password

## 📱 Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot and show welcome message |
| `/help` | Show available commands |
| `/add <url>` | Add RSS feed to monitoring |
| `/remove <url>` | Remove RSS feed from monitoring |
| `/list` | List all monitored feeds |
| `/status` | Show bot status and statistics |

## 🏗️ Architecture

```
src/
├── bot/                 # Telegram bot implementation
│   ├── commands/       # Bot command handlers
│   ├── handlers/       # Message handlers
│   └── middleware/     # Bot middleware
├── services/           # Core business logic
│   ├── feed.service.ts # RSS feed processing
│   ├── reddit.service.ts # Reddit integration
│   └── notification.service.ts # Telegram notifications
├── providers/          # External API providers
├── database/          # Database services
├── jobs/              # Background job processing
└── utils/             # Utility functions
```

## 🔧 Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build TypeScript
npm run start        # Start production server
npm run lint         # Run Biome linter
npm run format       # Format code with Biome
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

## 📊 Monitoring

The bot includes comprehensive monitoring:

- **Performance Metrics**: Request latency tracking
- **Error Monitoring**: Automatic error logging and recovery
- **Health Checks**: Service availability monitoring
- **Rate Limiting**: Intelligent request throttling

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
- ✨ Reddit OAuth API integration
- ⚡ HTTP caching with ETag support
- 📊 Performance metrics tracking
- 🔄 Circuit breaker for fault tolerance
- 🚀 Rate limiting improvements
- 🧹 Code cleanup and optimization

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/runawaydevil/rssskull/issues)
- **Discussions**: [GitHub Discussions](https://github.com/runawaydevil/rssskull/discussions)

---

**Made with ❤️ by [Pablo Murad](https://github.com/runawaydevil)**