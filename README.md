# RSS Skull Bot

<p align="center">
    <img src="https://skillicons.dev/icons?i=ts,js,py,redis" />
</p>

<p align="center">
    <img src="https://shot.1208.pro/uploads/iMy8zIrYAW4TsUXDfDUdXjq0tVYNI0EZYWQSw5rm.png" alt="RSS Skull Bot" width="200" height="200" />
</p>

Enterprise-grade RSS to Telegram bot with advanced anti-blocking capabilities. Monitors RSS feeds and delivers content notifications to Telegram channels with enterprise-level reliability.

## Overview

RSS Skull Bot is a production-ready Telegram bot built with Python that monitors RSS feeds and sends notifications when new content is available. The system includes comprehensive anti-blocking mechanisms, Reddit integration, circuit breakers, and Docker-first deployment architecture.

Key features:
- Multi-format RSS support (RSS 2.0, Atom, JSON Feed 1.1)
- Real-time notifications to Telegram channels
- Advanced anti-blocking system with adaptive rate limiting
- Reddit and YouTube feed support
- Circuit breaker pattern for failed feeds
- HTTP caching with ETag and Last-Modified support
- Health monitoring and metrics endpoints
- Database persistence with SQLite
- Optional Redis caching layer

## Prerequisites

- Docker and Docker Compose (recommended for production)
- Python 3.11+ (for local development)
- Telegram Bot Token from [@BotFather](https://t.me/botfather)
- Redis (optional, can be disabled)

## Quick Installation

### Docker Installation (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/runawaydevil/rssskull.git
cd rssskull
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Edit `.env` and set your `BOT_TOKEN`:
```bash
BOT_TOKEN=your_telegram_bot_token_here
```

4. Start the application:
```bash
docker-compose up -d --build
```

5. Verify deployment:
```bash
docker-compose ps
curl http://localhost:8916/health
```

For detailed installation instructions, see [docs/INSTALLATION.md](docs/INSTALLATION.md).

### Local Development Installation

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your BOT_TOKEN
```

4. Run the application:
```bash
python run.py
```

For detailed local development setup, see [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Basic Usage

Start a conversation with your bot on Telegram and use the following commands:

- `/start` - Initialize the bot
- `/help` - Show available commands
- `/add <name> <url>` - Add a new RSS feed
- `/list` - List all monitored feeds
- `/stats` - Show bot statistics

Example:
```
/add TechNews https://example.com/rss
/add RedditPython https://reddit.com/r/Python
```

For complete command reference and usage examples, see [docs/USAGE.md](docs/USAGE.md).

## Documentation

- [Installation Guide](docs/INSTALLATION.md) - Comprehensive installation instructions
- [Configuration Reference](docs/CONFIGURATION.md) - Complete configuration options
- [System Architecture](docs/ARCHITECTURE.md) - Architecture and design documentation
- [Usage Guide](docs/USAGE.md) - Bot commands and usage examples
- [Operations Manual](docs/OPERATIONS.md) - Monitoring, logging, and troubleshooting
- [Development Guide](docs/DEVELOPMENT.md) - Development setup and contribution guidelines

## Technology Stack

- Python 3.11+
- FastAPI for HTTP endpoints
- aiogram for Telegram Bot API
- SQLModel for database ORM
- APScheduler for job scheduling
- aiohttp for HTTP client
- feedparser for RSS parsing
- Redis for caching (optional)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025-2026 Pablo Murad (@runawaydevil)

## Support

- Issues: [GitHub Issues](https://github.com/runawaydevil/rssskull/issues)
- Repository: [https://github.com/runawaydevil/rssskull](https://github.com/runawaydevil/rssskull)
- Developer: [@runawaydevil](https://github.com/runawaydevil)

---

*Along the shore the cloud waves break,  
The twin suns sink behind the lake,  
The shadows lengthen  
In Carcosa.*

*Strange is the night where black stars rise,  
And strange moons circle through the skies,  
But stranger still is  
Lost Carcosa.*

**Robert W. Chambers**
