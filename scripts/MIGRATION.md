# Migration Guide: RSS Skull Bot v1 to v2

This guide explains how to migrate data from RSS Skull Bot v1 to the new v2 architecture.

## Overview

The migration script transforms data from the old schema structure to the new v2 schema:

### Old Schema (v1)
- `rss` table: Feed configurations with integer IDs
- `setting` table: Chat-specific settings
- `statistic` table: Usage statistics with integer feed references

### New Schema (v2)
- `Chat` + `ChatSettings`: Normalized chat and settings data
- `Feed` + `FeedFilter`: Enhanced feed management with CUID IDs
- `Statistic`: Improved statistics with string references

## Prerequisites

1. **Backup your v1 database** before starting migration
2. **Install dependencies**: `npm install`
3. **Setup v2 database**: `npm run db:migrate`
4. **Ensure Redis is running**: `npm run docker:dev`

## Migration Process

### Step 1: Prepare Migration

```bash
# Install dependencies if not already done
npm install

# Generate Prisma client
npm run db:generate

# Ensure the new database schema is ready
npm run db:migrate
```

### Step 2: Run Migration

```bash
# Basic migration
npm run migrate:v1 /path/to/old/database.db

# Example with specific path
npm run migrate:v1 ./old-bot-data/rss_skull.db
```

### Step 3: Verify Migration

After migration, verify the data:

```bash
# Check migrated data using Prisma Studio (optional)
npx prisma studio

# Or check via SQLite CLI
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Chat;"
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Feed;"
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Statistic;"
```

## Migration Details

### Data Transformations

#### Chat Migration
- **Chat Type Detection**: Inferred from Telegram chat ID patterns
  - Positive IDs → `private`
  - Negative IDs < -1000000000000 → `channel`
  - Other negative IDs → `group`
- **Chat Titles**: Auto-generated for groups/channels

#### Feed Migration
- **ID Conversion**: Integer IDs → CUID strings
- **URL Enhancement**: 
  - Original URL preserved in `url` field
  - Auto-converted RSS URLs in `rssUrl` field
  - Reddit URLs: `reddit.com/r/subreddit` → `reddit.com/r/subreddit.rss`
  - YouTube channels: Converted to RSS feed format
- **Boolean Conversion**: SQLite integers (0/1) → proper booleans

#### Settings Migration
- **Default Values**: Applied for missing settings
- **Language**: Defaults to 'en' if not specified
- **Check Interval**: Defaults to 300 seconds (5 minutes)
- **Filters**: Enabled by default

#### Statistics Migration
- **Feed References**: Old integer feed IDs mapped to new CUID strings
- **Action Normalization**: Standardized action names
- **Date Handling**: Proper DateTime conversion

### Error Handling

The migration script includes comprehensive error handling:

- **Schema Validation**: Ensures old database has required tables
- **Data Validation**: Uses Zod schemas for type safety
- **Rollback Safety**: Migration doesn't modify the original database
- **Progress Reporting**: Detailed logging of migration steps

### Troubleshooting

#### Common Issues

1. **Missing Tables Error**
   ```
   Error: Missing required tables in old database: rss, setting, statistic
   ```
   - **Solution**: Verify the old database path and table names

2. **Invalid URL Error**
   ```
   Error: Invalid URL format in feed data
   ```
   - **Solution**: Check feed URLs in old database for malformed entries

3. **Chat ID Conflicts**
   ```
   Error: Unique constraint failed: Chat.id
   ```
   - **Solution**: Ensure the new database is empty before migration

#### Recovery Steps

If migration fails:

1. **Reset the new database**:
   ```bash
   npm run db:reset
   ```

2. **Fix the issue** based on error message

3. **Re-run migration**:
   ```bash
   npm run migrate:v1 /path/to/old/database.db
   ```

## Post-Migration Steps

### 1. Verify Bot Functionality

```bash
# Start the bot in development mode
npm run dev

# Test basic commands in Telegram:
# /start, /list, /help
```

### 2. Update Environment Configuration

Ensure your `.env` file has the correct settings:

```env
BOT_TOKEN=your_bot_token_here
DATABASE_URL=file:./prisma/dev.db
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 3. Production Deployment

After successful migration and testing:

```bash
# Build for production
npm run build

# Deploy using Docker
npm run docker:up
```

## Migration Script API

The migration script can also be used programmatically:

```typescript
import { MigrationService } from './scripts/migrate-from-v1.js';

const migrationService = new MigrationService('./old-database.db');
await migrationService.migrate();
```

## Support

If you encounter issues during migration:

1. Check the error logs for specific details
2. Verify your old database structure matches expected format
3. Ensure all prerequisites are met
4. Create an issue with migration logs if problems persist

## Data Backup Recommendations

- **Before Migration**: Create a full backup of your v1 database
- **After Migration**: Export v2 data using built-in export commands
- **Regular Backups**: Set up automated backups for production use

---

**Note**: This migration is designed to be run once. Running it multiple times on the same data may create duplicates.