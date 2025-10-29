import { RetryStrategy } from './types.js';
import { logger } from '../utils/logger/logger.service.js';

export interface BackoffCalculator {
  calculateDelay(retryCount: number, strategy: RetryStrategy): number;
  calculateDelayWithJitter(baseDelay: number, jitterEnabled: boolean): number;
  getNextRetryTime(retryCount: number, strategy: RetryStrategy): Date;
}

/**
 * Implements exponential backoff with jitter for retry delays
 */
export class ExponentialBackoff implements BackoffCalculator {
  /**
   * Calculates the delay for a retry attempt using exponential backoff
   */
  calculateDelay(retryCount: number, strategy: RetryStrategy): number {
    if (retryCount <= 0) {
      return 0;
    }

    // Calculate exponential delay: baseDelay * (multiplier ^ (retryCount - 1))
    const exponentialDelay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, retryCount - 1);
    
    // Cap at maximum delay
    const cappedDelay = Math.min(exponentialDelay, strategy.maxDelay);
    
    // Apply jitter if enabled
    const finalDelay = this.calculateDelayWithJitter(cappedDelay, strategy.jitter);

    logger.debug('Calculated exponential backoff delay', {
      retryCount,
      baseDelay: strategy.baseDelay,
      multiplier: strategy.backoffMultiplier,
      maxDelay: strategy.maxDelay,
      exponentialDelay,
      cappedDelay,
      finalDelay,
      jitterEnabled: strategy.jitter
    });

    return finalDelay;
  }

  /**
   * Applies jitter to a base delay to prevent thundering herd problem
   */
  calculateDelayWithJitter(baseDelay: number, jitterEnabled: boolean): number {
    if (!jitterEnabled || baseDelay <= 0) {
      return baseDelay;
    }

    // Use full jitter: random value between 0 and baseDelay
    // This provides the best distribution and prevents synchronized retries
    const jitteredDelay = Math.random() * baseDelay;

    logger.debug('Applied jitter to delay', {
      baseDelay,
      jitteredDelay,
      jitterReduction: baseDelay - jitteredDelay
    });

    return Math.floor(jitteredDelay);
  }

  /**
   * Gets the next retry time based on current time and calculated delay
   */
  getNextRetryTime(retryCount: number, strategy: RetryStrategy): Date {
    const delay = this.calculateDelay(retryCount, strategy);
    const nextRetryTime = new Date(Date.now() + delay);

    logger.debug('Calculated next retry time', {
      retryCount,
      delay,
      nextRetryTime: nextRetryTime.toISOString(),
      delaySeconds: delay / 1000
    });

    return nextRetryTime;
  }

  /**
   * Calculates delay specifically for rate limiting with Retry-After header
   */
  calculateRateLimitDelay(retryAfterSeconds: number, minDelay: number = 1000): number {
    // Convert seconds to milliseconds and ensure minimum delay
    const retryAfterMs = retryAfterSeconds * 1000;
    const delay = Math.max(retryAfterMs, minDelay);

    logger.info('Calculated rate limit delay from Retry-After header', {
      retryAfterSeconds,
      retryAfterMs,
      minDelay,
      finalDelay: delay
    });

    return delay;
  }

  /**
   * Calculates progressive delay for network errors (502, 503, 504)
   * Uses a more aggressive backoff for these specific errors
   */
  calculateNetworkErrorDelay(retryCount: number, _baseDelay: number = 1000): number {
    // For network errors, use sequence: 1s, 2s, 4s, 8s, 16s, 32s, 60s (capped)
    const delays = [1000, 2000, 4000, 8000, 16000, 32000, 60000];
    
    if (retryCount <= 0) {
      return 0;
    }

    const delayIndex = Math.min(retryCount - 1, delays.length - 1);
    const baseDelayFromSequence = delays[delayIndex] || 1000;
    
    // Apply jitter to prevent thundering herd
    const jitteredDelay = this.calculateDelayWithJitter(baseDelayFromSequence, true);

    logger.info('Calculated network error delay', {
      retryCount,
      delayIndex,
      baseDelayFromSequence,
      jitteredDelay,
      maxReached: retryCount > delays.length
    });

    return jitteredDelay;
  }

  /**
   * Gets a human-readable description of the delay
   */
  getDelayDescription(delayMs: number): string {
    if (delayMs < 1000) {
      return `${delayMs}ms`;
    } else if (delayMs < 60000) {
      return `${Math.round(delayMs / 1000)}s`;
    } else {
      const minutes = Math.round(delayMs / 60000);
      return `${minutes}m`;
    }
  }

  /**
   * Validates retry strategy parameters
   */
  validateStrategy(strategy: RetryStrategy): boolean {
    const issues: string[] = [];

    if (strategy.baseDelay < 0) {
      issues.push('baseDelay must be non-negative');
    }

    if (strategy.maxDelay < strategy.baseDelay) {
      issues.push('maxDelay must be greater than or equal to baseDelay');
    }

    if (strategy.backoffMultiplier <= 0) {
      issues.push('backoffMultiplier must be positive');
    }

    if (strategy.maxRetries < 0) {
      issues.push('maxRetries must be non-negative');
    }

    if (issues.length > 0) {
      logger.error('Invalid retry strategy', {
        strategy,
        issues
      });
      return false;
    }

    return true;
  }
}

// Singleton instance
export const exponentialBackoff = new ExponentialBackoff();