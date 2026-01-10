/**
 * Security Sanitizer
 * 
 * Removes sensitive information (tokens, passwords, secrets) from data
 * before logging or serialization to prevent credential leaks.
 */

// Patterns to detect and sanitize
const SENSITIVE_PATTERNS = {
  // Telegram Bot Token: format is numbers:alphanumeric (e.g., 123456789:ABCdefGHIjklMNOpqrsTUVwxyz-123456789)
  telegramToken: /\d{8,}:[A-Za-z0-9_-]{35,}/g,
  
  // OAuth Bearer tokens
  bearerToken: /bearer\s+[A-Za-z0-9_-]{20,}/gi,
  
  // OAuth tokens in general (long alphanumeric strings)
  oauthToken: /\b[A-Za-z0-9_-]{40,}\b/g,
  
  // Base64 encoded tokens (common in Basic auth)
  base64Token: /[A-Za-z0-9+/]{40,}={0,2}/g,
  
  // Reddit client secrets (typically long alphanumeric)
  redditSecret: /\b[A-Za-z0-9_-]{30,}\b/g,
  
  // API keys (various formats)
  apiKey: /(api[_-]?key|apikey)[=:]\s*([A-Za-z0-9_-]{20,})/gi,
  
  // Authorization headers
  authHeader: /(authorization|auth)[=:]\s*(bearer|basic)\s+[^\s,;]+/gi,
  
  // URLs with credentials
  urlWithCreds: /https?:\/\/[^:]+:[^@]+@[^\s]+/gi,
};

// Field names that should always be sanitized
const SENSITIVE_FIELD_NAMES = [
  'token',
  'password',
  'secret',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'client_secret',
  'client_id',
  'authorization',
  'auth',
  'credential',
  'credentials',
  'bot_token',
  'reddit_client_secret',
  'reddit_password',
  'redis_password',
];

// Environment variable names that contain sensitive data
const SENSITIVE_ENV_VARS = [
  'BOT_TOKEN',
  'REDDIT_CLIENT_SECRET',
  'REDDIT_PASSWORD',
  'REDIS_PASSWORD',
  'REDDIT_CLIENT_ID',
  'REDDIT_USERNAME',
];

/**
 * Sanitize a string by replacing sensitive patterns
 */
export function sanitizeString(str: string): string {
  if (typeof str !== 'string' || !str) {
    return str;
  }

  let sanitized = str;

  // Replace Telegram bot tokens
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.telegramToken, '[REDACTED_TELEGRAM_TOKEN]');
  
  // Replace Bearer tokens
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.bearerToken, 'Bearer [REDACTED_TOKEN]');
  
  // Replace OAuth tokens (but be careful not to replace too much)
  // Only replace if it looks like a token (long enough and in context)
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.oauthToken, (match) => {
    // Don't replace if it's part of a URL path or common non-sensitive string
    if (match.length > 60 || /^[a-z0-9_-]+$/i.test(match)) {
      return '[REDACTED_TOKEN]';
    }
    return match;
  });
  
  // Replace base64 tokens (but be careful with legitimate base64 data)
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.base64Token, (match) => {
    // Only replace if it's in an auth context
    if (sanitized.toLowerCase().includes('authorization') || 
        sanitized.toLowerCase().includes('basic ') ||
        sanitized.toLowerCase().includes('bearer ')) {
      return '[REDACTED_BASE64]';
    }
    return match;
  });
  
  // Replace API keys
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.apiKey, '$1=[REDACTED_API_KEY]');
  
  // Replace authorization headers
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.authHeader, '$1=[REDACTED_AUTH_HEADER]');
  
  // Replace URLs with credentials
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.urlWithCreds, (match) => {
    try {
      const url = new URL(match);
      return `${url.protocol}//[REDACTED_CREDENTIALS]@${url.host}${url.pathname}${url.search}`;
    } catch {
      return '[REDACTED_URL_WITH_CREDS]';
    }
  });
  
  // Replace environment variable values in strings
  SENSITIVE_ENV_VARS.forEach(envVar => {
    const regex = new RegExp(`${envVar}[=:]\s*([^\\s,;\\n]+)`, 'gi');
    sanitized = sanitized.replace(regex, `${envVar}=[REDACTED_${envVar}]`);
  });

  return sanitized;
}

/**
 * Sanitize an error object
 */
export function sanitizeError(error: Error | unknown): Error {
  if (!(error instanceof Error)) {
    return new Error('[REDACTED_NON_ERROR]');
  }

  const sanitizedError = new Error(sanitizeString(error.message));
  sanitizedError.name = error.name;
  
  // Sanitize stack trace
  if (error.stack) {
    sanitizedError.stack = sanitizeString(error.stack);
  }

  return sanitizedError;
}

/**
 * Sanitize an object recursively
 */
export function sanitizeObject(obj: any, depth = 0, maxDepth = 10): any {
  // Prevent infinite recursion
  if (depth > maxDepth) {
    return '[MAX_DEPTH_REACHED]';
  }

  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1, maxDepth));
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return obj;
  }

  // Handle Error objects
  if (obj instanceof Error) {
    return sanitizeError(obj);
  }

  // Handle regular objects
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if field name indicates sensitive data
    const isSensitiveField = SENSITIVE_FIELD_NAMES.some(
      sensitiveName => lowerKey.includes(sensitiveName)
    );

    if (isSensitiveField) {
      // Replace sensitive field values
      if (typeof value === 'string') {
        sanitized[key] = '[REDACTED_' + key.toUpperCase() + ']';
      } else if (value !== null && value !== undefined) {
        sanitized[key] = '[REDACTED_' + key.toUpperCase() + ']';
      } else {
        sanitized[key] = value;
      }
    } else {
      // Recursively sanitize non-sensitive fields
      sanitized[key] = sanitizeObject(value, depth + 1, maxDepth);
    }
  }

  return sanitized;
}

/**
 * Sanitize data for logging
 * This is the main function to use before logging any data
 */
export function sanitizeForLogging(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle strings
  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  // Handle errors
  if (data instanceof Error) {
    return sanitizeError(data);
  }

  // Handle objects and arrays
  return sanitizeObject(data);
}

/**
 * Sanitize a URL by removing credentials
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') {
    return url;
  }

  try {
    const urlObj = new URL(url);
    
    // Remove credentials from URL
    if (urlObj.username || urlObj.password) {
      urlObj.username = '';
      urlObj.password = '';
    }
    
    // Remove sensitive query parameters
    const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth', 'api_key', 'access_token'];
    sensitiveParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    return urlObj.toString();
  } catch {
    // If URL parsing fails, try to sanitize as string
    return sanitizeString(url);
  }
}

/**
 * Check if a string contains sensitive data (without sanitizing)
 */
export function containsSensitiveData(str: string): boolean {
  if (typeof str !== 'string' || !str) {
    return false;
  }

  // Check all patterns
  for (const pattern of Object.values(SENSITIVE_PATTERNS)) {
    if (pattern.test(str)) {
      return true;
    }
  }

  // Check for environment variable names
  for (const envVar of SENSITIVE_ENV_VARS) {
    if (str.includes(envVar)) {
      return true;
    }
  }

  return false;
}
