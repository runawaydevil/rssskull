import { CircuitBreakerService, CircuitBreakerConfig } from '../utils/circuit-breaker.service.js';
import { TelegramError, TelegramErrorType } from './types.js';
import { logger } from '../utils/logger/logger.service.js';

export interface TelegramCircuitBreakerConfig extends CircuitBreakerConfig {
  telegramSpecificThresholds: {
    badGateway: number;      // 502 errors threshold
    rateLimited: number;     // 429 errors threshold  
    serverError: number;     // 5xx errors threshold
  };
  criticalMethods: string[]; // Methods that bypass circuit breaker
  recoveryWindow: number;    // Time window for recovery assessment
}

export interface TelegramCircuitBreaker {
  handleTelegramSpecificError(error: TelegramError): void;
  getTelegramBackoffDelay(consecutiveFailures: number): number;
  shouldSkipCircuitBreaker(method: string): boolean;
  getRecoveryProbability(): number;
}

/**
 * Enhanced Circuit Breaker specifically designed for Telegram API errors
 */
export class TelegramCircuitBreakerService extends CircuitBreakerService implements TelegramCircuitBreaker {
  private telegramConfig: TelegramCircuitBreakerConfig;
  private errorTypeCounters: Map<string, Map<TelegramErrorType, number>> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();

  constructor(config?: Partial<TelegramCircuitBreakerConfig>) {
    const defaultTelegramConfig: TelegramCircuitBreakerConfig = {
      failureThreshold: 5,          // Lower threshold for Telegram
      resetTimeout: 5 * 60 * 1000,  // 5 minutes
      monitoringWindow: 10 * 60 * 1000, // 10 minutes
      adaptiveThreshold: true,
      successThreshold: 3,
      slowResponseThreshold: 15000, // 15 seconds for Telegram
      telegramSpecificThresholds: {
        badGateway: 3,    // 502 errors - very sensitive
        rateLimited: 2,   // 429 errors - respect rate limits
        serverError: 5    // 5xx errors - moderate tolerance
      },
      criticalMethods: ['getMe', 'setWebhook', 'deleteWebhook', 'getWebhookInfo'],
      recoveryWindow: 5 * 60 * 1000 // 5 minutes
    };

    const mergedConfig = { ...defaultTelegramConfig, ...config };
    super(mergedConfig);
    this.telegramConfig = mergedConfig;
  }

  /**
   * Handles Telegram-specific error logic
   */
  handleTelegramSpecificError(error: TelegramError): void {
    const domain = 'telegram_api';
    
    // Initialize counters if not exists
    if (!this.errorTypeCounters.has(domain)) {
      this.errorTypeCounters.set(domain, new Map());
    }
    
    const domainCounters = this.errorTypeCounters.get(domain)!;
    const currentCount = domainCounters.get(error.errorType) || 0;
    domainCounters.set(error.errorType, currentCount + 1);

    // Check if we should skip circuit breaker for critical methods
    if (this.shouldSkipCircuitBreaker(error.method)) {
      logger.info('Skipping circuit breaker for critical method', {
        method: error.method,
        errorType: error.errorType,
        errorCode: error.code
      });
      return;
    }

    // Apply Telegram-specific thresholds
    const threshold = this.getTelegramSpecificThreshold(error.errorType);
    
    if (currentCount + 1 >= threshold) {
      logger.warn('Telegram-specific threshold reached', {
        errorType: error.errorType,
        count: currentCount + 1,
        threshold,
        method: error.method
      });
      
      // Force circuit breaker to open
      this.recordFailure(domain);
    }

    // Handle rate limiting specially
    if (error.errorType === TelegramErrorType.RATE_LIMITED) {
      this.handleRateLimiting(error);
    }

    // Handle network errors with aggressive backoff
    if (error.errorType === TelegramErrorType.NETWORK_ERROR) {
      this.handleNetworkError(error);
    }
  }

  /**
   * Gets Telegram-specific backoff delay based on consecutive failures
   */
  getTelegramBackoffDelay(consecutiveFailures: number): number {
    // Telegram-specific backoff sequence: 1s, 2s, 4s, 8s, 16s, 32s, 60s (max)
    const delays = [1000, 2000, 4000, 8000, 16000, 32000, 60000];
    const index = Math.min(consecutiveFailures - 1, delays.length - 1);
    const baseDelay = delays[index] || 60000;
    
    // Add jitter (±25%)
    const jitter = baseDelay * 0.25 * (Math.random() - 0.5);
    const finalDelay = Math.max(1000, baseDelay + jitter);

    logger.debug('Calculated Telegram backoff delay', {
      consecutiveFailures,
      baseDelay,
      jitter,
      finalDelay
    });

    return finalDelay;
  }

  /**
   * Determines if circuit breaker should be bypassed for critical methods
   */
  shouldSkipCircuitBreaker(method: string): boolean {
    return this.telegramConfig.criticalMethods.includes(method);
  }

