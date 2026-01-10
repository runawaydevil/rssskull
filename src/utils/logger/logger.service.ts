import { config } from '../../config/config.service.js';
import { sanitizeForLogging, sanitizeString } from '../security/sanitizer.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private logLevel: LogLevel;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor() {
    this.logLevel = config.app.logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.logLevel];
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    
    // Sanitize message first
    const sanitizedMessage = sanitizeString(message);
    
    // Sanitize all arguments before serialization
    const sanitizedArgs = args.length > 0
      ? args.map((arg) => {
          // Sanitize before JSON.stringify to prevent token leaks
          const sanitized = sanitizeForLogging(arg);
          return typeof sanitized === 'object' ? JSON.stringify(sanitized, null, 2) : String(sanitized);
        })
      : [];

    const formattedArgs = sanitizedArgs.length > 0 ? ` ${sanitizedArgs.join(' ')}` : '';

    return `[${timestamp}] [${level.toUpperCase()}] ${sanitizedMessage}${formattedArgs}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }
}

export const logger = new Logger();
