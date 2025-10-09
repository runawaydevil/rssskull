# 🚀 RSS Skull Bot - Features Documentation

## 📋 **Implemented Features Overview**

### **1. User-Agent Rotation System** ✅
**Location:** `src/utils/user-agent.service.ts`

**Features:**
- **Realistic Browser Profiles**: Chrome, Firefox, Safari, Edge with authentic headers
- **Session Management**: Maintains same User-Agent for 10-50 requests (2-6 hours)
- **Weight-based Selection**: More popular browsers used more frequently
- **Domain-specific Headers**: Special headers for Reddit, YouTube, GitHub
- **Anti-detection**: Avoids repeating recent User-Agents

**Usage:**
```typescript
const headers = userAgentService.getHeaders(url);
// Returns realistic browser headers for the URL
```

**Monitoring:**
- `GET /user-agent-stats` - Current session info and statistics

---

### **2. Intelligent Caching System** ✅
**Location:** `src/utils/cache.service.ts`

**Features:**
- **Domain-specific TTL**: Reddit 10min, YouTube 15min, GitHub 60min, etc.
- **Shared Cache**: 1 request serves N users for same feed
- **Memory Management**: Auto-cleanup expired entries, LRU eviction
- **Hit/Miss Tracking**: Performance statistics and monitoring

**Cache Times:**
- **Reddit**: 10 minutes (high frequency)
- **Hacker News**: 5 minutes (very high frequency)
- **YouTube**: 15 minutes (moderate frequency)
- **GitHub**: 60 minutes (releases change slowly)
- **Blogs**: 30 minutes (low frequency)
- **Default**: 20 minutes

**Monitoring:**
- `GET /cache-stats` - Basic statistics (hit rate, entries, memory)
- `GET /cache-info` - Detailed cache information

---

### **3. Enhanced Settings System** ✅
**Location:** `src/bot/commands/settings.commands.ts`

**Available Commands:**
```bash
/settings                    # View current settings
/settings help              # Complete help guide
/settings language pt|en    # Change language
/settings interval 2-60     # Check interval (minutes)
/settings timezone UTC-3    # Set timezone
/settings notifications on|off  # Enable/disable notifications
/settings maxfeeds 1-100    # Max feeds limit
/settings template <type>   # Message templates
/settings reset             # Reset to defaults
/settings export            # Export settings as JSON
```

**Template System:**
- **Pre-made Templates**: default, compact, full
- **Custom Templates**: Full Markdown support
- **Variables**: `{{title}}`, `{{link}}`, `{{description}}`, `{{author}}`, `{{pubDate}}`, `{{feedName}}`, `{{domain}}`
- **Live Preview**: Shows how notifications will look

**Template Examples:**
```
Default:  🔗 {{title}}\n{{description}}\n[Read more]({{link}})
Compact:  📰 {{title}} - {{domain}}
Full:     📰 **{{title}}**\n👤 {{author}}\n📅 {{pubDate}}\n{{description}}\n🔗 [Read more]({{link}})
```

---

### **4. Rate Limiting System** ✅
**Location:** `src/utils/rate-limiter.service.ts`

**Features:**
- **Domain-specific Limits**: Reddit 5 req/min, YouTube 20 req/min, etc.
- **Intelligent Delays**: Minimum delays between requests
- **Request History**: Tracks requests per domain in time windows
- **Automatic Backoff**: Exponential backoff on rate limit errors

**Rate Limits:**
- **Reddit**: 5 requests/min, 5s minimum delay
- **YouTube**: 20 requests/min, 2s minimum delay
- **GitHub**: 40 requests/min, 1s minimum delay
- **Default**: 50 requests/min, 0.5s minimum delay

---

### **5. Feed Interval Management** ✅
**Location:** `src/utils/feed-interval.service.ts`

**Features:**
- **Dynamic Intervals**: Based on feed domain and type
- **Smart Defaults**: Reddit 15min, YouTube 10min, GitHub 30min
- **User Configurable**: Via settings command (2-60 minutes)
- **Performance Optimized**: Longer intervals for slow-changing feeds

---

## 🔧 **System Architecture**

### **Request Flow:**
1. **Rate Limiting Check** → Wait if needed
2. **Cache Check** → Return cached if available
3. **User-Agent Selection** → Get realistic browser headers
4. **HTTP Request** → Fetch with authentic headers
5. **Cache Storage** → Store result with appropriate TTL
6. **Response** → Return processed feed data

### **Benefits:**
- **70-90% Reduction** in actual HTTP requests (due to caching)
- **No More 429 Errors** from Reddit (due to rate limiting + User-Agents)
- **Better Performance** (cached responses are instant)
- **Realistic Traffic** (appears as human browser usage)

