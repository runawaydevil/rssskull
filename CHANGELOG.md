# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2025-11-02

### Added
- **HTML Sanitization System**: New `html_sanitizer` utility module to handle Telegram HTML parse mode
  - Removes HTML comments (`<!-- -->`)
  - Converts equivalent tags (`<strong>` → `<b>`, `<em>` → `<i>`)
  - Removes unsupported HTML tags
  - Balances HTML tags (closes unclosed tags, removes unmatched closing tags)
  - Strips HTML tags for plain text fallback
- **Enhanced Logging**: Comprehensive debug logging for feed processing
  - Feed state logging (lastItemId, lastNotifiedAt, lastCheck)
  - Detailed item date comparisons
  - Number of entries found vs items created
  - Reasons for not finding new items
- **Improved Cache Handling**: 
  - Only cache feeds if they contain items
  - Clear cache and refetch on 304 Not Modified if cached feed is empty
  - Prevent stale empty cache entries

### Changed
- **Feed Baseline Logic**: Changed first-time feed processing to use the most recent post date as baseline instead of current time
  - Prevents notifying posts that existed before adding the feed
  - Now correctly notifies posts created between adding the feed and first check
  - Better handling of Reddit feeds with popularity-based sorting
- **Reddit Feed Detection**: Simplified `get_new_items` method to iterate through all items and compare dates
  - Removed complex position-based detection
  - More robust handling of Reddit's non-chronological sorting
  - Ensures all new posts are considered, regardless of position
- **Message Formatting**: Enhanced message formatting with HTML sanitization
  - Automatic HTML sanitization before sending to Telegram
  - Fallback to plain text if HTML sanitization fails
  - Better error handling for Telegram parse errors
- **Docker Configuration**:
  - Fixed Dockerfile casing (`as` → `AS`)
  - Changed non-root user from `nodejs` to `app` for consistency
  - Updated all `chown` and `USER` commands to use `app` user
  - Removed obsolete `version: '3.8'` from docker-compose.yml
- **Uptime Calculation**: Fixed uptime calculation in `/health` and `/metrics` endpoints
  - Now uses `_app_start_time` global variable initialized on startup
  - Accurate uptime tracking across restarts

### Fixed
- **Telegram HTML Parse Errors**: 
  - Fixed "Unsupported start tag `!--`" errors (HTML comments)
  - Fixed "Can't find end tag corresponding to start tag `b`" errors (unbalanced tags)
  - Fixed "Unclosed start tag" errors
- **Reddit Feed Notification Issues**:
  - Fixed bot not notifying new posts from Reddit feeds
  - Fixed issue where posts created before baseline were incorrectly skipped
  - Fixed issue where posts at position 0 weren't detected
- **Syntax Errors**:
  - Fixed `SyntaxError: f-string expression part cannot include a backslash` in `rss_service.py`
- **Cache Issues**:
  - Fixed bot not adding feeds or returning 0 items due to empty cache
  - Fixed stale cache entries preventing fresh feed fetches
- **Database Path Normalization**: Improved Windows/Linux path compatibility
  - Proper path normalization for SQLite URLs
  - Better handling of Docker paths on Windows development

### Technical Improvements
- **Code Quality**:
  - Added extensive debug logging throughout RSS service
  - Improved error messages and diagnostics
  - Better handling of edge cases (empty feeds, missing dates, etc.)
- **Python Migration**: Complete migration from TypeScript/Node.js to Python
  - New Python-based bot implementation using `aiogram`
  - FastAPI for HTTP endpoints
  - SQLModel for database ORM
  - APScheduler for job scheduling
  - Better async/await support

## [0.5.0] - Previous Version

### Features
- Reddit OAuth API integration with smart fallback
- HTTP caching with ETag support
- Performance metrics tracking
- Circuit breaker with exponential backoff
- Intelligent rate limiting (6-8 min for Reddit)
- Database persistence across Docker deployments
- Token management with automatic refresh
- Robust Docker deployment with entrypoint scripts
- Graceful error handling and recovery

---

[0.6.0]: https://github.com/runawaydevil/rssskull/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/runawaydevil/rssskull/releases/tag/v0.5.0

