# Usage Guide

Complete guide to using RSS Skull Bot, including all available commands and feed management procedures.

## Getting Started

After installation and configuration, start a conversation with your bot on Telegram. Send the `/start` command to initialize the bot.

The bot will respond with a welcome message and list of available commands.

## Bot Commands

### Basic Commands

#### /start
Initialize the bot and display welcome message.

Usage:
```
/start
```

Response includes welcome message and basic command overview.

#### /help
Display comprehensive help message with all available commands.

Usage:
```
/help
```

Shows all commands organized by category with usage examples.

#### /ping
Verify bot connectivity and responsiveness.

Usage:
```
/ping
```

Returns "Pong! Bot is alive and running." if bot is operational.

### Feed Management Commands

#### /add
Add a new RSS feed to monitoring.

Usage:
```
/add <name> <url>
```

Parameters:
- `name`: Unique name for the feed (alphanumeric, spaces allowed)
- `url`: Feed URL (RSS, Reddit, or YouTube)

Examples:
```
/add TechNews https://example.com/rss
/add RedditPython https://reddit.com/r/Python
/add YouTubeChannel https://youtube.com/@channelname
/add MyChannel youtube.com/channel/UCxxxxx
```

The bot will:
1. Validate the URL
2. Convert Reddit/YouTube URLs to RSS format if needed
3. Fetch and verify the feed is accessible
4. Create feed entry in database
5. Confirm successful addition

If the feed already exists with the same name, you'll receive an error. Use a different name or remove the existing feed first.

#### /remove
Remove a feed from monitoring.

Usage:
```
/remove <name>
```

Parameters:
- `name`: Name of the feed to remove

Example:
```
/remove TechNews
```

Removes the feed and all associated data. This action cannot be undone.

#### /list
List all feeds configured for your chat.

Usage:
```
/list
```

Displays:
- Feed name
- Feed URL
- Enabled/disabled status
- Total number of feeds

Example output:
```
Your RSS Feeds (3):

1. Enabled TechNews
   https://example.com/rss

2. Enabled RedditPython
   https://reddit.com/r/Python

3. Disabled OldFeed
   https://oldfeed.com/rss
```

#### /enable
Enable a disabled feed.

Usage:
```
/enable <name>
```

Parameters:
- `name`: Name of the feed to enable

Example:
```
/enable OldFeed
```

Re-enables monitoring for a previously disabled feed.

#### /disable
Temporarily disable a feed without removing it.

Usage:
```
/disable <name>
```

Parameters:
- `name`: Name of the feed to disable

Example:
```
/disable TechNews
```

Disables monitoring but preserves feed configuration. Use `/enable` to re-enable.

### Information Commands

#### /health
Check health status of all feeds.

Usage:
```
/health
```

Displays:
- Feeds with high failure rates (3+ failures)
- Healthy feeds count
- Recommendations for problematic feeds

Example output:
```
Feed Health Report

Problem Feeds:
• TechNews
  URL: https://example.com/rss
  Failures: 5
  Status: Enabled

Healthy Feeds: 2

Tip: Use /remove <name> to remove problematic feeds.
```

#### /stats
Show bot statistics and metrics.

Usage:
```
/stats
```

Displays:
- Bot information (username, ID, polling status)
- Database statistics (total feeds, enabled/disabled counts)
- Chat count

#### /blockstats
Display anti-blocking system statistics.

Usage:
```
/blockstats
```

Shows:
- Overall performance metrics
- Per-domain statistics (top 10 by request count)
- Success rates per domain
- Circuit breaker states
- Current delays per domain
- Low success rate domains

Example output:
```
Anti-Blocking Statistics

Overall Performance:
• Total Requests: 1250
• Success Rate: 87.5%
• Blocked (403): 45
• Rate Limited (429): 112
• Domains Tracked: 8

Top Domains:
OK example.com
  Success: 95.2% (200/210)
  Delay: 5.0s

WARNING reddit.com
  Success: 65.0% (130/200)
  Blocked: 35
  Delay: 15.5s
  Circuit: open
```

## Supported Feed Types

### RSS 2.0
Standard RSS feeds in RSS 2.0 format.

Example:
```
/add NewsFeed https://example.com/feed.rss
```

### Atom
Atom syndication format feeds.

Example:
```
/add AtomFeed https://example.com/atom.xml
```

### JSON Feed
JSON Feed 1.1 specification feeds.

Example:
```
/add JSONFeed https://example.com/feed.json
```

### Reddit
Reddit subreddit feeds. Automatically converted to RSS format.

