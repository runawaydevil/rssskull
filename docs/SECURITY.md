# Security Guide

This document outlines security practices for RSS Skull Bot to prevent credential leaks and ensure safe operation.

## Overview

RSS Skull Bot handles sensitive credentials including:
- Telegram Bot Tokens
- Reddit OAuth credentials (Client ID, Client Secret, Username, Password)
- Redis passwords
- OAuth access tokens

**All credentials must be kept secure and never exposed in logs, error messages, or code.**

## Security Principles

### 1. Never Hardcode Credentials

❌ **BAD:**
```typescript
const botToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz-123456789';
```

✅ **GOOD:**
```typescript
const botToken = process.env.BOT_TOKEN || '';
```

### 2. Never Log Credentials

❌ **BAD:**
```typescript
logger.info(`Bot token: ${config.bot.token}`);
logger.error(`Failed with token: ${token}`);
```

✅ **GOOD:**
```typescript
logger.info('Bot token configured');
logger.error('Authentication failed'); // Token is automatically sanitized
```

### 3. Sanitize All Logs

The logger automatically sanitizes all data before logging. However, when using `console.log` directly, you must sanitize manually:

❌ **BAD:**
```typescript
console.log('Error:', error);
console.log('Data:', JSON.stringify(data));
```

✅ **GOOD:**
```typescript
import { sanitizeForLogging } from './utils/security/sanitizer.js';
console.log('Error:', sanitizeForLogging(error));
console.log('Data:', JSON.stringify(sanitizeForLogging(data)));
```

### 4. Sanitize Error Messages for Users

❌ **BAD:**
```typescript
await ctx.reply(`Error: ${error.message}`);
```

✅ **GOOD:**
```typescript
import { getSafeErrorMessage } from './utils/security/error-sanitizer.js';
await ctx.reply(`Error: ${getSafeErrorMessage(error)}`);
```

### 5. Sanitize JSON Serialization

❌ **BAD:**
```typescript
logger.debug('Update:', JSON.stringify(ctx.update));
```

✅ **GOOD:**
```typescript
import { sanitizeForLogging } from './utils/security/sanitizer.js';
logger.debug('Update:', sanitizeForLogging(ctx.update));
```

## Security Utilities

### Sanitizer (`src/utils/security/sanitizer.ts`)

Main sanitization functions:

- `sanitizeString(str: string): string` - Sanitizes a string
- `sanitizeError(error: Error): Error` - Sanitizes an error object
- `sanitizeObject(obj: any): any` - Recursively sanitizes an object
- `sanitizeForLogging(data: any): any` - Main function for sanitizing any data before logging
- `sanitizeUrl(url: string): string` - Removes credentials from URLs

**Usage:**
```typescript
import { sanitizeForLogging } from './utils/security/sanitizer.js';

// Before logging
const sanitized = sanitizeForLogging(data);
logger.info('Data:', sanitized);
```

### Error Sanitizer (`src/utils/security/error-sanitizer.ts`)

Functions for safe error messages:

- `getSafeErrorMessage(error: Error | unknown): string` - Safe error message for users
- `getSafeErrorDetails(error: Error | unknown): object` - Safe error details for logging
- `createSafeError(error: Error | unknown): Error` - Creates a sanitized error object

**Usage:**
```typescript
import { getSafeErrorMessage } from './utils/security/error-sanitizer.js';

try {
  // ... code that might throw
} catch (error) {
  await ctx.reply(`Error: ${getSafeErrorMessage(error)}`);
}
```

## What Gets Sanitized

The sanitizer automatically detects and redacts:

1. **Telegram Bot Tokens** - Format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz-123456789`
2. **OAuth Tokens** - Bearer tokens, access tokens, refresh tokens
3. **Base64 Encoded Credentials** - In authorization headers
4. **API Keys** - In various formats
5. **Passwords** - In field names containing "password", "secret", "token", etc.
6. **URLs with Credentials** - Removes username:password from URLs
7. **Environment Variables** - Values of sensitive env vars in strings

## Patterns Detected

The sanitizer uses these patterns to detect sensitive data:

- Telegram tokens: `\d{8,}:[A-Za-z0-9_-]{35,}`
- OAuth tokens: `[A-Za-z0-9_-]{40,}`
- Bearer tokens: `bearer\s+[A-Za-z0-9_-]{20,}`
- Base64 tokens: `[A-Za-z0-9+/]{40,}={0,2}`
- URLs with credentials: `https?://[^:]+:[^@]+@[^\s]+`

