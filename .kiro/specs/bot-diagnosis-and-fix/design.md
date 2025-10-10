# Bot Diagnosis and Fix - Design Document

## Overview

The RSS Skull Bot is currently running in a limited "FEED-ONLY MODE" which explains why it's not responding to commands or functioning as a complete Telegram bot. This design addresses the complete system architecture needed to restore full functionality.

## Root Cause Analysis

Based on the logs and code analysis, the main issues are:

1. **Wrong Main Entry Point**: The bot is using `src/main.ts` which runs in FEED-ONLY MODE instead of the full bot mode
2. **Initialization Hang**: The original bot initialization hangs during the `loadAndScheduleAllFeeds()` function
3. **Missing Bot Service**: The Telegram bot service is not being initialized in the current mode
4. **Job Queue Issues**: Feed processing jobs may not be connecting to the notification system properly

## Architecture

### Current Architecture (Broken)
```
main.ts (FEED-ONLY MODE)
├── Database ✅
├── Fastify Server ✅
├── Job Queue ✅
├── Feed Loading ✅
└── Telegram Bot ❌ (Missing)
```

### Target Architecture (Fixed)
```
main.ts (FULL BOT MODE)
├── Database ✅
├── Fastify Server ✅
├── Job Queue ✅
├── Telegram Bot ✅
│   ├── Command Handlers ✅
│   ├── Message Processing ✅
│   └── Notification Service ✅
└── Feed Loading ✅ (After bot starts)
```

## Components and Interfaces

### 1. Main Application Entry Point

**Current Issue**: Using feed-only mode
**Solution**: Create a proper main.ts that initializes the full bot

```typescript
interface MainApplication {
  initializeDatabase(): Promise<void>
  initializeBotService(): Promise<void>
  initializeJobQueue(): Promise<void>
  initializeWebServer(): Promise<void>
  loadExistingFeeds(): Promise<void>
}
```

### 2. Bot Service Initialization

**Current Issue**: Bot hangs during initialization
**Solution**: Implement staged initialization with timeouts

```typescript
interface BotInitialization {
  initializeNotificationService(): Promise<void>
  getBotInfo(): Promise<BotInfo>
  registerCommands(): Promise<void>
  startPolling(): Promise<void>
  loadFeedsAsync(): void // Non-blocking
}
```

### 3. Feed Processing Pipeline

**Current Issue**: Feeds are loaded but not connected to bot
**Solution**: Ensure proper connection between job queue and notification service

```typescript
interface FeedProcessingPipeline {
  scheduleFeeds(): Promise<void>
  processFeedCheck(job: FeedCheckJob): Promise<void>
  sendNotifications(items: RSSItem[]): Promise<void>
  handleErrors(error: Error): Promise<void>
}
```

### 4. Command Processing System

**Current Issue**: Commands not being processed
**Solution**: Ensure command router is properly initialized and connected

```typescript
interface CommandSystem {
  registerCommandHandlers(): void
  processTextMessage(ctx: Context): Promise<void>
  handleMentions(ctx: Context): Promise<void>
  executeCommand(command: string, args: string[]): Promise<void>
}
```

## Data Models

### Bot Configuration
```typescript
interface BotConfig {
  token: string
  mode: 'full' | 'feed-only' | 'debug'
  database: DatabaseConfig
  redis: RedisConfig
  server: ServerConfig
}
```

### Initialization State
```typescript
interface InitializationState {
  database: boolean
  redis: boolean
  botService: boolean
  webServer: boolean
  feedsLoaded: boolean
  errors: string[]
}
```

## Error Handling

### 1. Initialization Errors
- **Timeout Handling**: Add timeouts to all initialization steps
- **Graceful Degradation**: Allow bot to start even if some feeds fail to load
- **Clear Error Messages**: Provide specific error information for debugging

### 2. Runtime Errors
- **Command Errors**: Handle invalid commands gracefully
- **Feed Processing Errors**: Implement retry logic with exponential backoff
- **Network Errors**: Handle Telegram API and RSS feed network issues

### 3. Recovery Mechanisms
- **Automatic Retry**: Retry failed operations with increasing delays
- **Circuit Breaker**: Temporarily disable failing feeds
- **Health Monitoring**: Continuous health checks with automatic recovery

## Testing Strategy

### 1. Unit Tests
- Test individual components in isolation
- Mock external dependencies (Telegram API, RSS feeds)
- Verify error handling and edge cases

### 2. Integration Tests
- Test component interactions
- Verify database and Redis connectivity
- Test command processing end-to-end

### 3. System Tests
- Test complete bot initialization
- Verify feed processing pipeline
- Test error recovery mechanisms

### 4. Manual Testing
- Test bot commands in real Telegram chats
- Verify RSS feed processing and delivery
- Test error scenarios and recovery

## Implementation Plan

### Phase 1: Fix Main Entry Point
1. Create proper main.ts that initializes full bot
2. Add staged initialization with proper error handling
3. Implement timeout mechanisms for each initialization step

### Phase 2: Fix Bot Service Initialization
1. Modify BotService to use non-blocking feed loading
2. Add detailed logging for each initialization step
3. Implement proper error handling and recovery

### Phase 3: Fix Feed Processing
1. Ensure job queue connects to notification service
2. Verify feed processing jobs are working correctly
3. Test RSS item delivery to Telegram chats

### Phase 4: Fix Command Processing
1. Verify command router initialization
2. Test all command handlers
3. Ensure proper mention processing in channels

### Phase 5: Testing and Validation
1. Run comprehensive tests
2. Verify all functionality works end-to-end
3. Monitor system health and performance

## Monitoring and Observability

### Logging Strategy
- **Structured Logging**: Use consistent log format with context
- **Log Levels**: Appropriate use of debug, info, warn, error levels
- **Performance Metrics**: Log timing information for key operations

### Health Checks
- **Component Health**: Individual health checks for each component
- **End-to-End Health**: Verify complete functionality
- **Performance Metrics**: Track response times and success rates

### Alerting
- **Critical Errors**: Alert on system failures
- **Performance Degradation**: Alert on slow response times
- **Feed Failures**: Alert on consistent feed processing failures

## Security Considerations

### Bot Token Security
- Ensure bot token is properly secured
- Validate token format and permissions
- Handle token-related errors gracefully

### Input Validation
- Validate all user inputs
- Sanitize RSS feed URLs
- Prevent injection attacks

### Rate Limiting
- Implement proper rate limiting for external APIs
- Handle rate limit responses gracefully
- Protect against abuse

## Performance Optimization

### Resource Management
- Efficient memory usage
- Proper connection pooling
- Garbage collection optimization

### Caching Strategy
- Cache RSS feed responses
- Cache bot command responses
- Implement cache invalidation

### Scalability
- Design for horizontal scaling
- Efficient job queue processing
- Database query optimization