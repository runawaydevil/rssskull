<div align="center">
  <img src="rssskull.png" alt="RSS Skull Bot" width="200" height="200">
  
  # RSS Skull Bot v0.1.0
  
  *A modern, high-performance RSS to Telegram bot with intelligent feed discovery and multi-format support*
  
  [![Version](https://img.shields.io/badge/Version-0.1.0-green.svg)](package.json)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
  [![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
  [![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  
</div>

---

## ✨ Features

- 🚀 **High Performance**: Optimized architecture with efficient resource usage
- 🌍 **Bilingual Support**: Portuguese and English commands and messages
- 📢 **Channel Support**: Full support for Telegram channels with mention-based commands
- 🔍 **Intelligent Feed Discovery**: Automatic feed detection from any website URL
- 🔗 **Smart URL Conversion**: Automatic Reddit and YouTube URL to RSS conversion
- 🎯 **Advanced Filtering**: Include/exclude patterns with regex support
- 📊 **Statistics**: Comprehensive usage tracking and analytics
- ⚙️ **Customizable**: Message templates and chat-specific settings
- 🔄 **Background Processing**: Efficient job queue system with Redis
- 🛡️ **Production Ready**: Health checks, monitoring, and Docker deployment
- 📱 **Modern Architecture**: Clean code with repository pattern and dependency injection
- 🤖 **Smart Mention Processing**: Intelligent bot mention detection and command extraction
- 🔐 **Permission Management**: Automatic permission validation for channel operations
- 🔒 **Security Settings**: User-configurable rate limiting, cache, retry, and timeout settings
- 🚀 **Secret Commands**: Hidden commands for advanced users (`/processar`, `/reset`)
- 🔍 **Multi-Format Support**: RSS 2.0, Atom 1.0, and JSON Feed 1.1 detection
- 🌐 **URL Normalization**: Automatic handling of various URL formats (with/without https, www)
- 🚫 **Duplicate Prevention**: Smart duplicate detection for feed names and URLs
- ⚡ **Conditional HTTP Caching**: Bandwidth-saving with If-Modified-Since and ETag headers
- 🔧 **Secret Log Commands**: Advanced debugging with `/log` and `/loge` commands
- 🛡️ **Enhanced Circuit Breaker**: Improved fault tolerance with intelligent error handling
- 🔄 **Intelligent URL Alternatives**: Automatic fallback system for problematic domains
- ⏱️ **Robust Timeout Handling**: Better handling of slow websites and network issues

---

## 🚀 **Coming Soon: v1.0.0 - WhatsApp Integration**

### 📱 **The Next Big Leap**

**RSS Skull Bot v1.0.0** will introduce **WhatsApp Business API integration**, expanding our reach to the world's most popular messaging platform with **2+ billion users**.

#### 🎯 **WhatsApp Features (v1.0.0)**
- 📱 **WhatsApp Business API** - Official Meta integration
- 💬 **Rich Messaging** - Interactive buttons and media support
- 👥 **Group & Channel Support** - Full WhatsApp group integration
- 🎨 **Message Templates** - WhatsApp-approved notification templates
- 🔄 **Feature Parity** - All Telegram features available on WhatsApp
- 🌍 **Global Reach** - Access to WhatsApp's massive user base

#### 🏗️ **Multi-Platform Architecture**
- 🔧 **Platform Abstraction** - Unified codebase for multiple platforms
- 📊 **Shared Services** - Common RSS processing and database layer
- 🎛️ **Unified Commands** - Same commands work across all platforms
- 📈 **Cross-Platform Analytics** - Performance metrics across platforms

**🎯 Target Release: Q2 2025**

---

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

## 🚀 Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- A Telegram Bot Token from [@BotFather](https://t.me/botfather)

### 1. Get Your Bot Token
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Create a new bot with `/newbot`
3. Choose a name and username for your bot
4. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Clone and Configure
```bash
# Clone the repository
git clone https://github.com/runawaydevil/rssskull.git
cd rssskull/rss-skull-v2

# Copy environment file
cp .env.example .env

# Edit the .env file with your bot token
nano .env
```

### 3. Configure Environment
Edit `.env` file:
```bash
# Required: Your Telegram bot token
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Optional: Server configuration
PORT=8916
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

# Database (SQLite - no configuration needed)
DATABASE_URL=file:/app/data/production.db

# Redis (handled by Docker Compose)
REDIS_HOST=redis
REDIS_PORT=6379
```

### 4. Deploy with Docker
```bash
# Start the bot
docker-compose up -d

# View logs
docker-compose logs -f rss-skull-bot

# Stop the bot
docker-compose down
```

### 5. Test Your Bot
1. **Private Chat**: Send `/start` to your bot
2. **Channel**: Add bot as admin, then use `@yourbotname /start`
3. **Add a feed**: `/add news https://feeds.feedburner.com/TechCrunch`
4. **Discover feeds**: `/discover pablo.space`
5. **Add with auto-discovery**: `/add blog pablo.space`

## 📢 Channel Support

RSS Skull Bot v0.01 includes **full support for Telegram channels**! 

### How to Use in Channels
1. **Add the bot as an administrator** to your channel with these permissions:
   - ✅ **Post messages**
   - ✅ **Edit messages**  
   - ✅ **Delete messages**
2. **Mention the bot** with commands: `@yourbotname /add news https://example.com/rss`
3. **Bot validates permissions** automatically before executing commands
4. **Enhanced error handling** provides clear feedback for channel-specific issues

### Channel Features
- ✅ **Mention-based commands**: `@botname /command` works seamlessly
- ✅ **Permission validation**: Automatic checks for required admin permissions  
- ✅ **Anonymous admin support**: Handles anonymous channel admin posts gracefully
- ✅ **Contextual help**: Smart fallback responses when mentioned without commands
- ✅ **Enhanced logging**: Detailed channel interaction tracking for debugging
- ✅ **Fast feed checking**: Optimized 2-minute intervals for quick updates

### Example Channel Usage
```bash
# Add a feed
@yourbotname /add tech https://feeds.feedburner.com/TechCrunch

# Discover feeds from a website
@yourbotname /discover pablo.space

# Add feed with auto-discovery
@yourbotname /add blog pablo.space

# List all feeds
@yourbotname /list

# View settings
@yourbotname /settings

# Get help
@yourbotname /help
```

## 🎯 Usage Examples

### Auto-Discovery Examples
```bash
# Discover feeds from any website
/discover pablo.space
/discover www.example.com
/discover https://blog.company.com

# Add feeds with automatic discovery
/add blog pablo.space
/add news www.cnn.com
/add tech https://techcrunch.com
```

### URL Format Examples
```bash
# All these formats work the same way:
/add feed pablo.space
/add feed www.pablo.space
/add feed https://pablo.space
/add feed http://pablo.space

# The bot normalizes them all to: https://pablo.space
```

## 🤖 Available Commands

### Basic Commands
- `/start` - Initialize the bot and show welcome message
- `/help` - Display all available commands and usage
- `/ping` - Test bot response
- `/add <name> <url>` - Add a new RSS feed to the chat (with auto-discovery)
- `/list` - List all active feeds in the chat
- `/remove <name>` - Remove a feed from the chat
- `/enable <name>` - Enable a disabled feed
- `/disable <name>` - Temporarily disable a feed
- `/settings` - View and modify chat settings
- `/filters <name>` - Manage include/exclude filters for a feed
- `/discover <url>` - Discover available feeds from a website

### Secret Commands (Not listed in /help)
- `/processar` - Process all feeds immediately (manual trigger)
- `/processarfeed <name>` - Process specific feed immediately
- `/reset` - Reset entire database (all chats, feeds, filters, settings)
- `/fixfeeds` - Remove problematic feeds (Reddit .com.br domains)

## 🏗️ Architecture

RSS Skull Bot v0.01 follows a clean, modular architecture:

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

## 🔧 Smart Features

### 🔍 Intelligent Feed Discovery
The bot can automatically discover feeds from any website:

- **Website URLs**: `pablo.space` → Discovers all available feeds
- **URL Normalization**: Handles `pablo.space`, `www.pablo.space`, `https://pablo.space`
- **Multiple Strategies**: HTML `<link>` tags, common paths, WordPress detection
- **Format Detection**: Automatically detects RSS 2.0, Atom 1.0, and JSON Feed 1.1
- **Atom Preference**: Prefers Atom over RSS when both are available

### 🌐 URL Normalization
The bot automatically normalizes various URL formats:

| Input | Output |
|-------|--------|
| `pablo.space` | `https://pablo.space` |
| `www.pablo.space` | `https://pablo.space` |
| `https://pablo.space` | `https://pablo.space` |
| `http://pablo.space` | `https://pablo.space` |

### 🚫 Duplicate Prevention
Smart duplicate detection prevents:
- **Duplicate names**: Same feed name in the same chat
- **Duplicate URLs**: Same feed URL (original or RSS)
- **Discovered feed duplicates**: Prevents adding feeds found via discovery that already exist

### URL Auto-Conversion
The bot automatically converts various URL formats to their RSS equivalents:

- **Reddit**: `reddit.com/r/programming` → `old.reddit.com/r/programming/.rss`
- **YouTube Channels**: `youtube.com/channel/UCxxx` → `youtube.com/feeds/videos.xml?channel_id=UCxxx`
- **YouTube Users**: `youtube.com/user/username` → RSS feed via API lookup
- **Any Website**: Auto-discovery finds feeds automatically

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
{{domain}} - Source domain
```

Example templates:
```
Default: 🔥 {{title}}
{{description}}
🔗 [Link]({{link}})

Compact: 📰 {{title}} - 🔗 [Link]({{link}}) ({{feedName}})

Full: 🔥 **{{title}}**
👤 {{author}}
📅 {{pubDate}}
{{description}}
🔗 [Link]({{link}})
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BOT_TOKEN` | Telegram bot token from @BotFather | - | ✅ |
| `PORT` | Server port | 8916 | ❌ |
| `HOST` | Server host | 0.0.0.0 | ❌ |
| `NODE_ENV` | Environment (development/production) | development | ❌ |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | info | ❌ |
| `DATABASE_URL` | SQLite database path | file:./dev.db | ❌ |
| `REDIS_HOST` | Redis host | localhost | ❌ |
| `REDIS_PORT` | Redis port | 6379 | ❌ |

### Bot Settings

The bot includes several configurable settings per chat:

- **Check Interval**: 2min to 60min (default: 5min)
- **Max Feeds**: Up to 50 feeds per chat
- **Language**: Portuguese and English
- **Timezone**: Configurable timezone (default: America/Sao_Paulo)
- **Filters**: Include/exclude patterns with regex
- **Message Templates**: Custom notification formats
- **Notifications**: Enable/disable feed notifications

### Security Settings (User Configurable)

⚠️ **Warning**: Changing these settings may cause rate limiting or blocking by RSS providers.

- **Rate Limiting**: Enable/disable with custom requests per minute and delay
- **Cache**: Enable/disable with custom TTL (1-1440 minutes)
- **Retry**: Enable/disable with custom max attempts (0-10)
- **Timeout**: Request timeout (1-300 seconds)

#### Security Commands:
- `/settings ratelimit <enabled|disabled> [maxRequests] [minDelay]`
- `/settings cache <enabled|disabled> [ttlMinutes]`
- `/settings retry <enabled|disabled> [maxRetries]`
- `/settings timeout <seconds>`

### Performance Tuning

For high-traffic deployments:

```yaml
# docker-compose.prod.yml
services:
  rss-skull-bot:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
```

## 🚀 Development

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

## 📈 Performance Improvements

RSS Skull Bot v0.02.5 delivers significant performance improvements:

- **Smart Rate Limiting**: Domain-specific rate limiting (Reddit: 10min, YouTube: 10min, Default: 5min)
- **Intelligent Caching**: Domain-specific cache TTL (Reddit: 10min, GitHub: 60min, Default: 20min)
- **Conditional HTTP Caching**: Bandwidth-saving with If-Modified-Since and ETag headers
- **Background Processing**: Non-blocking job queue system with Redis
- **Connection Pooling**: Optimized database and Redis connections
- **User-Agent Rotation**: Realistic browser headers to avoid blocking
- **Exponential Backoff**: Smart retry logic with increasing delays
- **Deduplication**: Prevents duplicate items using lastItemId tracking
- **Multi-Format Support**: Automatic detection and parsing of RSS 2.0, Atom 1.0, and JSON Feed 1.1
- **Intelligent Feed Discovery**: Automatic feed detection from any website URL
- **URL Normalization**: Handles various URL formats automatically

## 🔧 Migration from v1

If you're upgrading from RSS Skull Bot v1, we provide a comprehensive migration tool:

```bash
# Install dependencies
npm install

# Run migration (replace with your v1 database path)
npm run migrate:v1 /path/to/old/database.db
```

See [Migration Guide](scripts/MIGRATION.md) for detailed instructions.

## 🔒 Security Features

RSS Skull Bot includes comprehensive security measures:

### Rate Limiting
- **Domain-specific limits**: Reddit (5 req/min), YouTube (20 req/min), GitHub (40 req/min)
- **Minimum delays**: Reddit (5s), GitHub (1s), Default (500ms)
- **User-configurable**: Adjust limits per chat via `/settings ratelimit`

### User-Agent & Headers
- **Browser rotation**: Chrome, Firefox, Safari, Edge profiles
- **Realistic headers**: Accept, Accept-Language, Sec-Ch-Ua, etc.
- **Domain-specific**: Referer headers for Reddit, YouTube, GitHub

### Caching & Performance
- **Smart TTL**: Domain-specific cache times
- **Automatic cleanup**: Expired entries removed
- **Hit/miss tracking**: Performance monitoring

### Retry & Error Handling
- **Exponential backoff**: Increasing delays on failures
- **Non-retryable errors**: 404, 401, 403, parse errors
- **Rate limit detection**: Recognizes 429 responses

### Input Validation
- **URL validation**: Format and structure checks
- **Regex validation**: Pattern testing before application
- **Sanitization**: Control character removal
- **Length limits**: Maximum patterns and field sizes

## 🐛 Troubleshooting

### Common Issues

#### Bot Not Responding in Channels
**Problem**: Bot doesn't respond to commands in channels
**Solution**: 
1. Ensure bot is added as **administrator** to the channel
2. Grant these permissions: Post messages, Edit messages, Delete messages
3. Use mention format: `@yourbotname /command`

#### "Permission Denied" Errors
**Problem**: Bot shows permission errors
**Solution**:
```bash
# Check bot permissions
@yourbotname /settings

# Verify bot is admin in channel settings
# Re-add bot with correct permissions if needed
```

#### Feeds Not Updating
**Problem**: RSS feeds not checking for new content
**Solution**:
```bash
# Check feed status
@yourbotname /list

# Verify feed URL is accessible
curl -I "https://your-feed-url.com/rss"

# Check bot logs
docker-compose logs -f rss-skull-bot
```

#### Docker Issues
**Problem**: Container won't start or crashes
**Solution**:
```bash
# Check logs
docker-compose logs rss-skull-bot

# Restart services
docker-compose down
docker-compose up -d

# Clean rebuild
docker-compose down -v
docker-compose up -d --build
```

### Debug Mode

Enable debug logging:
```bash
# In .env file
LOG_LEVEL=debug

# Restart bot
docker-compose restart rss-skull-bot

# View debug logs
docker-compose logs -f rss-skull-bot
```

### Health Checks

The bot includes health endpoints:
```bash
# Check bot health
curl http://localhost:8916/health

# Expected response
{
  "status": "ok",
  "database": true,
  "redis": true,
  "uptime": 3600,
  "memory": {...}
}
```

## 📊 Monitoring

### Logs
```bash
# View all logs
docker-compose logs -f

# View only bot logs
docker-compose logs -f rss-skull-bot

# View only Redis logs
docker-compose logs -f redis
```

### Statistics
The bot tracks usage statistics:
- Messages sent per day
- Feeds checked per day
- User actions per day
- Top performing feeds

Access via: `@yourbotname /stats`

### Feed Processing Intervals
- **Reddit**: Every 10 minutes (optimized for rate limits)
- **YouTube**: Every 10 minutes
- **Twitter/X**: Every 5 minutes
- **GitHub**: Every 30 minutes
- **Medium**: Every 15 minutes
- **Dev.to**: Every 10 minutes
- **Hacker News**: Every 5 minutes
- **TechCrunch**: Every 5 minutes
- **Default sites**: Every 5 minutes

## 🔮 Future Plans

RSS Skull Bot is evolving! Check out our [**Roadmap**](ROADMAP.md) for upcoming features:

- 📱 **WhatsApp Integration** - Full WhatsApp Business API support
- 🤖 **Discord & Slack** - Multi-platform messaging support  
- 🧠 **AI-Powered Features** - Smart content filtering and analysis
- 🏢 **Enterprise Features** - Multi-tenant architecture and advanced security

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup
```bash
# Clone and install
git clone https://github.com/runawaydevil/rssskull.git
cd rssskull/rss-skull-v2
npm install

# Setup development environment
npm run setup

# Start development
npm run dev
```

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/runawaydevil/rssskull/issues)
- **Discussions**: [GitHub Discussions](https://github.com/runawaydevil/rssskull/discussions)
- **Telegram**: [@runawaydevil](https://t.me/runawaydevil) - Direct support
- **Developer**: [@runawaydevil](https://github.com/runawaydevil)

## 🙏 Acknowledgments

- [grammY](https://grammy.dev/) - Modern Telegram bot framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [BullMQ](https://docs.bullmq.io/) - Premium queue package
- [Fastify](https://fastify.dev/) - Fast web framework

## 📝 License

This project is **open source** and licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### 🆓 Open Source Benefits
- ✅ **Free to use** for personal and commercial projects
- ✅ **Modify and distribute** without restrictions  
- ✅ **Community contributions** welcome
- ✅ **No vendor lock-in** - you own your deployment

**MIT License** - Copyright (c) 2025 Pablo Murad (@runawaydevil)

---

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/runawaydevil">Pablo Murad</a></p>
  <p>⭐ Star this repo if you find it useful!</p>
</div>