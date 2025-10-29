import { TelegramError, TelegramErrorType } from './types.js';
import { logger } from '../utils/logger/logger.service.js';

export interface RecoveryMetrics {
  successfulRecoveries: number;
  failedRecoveries: number;
  averageRecoveryTime: number;
  lastRecoveryAttempt: Date | null;
  recoverySuccessRate: number;
}

export interface RecoveryManager {
  calculateRecoveryProbability(domain: string, errorHistory: TelegramError[]): number;
  recordRecoveryAttempt(domain: string, success: boolean, duration?: number): void;
  getRecoveryMetrics(domain: string): RecoveryMetrics;
  shouldAttemptRecovery(domain: string, consecutiveFailures: number): boolean;
  getAdaptiveRecoveryDelay(domain: string, baseDelay: number): number;
}

/**
 * Manages adaptive recovery strategies based on error patterns and success rates
 */
export class TelegramRecoveryManager implements RecoveryManager {
  private recoveryHistory: Map<string, RecoveryMetrics> = new Map();
  private errorPatterns: Map<string, TelegramError[]> = new Map();

  /**
   * Calculates recovery probability based on recent error patterns and success history
   */
  calculateRecoveryProbability(domain: string, _errorHistory: TelegramError[]): number {
    const metrics = this.getRecoveryMetrics(domain);
    const recentErrors = this.getRecentErrors(domain, 5 * 60 * 1000); // Last 5 minutes
    
    // Base probability starts at 0.5
    let probability = 0.5;

    // Adjust based on recovery success rate
    if (metrics.successfulRecoveries + metrics.failedRecoveries > 0) {
      probability *= metrics.recoverySuccessRate;
    }

    // Reduce probability for rapid consecutive failures
    const rapidFailures = this.countRapidFailures(recentErrors, 60 * 1000); // Last minute
    if (rapidFailures > 3) {
      probability *= 0.3; // Significantly reduce for rapid failures
    }

    // Adjust based on error types
    const errorTypeWeights = this.calculateErrorTypeWeights(recentErrors);
    probability *= errorTypeWeights;

    // Time-based recovery (longer time since last failure = higher probability)
    const timeSinceLastError = this.getTimeSinceLastError(domain);
    if (timeSinceLastError > 0) {
      const timeBonus = Math.min(timeSinceLastError / (10 * 60 * 1000), 1.0); // Max bonus at 10 minutes
      probability = Math.min(probability + (timeBonus * 0.3), 1.0);
    }

    // Ensure probability is within bounds
    probability = Math.max(0.1, Math.min(probability, 0.9));

    logger.debug('Calculated recovery probability', {
      domain,
      baseProbability: 0.5,
      successRate: metrics.recoverySuccessRate,
      rapidFailures,
      errorTypeWeights,
      timeSinceLastError,
      finalProbability: probability
    });

    return probability;
  }

  /**
   * Records a recovery attempt and its outcome
   */
  recordRecoveryAttempt(domain: string, success: boolean, duration?: number): void {
    let metrics = this.recoveryHistory.get(domain);
    
    if (!metrics) {
      metrics = {
        successfulRecoveries: 0,
        failedRecoveries: 0,
        averageRecoveryTime: 0,
        lastRecoveryAttempt: null,
        recoverySuccessRate: 0
      };
      this.recoveryHistory.set(domain, metrics);
    }

    metrics.lastRecoveryAttempt = new Date();

    if (success) {
      metrics.successfulRecoveries++;
      
      if (duration) {
        // Update average recovery time
        const totalRecoveries = metrics.successfulRecoveries;
        metrics.averageRecoveryTime = 
          ((metrics.averageRecoveryTime * (totalRecoveries - 1)) + duration) / totalRecoveries;
      }
    } else {
      metrics.failedRecoveries++;
    }

    // Recalculate success rate
    const totalAttempts = metrics.successfulRecoveries + metrics.failedRecoveries;
    metrics.recoverySuccessRate = totalAttempts > 0 ? 
      metrics.successfulRecoveries / totalAttempts : 0;

    logger.info('Recorded recovery attempt', {
      domain,
      success,
      duration,
      successRate: metrics.recoverySuccessRate,
      totalAttempts
    });
  }

  /**
   * Gets recovery metrics for a domain
   */
  getRecoveryMetrics(domain: string): RecoveryMetrics {
    return this.recoveryHistory.get(domain) || {
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageRecoveryTime: 0,
      lastRecoveryAttempt: null,
      recoverySuccessRate: 0
    };
  }

  /**
   * Determines if recovery should be attempted based on current conditions
   */
  shouldAttemptRecovery(domain: string, consecutiveFailures: number): boolean {
    const metrics = this.getRecoveryMetrics(domain);
    const now = new Date();

    // Don't attempt recovery too frequently
    if (metrics.lastRecoveryAttempt) {
      const timeSinceLastAttempt = now.getTime() - metrics.lastRecoveryAttempt.getTime();
      const minInterval = this.getMinRecoveryInterval(consecutiveFailures);
      
      if (timeSinceLastAttempt < minInterval) {
        logger.debug('Recovery attempt too soon', {
          domain,
          timeSinceLastAttempt,
          minInterval,
          consecutiveFailures
        });
        return false;
      }
    }

    // Don't attempt if success rate is too low and we have enough data
    const totalAttempts = metrics.successfulRecoveries + metrics.failedRecoveries;
    if (totalAttempts >= 5 && metrics.recoverySuccessRate < 0.2) {
      logger.debug('Recovery success rate too low', {
        domain,
        successRate: metrics.recoverySuccessRate,
        totalAttempts
      });
      return false;
    }

    // Limit attempts based on consecutive failures
    if (consecutiveFailures > 10) {
      logger.debug('Too many consecutive failures for recovery', {
        domain,
        consecutiveFailures
      });
      return false;
    }

    return true;
  }

