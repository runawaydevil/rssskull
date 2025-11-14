# RSS Skull Bot

<div align="center">
  <img src="rssskull.png" alt="RSS Skull Bot" width="200" height="200" />
</div>

> **Modern RSS to Telegram Bot with Reddit Support**

A powerful, feature-rich Telegram bot that fetches RSS feeds and delivers content directly to your Telegram channels. Built with Python (FastAPI + aiogram), featuring Reddit RSS support, HTTP caching, performance metrics, HTML sanitization, and intelligent feed processing.

## ✨ Features

### 🛡️ **Anti-Blocking System**
- **User-Agent Rotation**: Pool of 10+ realistic browser User-Agents with domain-aware selection
- **Adaptive Rate Limiting**: Intelligent delays that adjust based on server responses (2x on 429, 3x on repeated 403)
- **Circuit Breaker Pattern**: Automatically stops checking feeds that consistently fail (5 failures = 1 hour pause)
- **Reddit Fallback Chain**: Multiple access methods (RSS → JSON → old.reddit.com) for blocked subreddits
- **Session Management**: Per-domain HTTP sessions with cookie handling and 1-hour rotation
- **Request Randomization**: Jitter (±20%) and randomized headers to avoid detection patterns
- **Learning System**: Tracks success rates per User-Agent per domain for optimization

### 🔗 **RSS Feed Processing**
- **Multi-format Support**: RSS 2.0, Atom, JSON Feed 1.1
- **Smart Parsing**: Automatic content extraction and normalization
- **Deduplication**: Prevents duplicate posts using intelligent ID matching
- **Content Filtering**: Advanced filtering based on keywords, domains, and patterns
- **HTML Sanitization**: Automatic sanitization for Telegram HTML parse mode
- **Baseline Management**: Smart baseline using most recent post date to prevent old post notifications

### 🔴 **Reddit Integration**
- **RSS Feed Support**: Automatic Reddit URL to RSS conversion (`/r/subreddit` → `.rss`)
- **Timestamp-based Detection**: Smart detection of new posts using publication dates
- **Popularity-based Handling**: Correctly handles Reddit's non-chronological sorting
- **HTTP Caching**: ETag and Last-Modified header support to reduce API calls
- **Rate Limiting**: Intelligent request management to respect Reddit's limits

### ⚡ **Performance & Reliability**
- **HTTP Caching**: ETag and Last-Modified header support
- **Circuit Breaker**: Intelligent fault tolerance with exponential backoff
- **Database Persistence**: All data persisted across Docker deployments
- **Auto-Migrations**: Prisma migrations applied automatically on startup
- **Smart Rate Limiting**: Adaptive throttling per domain (6-8 min for Reddit)
- **User-Agent Management**: Realistic browser headers to avoid detection

### 🛡️ **Anti-Blocking System**
- **User-Agent Rotation**: 10+ realistic browser User-Agents with domain-aware selection
- **Adaptive Rate Limiting**: Automatic delay adjustment based on server responses (2x on 429, 3x on 403)
- **Circuit Breaker Pattern**: Temporarily skip feeds that fail consistently (5 failures = 1 hour pause)
- **Session Management**: Per-domain HTTP sessions with cookie support and 1-hour rotation
- **Reddit Fallback Chain**: Automatic fallback to old.reddit.com when main endpoint is blocked
- **Request Randomization**: Jitter (±20%) and randomized headers to appear more human
- **Success Rate Learning**: Tracks which User-Agents work best for each domain

### 🛡️ **Telegram Resilience System**
- **Auto-Recovery**: Automatic recovery from 502 Bad Gateway errors
- **Message Queue**: Offline message queuing during API outages
- **Exponential Backoff**: Smart retry with delays from 1s to 60s
- **Health Monitoring**: Real-time monitoring with `/health` endpoint
- **Alert System**: Automatic alerts for critical connectivity issues
- **Persistent State**: Connection state survives restarts

### 🤖 **Telegram Bot Features**
- **Interactive Commands**: `/add`, `/remove`, `/list`, `/help`
- **Real-time Notifications**: Instant feed updates
- **Channel Management**: Support for multiple channels
- **Access Control**: Optional user ID whitelist (respond only to owner)
- **Feed Limits**: Global limit of 100 feeds across all chats
- **Error Handling**: Graceful error recovery and user feedback

## 🚀 Quick Start

### Prerequisites
- Python 3.11+ 
- Docker & Docker Compose (recommended)
- Redis (optional, can be disabled)
- Telegram Bot Token

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/runawaydevil/rssskull.git
cd rssskull
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Setup environment**
```bash
cp .env.example .env
# Edit .env with your configuration (BOT_TOKEN is required)
```

4. **Run the bot**
```bash
python run.py
```

Or using Docker (recommended):
```bash
docker-compose up -d --build
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

**Optional Settings:**
| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Environment | `production` |
| `LOG_LEVEL` | Log level (see below) | `info` |
| `ALLOWED_USER_ID` | Restrict bot to specific user (optional) | `undefined` |
| `DISABLE_REDIS` | Disable Redis caching | `false` |
| `PORT` | HTTP server port | `8916` |
| `HOST` | HTTP server host | `0.0.0.0` |

### Logging Configuration

Control log verbosity with the `LOG_LEVEL` environment variable:

- **`debug`**: Show all logs including detailed operation logs (verbose, for troubleshooting)
- **`info`**: Show info, warning, and error logs (default, recommended for production)
- **`warning`**: Show only warnings and errors
- **`error`**: Show only errors

**Production defaults:**
- Heartbeat logs every 5 minutes (vs 30 seconds in development)
- Feed skip messages at DEBUG level (not shown in INFO mode)
- Health check logs minimized
- Summary logs after each feed check cycle

**Troubleshooting:**
If you need to debug an issue, temporarily set `LOG_LEVEL=debug` in your `.env` file and restart:
```bash
# Edit .env
LOG_LEVEL=debug