  /**
   * Calculates recovery probability based on recent success rate
   */
  getRecoveryProbability(): number {
    const domain = 'telegram_api';
    const breaker = this.getState(domain);
    
    if (breaker.state !== 'OPEN') {
      return 1.0; // Always allow if not open
    }

    const now = Date.now();
    const timeSinceLastFailure = now - breaker.lastFailureTime;
    const recoveryWindowMs = this.telegramConfig.recoveryWindow;

    // Base probability increases over time
    let probability = Math.min(timeSinceLastFailure / recoveryWindowMs, 1.0);

    // Adjust based on recovery attempts
    const attempts = this.recoveryAttempts.get(domain) || 0;
    if (attempts > 3) {
      probability *= 0.5; // Reduce probability after multiple failed attempts
    }

    logger.debug('Calculated recovery probability', {
      domain,
      timeSinceLastFailure,
      recoveryWindowMs,
      attempts,
      probability
    });

    return probability;
  }

  /**
   * Override canExecute to include recovery probability
   */
  async canExecute(domain: string): Promise<boolean> {
    const canExecuteBase = await super.canExecute(domain);
    
    if (!canExecuteBase && domain === 'telegram_api') {
      // Check recovery probability for Telegram API
      const probability = this.getRecoveryProbability();
      const shouldAttempt = Math.random() < probability;
      
      if (shouldAttempt) {
        logger.info('Allowing execution based on recovery probability', {
          domain,
          probability,
          randomValue: Math.random()
        });
        
        // Increment recovery attempts
        const attempts = this.recoveryAttempts.get(domain) || 0;
        this.recoveryAttempts.set(domain, attempts + 1);
        
        return true;
      }
    }

    return canExecuteBase;
  }

  /**
   * Override recordSuccess to reset Telegram-specific counters
   */
  recordSuccess(domain: string, responseTime?: number): void {
    super.recordSuccess(domain, responseTime);
    
    if (domain === 'telegram_api') {
      // Reset error type counters on success
      this.errorTypeCounters.delete(domain);
      this.recoveryAttempts.delete(domain);
      
      logger.debug('Reset Telegram error counters on success', { domain });
    }
  }

  /**
   * Gets Telegram-specific threshold for error type
   */
  private getTelegramSpecificThreshold(errorType: TelegramErrorType): number {
    switch (errorType) {
      case TelegramErrorType.NETWORK_ERROR:
        return this.telegramConfig.telegramSpecificThresholds.badGateway;
      case TelegramErrorType.RATE_LIMITED:
        return this.telegramConfig.telegramSpecificThresholds.rateLimited;
      case TelegramErrorType.SERVER_ERROR:
        return this.telegramConfig.telegramSpecificThresholds.serverError;
      default:
        return this.telegramConfig.failureThreshold;
    }
  }

  /**
   * Handles rate limiting errors specially
   */
  private handleRateLimiting(error: TelegramError): void {
    logger.warn('Rate limiting detected', {
      method: error.method,
      code: error.code,
      description: error.description,
      retryCount: error.retryCount
    });

    // For rate limiting, we should respect the Retry-After header
    // This will be handled by the exponential backoff system
  }

  /**
   * Handles network errors with special logic
   */
  private handleNetworkError(error: TelegramError): void {
    logger.warn('Network error detected', {
      method: error.method,
      code: error.code,
      description: error.description,
      retryCount: error.retryCount
    });

    // Network errors (502, 503, 504) should trigger more aggressive circuit breaking
    if (error.code === 502) {
      // Bad Gateway is particularly problematic - be more aggressive
      const domain = 'telegram_api';
      const domainCounters = this.errorTypeCounters.get(domain);
      const badGatewayCount = domainCounters?.get(TelegramErrorType.NETWORK_ERROR) || 0;
      
      if (badGatewayCount >= 2) {
        logger.warn('Multiple Bad Gateway errors detected, forcing circuit breaker open', {
          count: badGatewayCount,
          method: error.method
        });
        
        // Force multiple failures to open circuit breaker quickly
        for (let i = 0; i < 3; i++) {
          this.recordFailure(domain);
        }
      }
    }
  }

  /**
   * Gets Telegram-specific statistics
   */
  getTelegramStats(): Record<string, any> {
    const baseStats = this.getStats();
    const domain = 'telegram_api';
    
    const errorTypeCounts: Record<string, number> = {};
    const domainCounters = this.errorTypeCounters.get(domain);
    
    if (domainCounters) {
      for (const [errorType, count] of domainCounters.entries()) {
        errorTypeCounts[errorType] = count;
      }
    }

    return {
      ...baseStats,
      telegram: {
        errorTypeCounts,
        recoveryAttempts: this.recoveryAttempts.get(domain) || 0,
        recoveryProbability: this.getRecoveryProbability(),
        criticalMethods: this.telegramConfig.criticalMethods,
        thresholds: this.telegramConfig.telegramSpecificThresholds
      }
    };
  }

  /**
   * Resets all Telegram-specific state
   */
  resetTelegramState(): void {
    const domain = 'telegram_api';
    this.reset(domain);
    this.errorTypeCounters.delete(domain);
    this.recoveryAttempts.delete(domain);
    
    logger.info('Reset all Telegram circuit breaker state');
  }
}

// Singleton instance
export const telegramCircuitBreaker = new TelegramCircuitBreakerService();