  /**
   * Calculates adaptive recovery delay based on recent patterns
   */
  getAdaptiveRecoveryDelay(domain: string, baseDelay: number): number {
    const metrics = this.getRecoveryMetrics(domain);
    const recentErrors = this.getRecentErrors(domain, 10 * 60 * 1000); // Last 10 minutes
    
    let multiplier = 1.0;

    // Increase delay if recovery success rate is low
    if (metrics.recoverySuccessRate < 0.5 && metrics.successfulRecoveries + metrics.failedRecoveries > 2) {
      multiplier *= 2.0;
    }

    // Increase delay for rapid error patterns
    const rapidErrors = this.countRapidFailures(recentErrors, 2 * 60 * 1000); // Last 2 minutes
    if (rapidErrors > 2) {
      multiplier *= 1.5;
    }

    // Adjust based on error types
    const hasNetworkErrors = recentErrors.some(e => e.errorType === TelegramErrorType.NETWORK_ERROR);
    if (hasNetworkErrors) {
      multiplier *= 1.3; // Network errors need more time
    }

    const adaptiveDelay = Math.min(baseDelay * multiplier, 5 * 60 * 1000); // Max 5 minutes

    logger.debug('Calculated adaptive recovery delay', {
      domain,
      baseDelay,
      multiplier,
      adaptiveDelay,
      successRate: metrics.recoverySuccessRate,
      rapidErrors
    });

    return adaptiveDelay;
  }

  /**
   * Records an error for pattern analysis
   */
  recordError(domain: string, error: TelegramError): void {
    let errors = this.errorPatterns.get(domain);
    if (!errors) {
      errors = [];
      this.errorPatterns.set(domain, errors);
    }

    errors.push(error);

    // Keep only recent errors (last hour)
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    this.errorPatterns.set(domain, errors.filter(e => e.timestamp > cutoff));
  }

  /**
   * Gets recent errors for a domain
   */
  private getRecentErrors(domain: string, timeWindowMs: number): TelegramError[] {
    const errors = this.errorPatterns.get(domain) || [];
    const cutoff = new Date(Date.now() - timeWindowMs);
    return errors.filter(e => e.timestamp > cutoff);
  }

  /**
   * Counts rapid failures within a time window
   */
  private countRapidFailures(errors: TelegramError[], timeWindowMs: number): number {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return errors.filter(e => e.timestamp > cutoff).length;
  }

  /**
   * Calculates error type weights for probability adjustment
   */
  private calculateErrorTypeWeights(errors: TelegramError[]): number {
    if (errors.length === 0) return 1.0;

    const typeWeights: Record<TelegramErrorType, number> = {
      [TelegramErrorType.NETWORK_ERROR]: 0.7,     // Network errors are harder to recover from
      [TelegramErrorType.RATE_LIMITED]: 0.9,      // Rate limits usually resolve quickly
      [TelegramErrorType.SERVER_ERROR]: 0.8,      // Server errors are moderate
      [TelegramErrorType.TIMEOUT]: 0.85,          // Timeouts are usually temporary
      [TelegramErrorType.CONNECTION_REFUSED]: 0.6, // Connection issues are serious
      [TelegramErrorType.CLIENT_ERROR]: 0.1       // Client errors rarely recover
    };

    // Calculate weighted average
    let totalWeight = 0;
    let weightSum = 0;

    for (const error of errors) {
      const weight = typeWeights[error.errorType] || 0.5;
      totalWeight += weight;
      weightSum += 1;
    }

    return weightSum > 0 ? totalWeight / weightSum : 1.0;
  }

  /**
   * Gets time since last error for a domain
   */
  private getTimeSinceLastError(domain: string): number {
    const errors = this.errorPatterns.get(domain) || [];
    if (errors.length === 0) return 0;

    const lastError = errors[errors.length - 1];
    if (!lastError) {
      return 0;
    }
    return Date.now() - lastError.timestamp.getTime();
  }

  /**
   * Gets minimum interval between recovery attempts based on failure count
   */
  private getMinRecoveryInterval(consecutiveFailures: number): number {
    // Progressive intervals: 30s, 1m, 2m, 5m, 10m
    const intervals = [30000, 60000, 120000, 300000, 600000];
    const index = Math.min(consecutiveFailures - 1, intervals.length - 1);
    return intervals[index] || 600000; // Default to 10 minutes
  }

  /**
   * Cleans up old data to prevent memory leaks
   */
  cleanup(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

    for (const [domain, errors] of this.errorPatterns.entries()) {
      const recentErrors = errors.filter(e => e.timestamp > cutoff);
      if (recentErrors.length === 0) {
        this.errorPatterns.delete(domain);
      } else {
        this.errorPatterns.set(domain, recentErrors);
      }
    }

    logger.debug('Cleaned up old recovery data');
  }
}

// Singleton instance
export const telegramRecoveryManager = new TelegramRecoveryManager();