# Restart container
docker-compose restart rss-skull-bot

# View detailed logs
docker-compose logs -f rss-skull-bot
```

### Reddit Feed Setup

Reddit feeds are automatically converted to RSS format:

- Add Reddit subreddit: `/add MySub https://reddit.com/r/subreddit`
- Or directly: `/add MySub https://reddit.com/r/subreddit/.rss`

The bot automatically converts Reddit URLs to RSS feeds and handles Reddit's popularity-based sorting to correctly detect new posts.

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
| `/blockstats` | Show anti-blocking statistics and circuit breaker status |

## 🏗️ Architecture

```
app/
├── bot.py                     # Telegram bot implementation (aiogram)
├── commands/                  # Bot command handlers
│   └── feed_commands.py      # Feed management commands
├── jobs/                      # Background job processing
│   └── feed_checker.py       # RSS feed checking job (APScheduler)
├── services/                  # Core business logic
│   ├── feed_service.py        # Feed CRUD operations
│   ├── rss_service.py        # RSS feed fetching and parsing
│   └── reddit_service.py     # Reddit URL handling
├── models/                    # Database models (SQLModel)
│   └── feed.py               # Feed and Chat models
├── utils/                     # Utility functions
│   ├── html_sanitizer.py     # Telegram HTML sanitization
│   ├── cache.py              # Redis caching
│   └── logger.py             # Structured logging
├── database.py               # Database initialization
├── config.py                 # Configuration (Pydantic Settings)
└── main.py                   # FastAPI application with health endpoints
```

## 🔧 Development

### Available Scripts

```bash
# Development
python run.py              # Start development server

# Docker
docker-compose up -d --build  # Build and start containers
docker-compose logs -f rss-skull-bot    # View bot logs
docker-compose restart rss-skull-bot    # Restart bot container

# Code Quality
ruff check app/           # Run Ruff linter
black app/                # Format code with Black
mypy app/                 # Type checking with mypy
```

### Database Management

The database is automatically initialized on first startup. Data is persisted in Docker volumes (`app_data`).

To access the database directly:
```bash
docker-compose exec rss-skull-bot sqlite3 /app/data/production.db
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

### 🛡️ Telegram Resilience System

The bot includes a robust resilience system specifically designed to handle Telegram API connectivity issues:

- **Automatic Recovery**: Handles 502 Bad Gateway errors with exponential backoff (1s → 60s)
- **Message Queuing**: Stores up to 1000 messages during API outages with priority handling
- **Circuit Breaker**: Prevents cascade failures with adaptive thresholds
- **Health Monitoring**: Real-time metrics and alerting via `/health`, `/resilience-stats`, `/metrics`
- **Persistent State**: Connection state and queued messages survive restarts
- **Smart Retry**: Up to 30 minutes of retry attempts before escalation

**Monitoring Endpoints:**
- `GET /health` - Overall system health including resilience status
- `GET /resilience-stats` - Detailed resilience system statistics  
- `GET /metrics` - Complete metrics for monitoring systems

For detailed information, see [RESILIENCE.md](RESILIENCE.md).

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

See [CHANGELOG.md](CHANGELOG.md) for full version history.

### v0.6.0 - "Python Migration & Bug Fixes" (2025-11-02)
- 🐍 Complete migration from TypeScript/Node.js to Python
- 🔧 Fixed Telegram HTML parse errors (HTML comments, unbalanced tags)
- ✅ Fixed Reddit feed notification issues
- 📊 Enhanced logging and debugging capabilities
- 🎯 Improved baseline management for new feeds
- 🐳 Docker improvements (multi-stage build, non-root user)
- 📝 HTML sanitization system for Telegram messages
- 🧹 Code cleanup and optimization

## 🔧 Troubleshooting

### Feeds Being Blocked (403 Errors)

The bot includes an anti-blocking system that automatically handles most blocking issues:

1. **Check blocking statistics**: Use `/blockstats` command to see current delays and circuit breaker status
2. **Wait for automatic recovery**: Circuit breaker will retry after cooldown period (1 hour initially)
3. **Reddit-specific**: The bot automatically tries multiple access methods (RSS → JSON → old.reddit.com)
4. **Adjust delays**: Increase `ANTI_BLOCK_MIN_DELAY` in `.env` if needed (default: 5 seconds)

### High Rate Limiting Delays

If you see very high delays (>60s) for a domain:

- This means the domain is actively blocking or rate-limiting requests
- The bot will gradually reduce delays as requests succeed
- Use `/blockstats` to monitor current delays per domain
- Consider reducing number of feeds from the same domain

### Circuit Breaker Activated

When a feed fails 5 times consecutively:

- Circuit breaker activates and pauses checks for 1 hour
- After timeout, bot attempts one test request
- If successful, normal checking resumes
- If failed, timeout doubles (max 24 hours)
- Check status with `/blockstats` command

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/runawaydevil/rssskull/issues)
- **Discussions**: [GitHub Discussions](https://github.com/runawaydevil/rssskull/discussions)

---

**Made with ❤️ by [Pablo Murad](https://github.com/runawaydevil)**