## Field Names Sanitized

These field names are automatically sanitized in objects:

- `token`, `password`, `secret`
- `apikey`, `api_key`
- `access_token`, `refresh_token`
- `client_secret`, `client_id`
- `authorization`, `auth`
- `credential`, `credentials`
- `bot_token`
- `reddit_client_secret`, `reddit_password`
- `redis_password`

## Environment Variables

Sensitive environment variables (values are sanitized if found in strings):

- `BOT_TOKEN`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_PASSWORD`
- `REDIS_PASSWORD`
- `REDDIT_CLIENT_ID`
- `REDDIT_USERNAME`

## Adding New Logs

When adding new logging code, follow this checklist:

- [ ] Use `logger.*` methods (automatic sanitization) instead of `console.*`
- [ ] If using `console.*`, manually sanitize with `sanitizeForLogging()`
- [ ] Never log raw error objects - use `getSafeErrorMessage()` for user-facing errors
- [ ] Sanitize objects before `JSON.stringify()`
- [ ] Test that logs don't contain actual tokens (use test tokens)

## Adding New Error Handling

When adding error handling:

- [ ] Use `getSafeErrorMessage()` for user-facing error messages
- [ ] Use `getSafeErrorDetails()` for logging error details
- [ ] Never return `error.message` directly to users
- [ ] Never log `error.stack` without sanitization (logger does this automatically)

## Testing Security

### Manual Testing

1. Set a test token: `BOT_TOKEN=123456789:TEST_TOKEN_FOR_SECURITY_TEST`
2. Trigger error conditions
3. Check logs - token should appear as `[REDACTED_TELEGRAM_TOKEN]`
4. Check user-facing error messages - should not contain tokens

### Automated Testing

Run security validation (development only):

```typescript
import { validateSecurity } from './utils/security/security-validator.js';

const result = await validateSecurity();
if (!result.isValid) {
  console.error('Security validation failed:', result.issues);
}
```

## Common Mistakes

### 1. Logging Configuration Objects

❌ **BAD:**
```typescript
logger.debug('Config:', config); // May contain tokens
```

✅ **GOOD:**
```typescript
logger.debug('Config loaded'); // Logger automatically sanitizes
// Or if you need to log specific non-sensitive fields:
logger.debug('Config:', { port: config.server.port, host: config.server.host });
```

### 2. Error Messages in Responses

❌ **BAD:**
```typescript
catch (error) {
  await ctx.reply(`Failed: ${error.message}`);
}
```

✅ **GOOD:**
```typescript
catch (error) {
  await ctx.reply(`Failed: ${getSafeErrorMessage(error)}`);
}
```

### 3. JSON Serialization

❌ **BAD:**
```typescript
logger.debug('Data:', JSON.stringify(data));
```

✅ **GOOD:**
```typescript
import { sanitizeForLogging } from './utils/security/sanitizer.js';
logger.debug('Data:', sanitizeForLogging(data));
// Or use logger which does this automatically:
logger.debug('Data:', data); // Automatically sanitized
```

## Security Checklist

Before committing code:

- [ ] No hardcoded tokens or credentials
- [ ] All `console.*` calls sanitize data
- [ ] All user-facing error messages use `getSafeErrorMessage()`
- [ ] All `JSON.stringify()` calls sanitize data first
- [ ] No tokens in commit messages or PR descriptions
- [ ] `.env` file is in `.gitignore`
- [ ] `.env.example` contains only example values

## Incident Response

If credentials are accidentally exposed:

1. **Immediately rotate the exposed credentials**
2. **Review logs** to determine scope of exposure
3. **Check git history** if credentials were committed
4. **Update `.gitignore`** if needed
5. **Update documentation** with lessons learned

## Additional Resources

- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Telegram Bot Security](https://core.telegram.org/bots/security)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## Questions?

If you're unsure about security practices, ask before committing code that handles credentials.