---

## 📊 **Monitoring & Debugging**

### **Available Endpoints:**
```bash
GET /health              # System health check
GET /user-agent-stats    # User-Agent rotation statistics
GET /cache-stats         # Cache performance metrics
GET /cache-info          # Detailed cache information
```

### **Health Check Response:**
```json
{
  "status": "ok",
  "database": true,
  "redis": true,
  "timestamp": "2025-01-09T17:00:00.000Z",
  "uptime": 3600,
  "mode": "feed-only"
}
```

### **Cache Stats Response:**
```json
{
  "status": "ok",
  "cacheStats": {
    "totalEntries": 25,
    "totalHits": 150,
    "totalMisses": 30,
    "hitRate": 83.33,
    "memoryUsage": 245760,
    "oldestEntry": 1800000,
    "newestEntry": 30000
  }
}
```

---

## 🎯 **Performance Improvements**

### **Before Implementation:**
- ❌ Reddit rate limiting errors (429)
- ❌ Bot detection and blocking
- ❌ Redundant requests for same feeds
- ❌ Fixed intervals regardless of feed type
- ❌ Basic settings with poor UX

### **After Implementation:**
- ✅ **No rate limiting errors** (intelligent delays + User-Agents)
- ✅ **Appears as human traffic** (realistic browser sessions)
- ✅ **70-90% fewer requests** (intelligent caching)
- ✅ **Optimized intervals** (Reddit 15min, others 5-10min)
- ✅ **Rich settings system** (templates, timezones, export)

---

## 🔮 **Future Enhancements**

### **Planned Features:**
1. **Additional Commands**: `/preview`, `/info`, `/pause`, `/resume`
2. **OPML Import/Export**: Backup and restore feed lists
3. **Advanced Filtering**: Regex patterns, keyword matching
4. **Statistics Dashboard**: Usage analytics and trends
5. **Multi-language Templates**: Localized notification formats

### **Technical Improvements:**
1. **Redis Caching**: Persistent cache across restarts
2. **Proxy Rotation**: Multiple IP addresses for requests
3. **Reddit API Integration**: Official API for better reliability
4. **Webhook Support**: Real-time notifications
5. **Batch Processing**: Efficient handling of multiple feeds

---

## 🧪 **Testing**

### **Test Coverage:**
- ✅ **RSS Service**: 11 tests (caching, rate limiting, User-Agents)
- ✅ **User-Agent Service**: Rotation logic and session management
- ✅ **Cache Service**: TTL, cleanup, statistics
- ✅ **Settings Service**: Validation, templates, export
- ✅ **Integration Tests**: End-to-end feed processing

### **Run Tests:**
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

---

## 📝 **Configuration**

### **Environment Variables:**
```bash
# Core Settings
BOT_TOKEN=your_telegram_bot_token
PORT=8916
HOST=0.0.0.0

# Database
DATABASE_URL=file:/app/data/production.db

# Redis (for job queue)
REDIS_HOST=redis
REDIS_PORT=6379

# Optional
LOG_LEVEL=info
NODE_ENV=production
```

### **Default Settings:**
```json
{
  "language": "en",
  "checkInterval": 300,
  "maxFeeds": 50,
  "enableFilters": true,
  "timezone": "UTC",
  "messageTemplate": null
}
```

---

## 🚀 **Deployment**

### **Docker Compose:**
```bash
# Start system
docker compose up -d --build

# View logs
docker compose logs -f rss-skull-bot

# Check health
curl http://localhost:8916/health

# Monitor cache
curl http://localhost:8916/cache-stats
```

### **System Requirements:**
- **Memory**: 256MB minimum, 512MB recommended
- **CPU**: 0.25 cores minimum, 0.5 cores recommended
- **Storage**: 1GB for database and logs
- **Network**: Outbound HTTPS access to feed sources

---

## 📞 **Support & Troubleshooting**

### **Common Issues:**
1. **High Memory Usage**: Check cache size with `/cache-info`
2. **Slow Performance**: Monitor hit rate with `/cache-stats`
3. **Rate Limiting**: Check User-Agent rotation with `/user-agent-stats`
4. **Feed Errors**: Review logs for specific error messages

### **Debug Commands:**
```bash
# Clear cache
curl -X POST http://localhost:8916/cache/clear

# Force new User-Agent session
curl -X POST http://localhost:8916/user-agent/reset

# Export settings
/settings export
```

---

**Last Updated:** January 9, 2025  
**Version:** 0.01  
**Status:** ✅ Production Ready