Supported formats:
- `https://reddit.com/r/subreddit`
- `https://www.reddit.com/r/subreddit`
- `https://reddit.com/r/subreddit/.rss`

Example:
```
/add PythonReddit https://reddit.com/r/Python
```

The bot automatically:
1. Detects Reddit URL
2. Converts to RSS format
3. Uses fallback chain if standard RSS fails
4. Handles non-chronological sorting

### YouTube
YouTube channel feeds. Automatically converted to RSS format.

Supported formats:
- Channel ID: `youtube.com/channel/UCxxxxx`
- Handle: `youtube.com/@username`
- Handle: `@username`
- Plain channel ID: `UCxxxxx`

Examples:
```
/add TechChannel youtube.com/channel/UCxxxxx
/add MyChannel youtube.com/@username
/add ShortHandle @username
```

The bot automatically:
1. Detects YouTube URL
2. Extracts channel ID or username
3. Converts to YouTube RSS feed URL
4. Fetches feed

## Feed Management

### Adding Feeds

When adding a feed, the bot performs validation:
1. URL format validation
2. Service detection (RSS/Reddit/YouTube)
3. URL conversion if needed
4. Feed accessibility check
5. Feed parsing verification

If any step fails, you'll receive an error message with details.

### Feed Configuration

Each feed has the following properties:
- Name: Unique identifier
- URL: Original URL (for display)
- RSS URL: Converted RSS URL (for fetching)
- Check interval: Minutes between checks (default: 10)
- Max age: Maximum age of items to notify (default: 1440 minutes / 24 hours)
- Enabled: Whether feed is actively monitored
- Last item ID: Most recent item processed
- Last notified at: Timestamp of last notification
- Last check: Timestamp of last feed check
- Failures: Consecutive failure count

### Feed Monitoring

The bot checks all enabled feeds every 5 minutes. For each feed:
1. Checks if check interval has elapsed
2. Fetches feed content
3. Compares items with last known item
4. Identifies new items
5. Sends notifications for new items
6. Updates feed state

### Notification Behavior

Notifications are sent when:
- New items are detected in the feed
- Item publication date is newer than last notification time
- Item age is within max_age_minutes limit
- Feed is enabled

Notifications include:
- Feed name
- Item title
- Item description (truncated to 500 characters)
- Publication date
- Link to full content

### Feed State Management

Feed state is automatically managed:
- First check: Sets baseline to most recent post date (prevents spam)
- Subsequent checks: Compares all items with last notification date
- Failure handling: Increments failure count, may disable feed
- Success handling: Resets failure count

## Best Practices

### Feed Naming
- Use descriptive, unique names
- Avoid special characters
- Keep names short but meaningful

### URL Format
- Use full URLs with protocol (https://)
- For Reddit, use standard subreddit URLs
- For YouTube, use channel URLs or handles

### Feed Management
- Regularly check `/health` for problematic feeds
- Remove feeds that consistently fail
- Use `/disable` instead of `/remove` for temporary issues
- Monitor `/blockstats` for blocking issues

### Performance
- Limit number of feeds per chat (recommended: 50 or fewer)
- Use appropriate check intervals (default 10 minutes)
- Monitor system resources via `/stats`

## Troubleshooting

### Feed Not Adding
- Verify URL is accessible
- Check URL format is correct
- Ensure feed is valid RSS/Atom/JSON
- Check bot logs for errors

### No Notifications
- Verify feed is enabled (`/list` shows enabled status)
- Check feed has new items
- Verify last notification time
- Check feed health (`/health`)

### Feed Failures
- Check `/blockstats` for blocking issues
- Verify feed URL is still valid
- Check feed is accessible from bot server
- Review feed health status

### Reddit Feeds Not Working
- Reddit may block automated access
- Check `/blockstats` for reddit.com statistics
- Wait for circuit breaker recovery
- Consider using Reddit API (requires credentials)

### YouTube Feeds Not Working
- Verify channel ID or handle is correct
- Check channel is public
- Ensure channel has videos
- Verify YouTube RSS feed is accessible

## Command Reference Summary

| Command | Description | Parameters |
|---------|-------------|------------|
| `/start` | Initialize bot | None |
| `/help` | Show help | None |
| `/ping` | Check connectivity | None |
| `/add` | Add feed | `<name> <url>` |
| `/remove` | Remove feed | `<name>` |
| `/list` | List feeds | None |
| `/enable` | Enable feed | `<name>` |
| `/disable` | Disable feed | `<name>` |
| `/health` | Check feed health | None |
| `/stats` | Show statistics | None |
| `/blockstats` | Show blocking stats | None |
