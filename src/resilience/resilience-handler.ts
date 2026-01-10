import { TelegramError, TelegramErrorType, RetryStrategy, RECOVERY_STRATEGIES, ResilienceHandler } from './types.js';
import { TelegramErrorClassifier } from './error-classifier.js';
import { logger } from '../utils/logger/logger.service.js';

/**
 * Main resilience handler that manages error interception and recovery strategies
 */
export class TelegramResilienceHandler implements ResilienceHandler {
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: Map<string, TelegramError> = new Map();

  /**
   * Handles a Telegram API error and determines recovery strategy
   */
  async handleTelegramError(error: TelegramError, context?: any): Promise<void> {
    const errorKey = `${error.method}_${error.errorType}`;
    
    // Increment error count for this method/type combination
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);
    this.lastErrors.set(errorKey, error);

    // Update retry count in error
    error.retryCount = currentCount;

    // Sanitize context before logging
    const { sanitizeForLogging } = await import('../utils/security/sanitizer.js');
    const sanitizedContext = context ? sanitizeForLogging(context) : undefined;
    
    logger.warn('Handling Telegram error', {
      method: error.method,
      errorType: error.errorType,
      code: error.code,
      description: error.description,
      retryCount: error.retryCount,
      timestamp: error.timestamp.toISOString(),
      context: sanitizedContext ? JSON.stringify(sanitizedContext).substring(0, 200) : undefined
    });

    // Get retry strategy for this error type
    const strategy = this.getRetryStrategy(error);
    
    // Check if we should continue retrying
    if (error.retryCount >= strategy.maxRetries) {
      logger.error('Max retries exceeded for Telegram error', {
        method: error.method,
        errorType: error.errorType,
        retryCount: error.retryCount,
        maxRetries: strategy.maxRetries
      });
      
      // Reset counter after max retries to allow future attempts
      this.errorCounts.delete(errorKey);
      return;
    }

    // Log retry strategy decision
    logger.info('Retry strategy selected', {
      method: error.method,
      errorType: error.errorType,
      strategy: {
        maxRetries: strategy.maxRetries,
        baseDelay: strategy.baseDelay,
        maxDelay: strategy.maxDelay,
        circuitBreakerEnabled: strategy.circuitBreakerEnabled,
        queueMessages: strategy.queueMessages
      }
    });
  }

  /**
   * Checks if an error is recoverable
   */
  isRecoverable(error: TelegramError): boolean {
    return TelegramErrorClassifier.isRecoverable(error);
  }

  /**
   * Determines if messages should be queued for this error type
   */
  shouldEnqueueMessage(error: TelegramError): boolean {
    const strategy = this.getRetryStrategy(error);
    return strategy.queueMessages && this.isRecoverable(error);
  }

  /**
   * Gets the retry strategy for a specific error type
   */
  getRetryStrategy(error: TelegramError): RetryStrategy {
    const baseStrategy = RECOVERY_STRATEGIES[error.errorType];
    
    // For rate limiting, check if we have a Retry-After header
    if (error.errorType === TelegramErrorType.RATE_LIMITED) {
      const retryAfterDelay = TelegramErrorClassifier.getRetryAfterDelay(error);
      if (retryAfterDelay) {
        return {
          ...baseStrategy,
          baseDelay: retryAfterDelay,
          maxDelay: Math.max(retryAfterDelay, baseStrategy.maxDelay)
        };
      }
    }

    return baseStrategy;
  }

  /**
   * Resets error counts for a specific method (called on successful requests)
   */
  resetErrorCount(method: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.errorCounts.keys()) {
      if (key.startsWith(`${method}_`)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.errorCounts.delete(key);
      this.lastErrors.delete(key);
    });

    if (keysToDelete.length > 0) {
      logger.debug('Reset error counts for successful method', {
        method,
        resetKeys: keysToDelete.length
      });
    }
  }

  /**
   * Gets current error statistics
   */
  getErrorStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [key, count] of this.errorCounts.entries()) {
      const lastError = this.lastErrors.get(key);
      stats[key] = {
        count,
        lastError: lastError ? {
          code: lastError.code,
          description: lastError.description,
          timestamp: lastError.timestamp.toISOString(),
          errorType: lastError.errorType
        } : null
      };
    }
    
    return stats;
  }

  /**
   * Clears all error statistics (useful for testing or manual reset)
   */
  clearErrorStats(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
    logger.info('Cleared all error statistics');
  }

  /**
   * Creates a TelegramError from a raw error
   */
  static createTelegramError(error: any, method: string = 'unknown', payload: any = null): TelegramError {
    return TelegramErrorClassifier.classifyError(error, method, payload);
  }
}

// Singleton instance
export const telegramResilienceHandler = new TelegramResilienceHandler();