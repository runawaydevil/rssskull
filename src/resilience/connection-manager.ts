import { ConnectionState, TelegramError } from './types.js';
import { ConnectionPersistence, ConnectionStatePersistence } from './connection-persistence.js';
import { logger } from '../utils/logger/logger.service.js';
import { PrismaClient } from '@prisma/client';

export interface ConnectionManager {
  getConnectionState(): ConnectionState;
  attemptReconnection(): Promise<boolean>;
  resetConnection(): Promise<void>;
  isHealthy(): boolean;
  getLastError(): TelegramError | null;
  recordSuccess(): void;
  recordFailure(error: TelegramError): void;
}

/**
 * Manages Telegram API connection state and health monitoring
 */
export class TelegramConnectionManager implements ConnectionManager {
  private state: ConnectionState;
  private lastError: TelegramError | null = null;
  private downtimeStarted: Date | null = null;
  private persistence: ConnectionPersistence;
  private serviceName: string = 'telegram';

  constructor(prisma?: PrismaClient) {
    this.state = {
      status: 'connected',
      lastSuccessfulCall: new Date(),
      consecutiveFailures: 0,
      currentRetryDelay: 0,
      nextRetryAt: new Date(),
      totalDowntime: 0
    };

    // Initialize persistence if Prisma client is provided
    if (prisma) {
      this.persistence = new ConnectionStatePersistence(prisma);
    } else {
      // Create a no-op persistence for testing or when database is not available
      this.persistence = {
        saveConnectionState: async () => {},
        loadConnectionState: async () => null,
        deleteConnectionState: async () => {},
        recordHealthMetric: async () => {},
        getHealthMetrics: async () => [],
        cleanupOldMetrics: async () => 0,
        getConnectionStats: async () => null
      };
    }
  }

  /**
   * Gets the current connection state
   */
  getConnectionState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Attempts to reconnect to Telegram API
   */
  async attemptReconnection(): Promise<boolean> {
    const now = new Date();
    
    // Check if we should attempt reconnection yet
    if (now < this.state.nextRetryAt) {
      logger.debug('Reconnection attempt too early', {
        nextRetryAt: this.state.nextRetryAt.toISOString(),
        currentTime: now.toISOString(),
        waitTime: this.state.nextRetryAt.getTime() - now.getTime()
      });
      return false;
    }

    logger.info('Attempting Telegram API reconnection', {
      consecutiveFailures: this.state.consecutiveFailures,
      currentStatus: this.state.status,
      lastError: this.lastError ? {
        code: this.lastError.code,
        description: this.lastError.description,
        errorType: this.lastError.errorType
      } : null
    });

    try {
      // This will be implemented when integrating with BotService
      // For now, we'll simulate a connection test
      const connectionSuccessful = await this.testConnection();
      
      if (connectionSuccessful) {
        this.recordSuccess();
        logger.info('Telegram API reconnection successful', {
          previousFailures: this.state.consecutiveFailures,
          downtimeDuration: this.downtimeStarted ? now.getTime() - this.downtimeStarted.getTime() : 0
        });
        return true;
      } else {
        logger.warn('Telegram API reconnection failed - connection test unsuccessful');
        return false;
      }
    } catch (error) {
      logger.error('Telegram API reconnection attempt failed', {
        error: error instanceof Error ? error.message : String(error),
        consecutiveFailures: this.state.consecutiveFailures
      });
      return false;
    }
  }

  /**
   * Resets the connection to a healthy state
   */
  async resetConnection(): Promise<void> {
    const previousState = { ...this.state };
    
    this.state = {
      status: 'connected',
      lastSuccessfulCall: new Date(),
      consecutiveFailures: 0,
      currentRetryDelay: 0,
      nextRetryAt: new Date(),
      totalDowntime: 0
    };
    
    this.lastError = null;
    this.downtimeStarted = null;

    logger.info('Connection state reset to healthy', {
      previousStatus: previousState.status,
      previousFailures: previousState.consecutiveFailures,
      previousDowntime: previousState.totalDowntime
    });
  }

  /**
   * Checks if the connection is currently healthy
   */
  isHealthy(): boolean {
    const now = new Date();
    const timeSinceLastSuccess = now.getTime() - this.state.lastSuccessfulCall.getTime();
    
    // Consider healthy if:
    // 1. Status is connected, OR
    // 2. Last successful call was within 5 minutes and we're not in circuit_open state
    return this.state.status === 'connected' || 
           (timeSinceLastSuccess < 5 * 60 * 1000 && this.state.status !== 'circuit_open');
  }

  /**
   * Gets the last recorded error
   */
  getLastError(): TelegramError | null {
    return this.lastError;
  }

  /**
   * Records a successful API call
   */
  recordSuccess(): void {
    const now = new Date();
    const wasUnhealthy = !this.isHealthy();
    
    // Calculate downtime if we were in a failure state
    if (this.downtimeStarted && wasUnhealthy) {
      const downtimeDuration = now.getTime() - this.downtimeStarted.getTime();
      this.state.totalDowntime += downtimeDuration;
      
      logger.info('Connection recovered from downtime', {
        downtimeDuration,
        totalDowntime: this.state.totalDowntime,
        previousFailures: this.state.consecutiveFailures
      });
    }

    this.state.status = 'connected';
    this.state.lastSuccessfulCall = now;
    this.state.consecutiveFailures = 0;
    this.state.currentRetryDelay = 0;
    this.state.nextRetryAt = now;
    this.lastError = null;
    this.downtimeStarted = null;

    logger.debug('Recorded successful API call', {
      timestamp: now.toISOString(),
      totalDowntime: this.state.totalDowntime
    });

    // Persist state and record health metric
    this.saveStateAsync();
    this.recordHealthMetricAsync('connection_attempt', true);
  }

  /**
   * Records a failed API call and updates connection state
   */
  recordFailure(error: TelegramError): void {
    const now = new Date();
    
    // Start downtime tracking if this is the first failure
    if (this.state.consecutiveFailures === 0) {
      this.downtimeStarted = now;
    }

    this.state.consecutiveFailures++;
    this.lastError = error;

    // Update status based on error type and failure count
    if (error.errorType === 'network_error' && this.state.consecutiveFailures >= 3) {
      this.state.status = 'disconnected';
    } else if (this.state.consecutiveFailures >= 5) {
      this.state.status = 'circuit_open';
    } else {
      this.state.status = 'recovering';
    }

    logger.warn('Recorded API call failure', {
      consecutiveFailures: this.state.consecutiveFailures,
      newStatus: this.state.status,
      errorType: error.errorType,
      errorCode: error.code,
      errorDescription: error.description,
      timestamp: now.toISOString()
    });

    // Persist state and record health metric
    this.saveStateAsync();
    this.recordHealthMetricAsync('connection_attempt', false, undefined, error.code.toString());
  }

  /**
   * Updates the next retry time based on backoff strategy
   */
  setNextRetryTime(delay: number): void {
    const now = new Date();
    this.state.currentRetryDelay = delay;
    this.state.nextRetryAt = new Date(now.getTime() + delay);

    logger.debug('Updated next retry time', {
      delay,
      nextRetryAt: this.state.nextRetryAt.toISOString(),
      consecutiveFailures: this.state.consecutiveFailures
    });
  }

  /**
   * Gets connection health metrics
   */
  getHealthMetrics(): Record<string, any> {
    const now = new Date();
    const timeSinceLastSuccess = now.getTime() - this.state.lastSuccessfulCall.getTime();
    
    return {
      isHealthy: this.isHealthy(),
      status: this.state.status,
      consecutiveFailures: this.state.consecutiveFailures,
      timeSinceLastSuccess,
      totalDowntime: this.state.totalDowntime,
      currentRetryDelay: this.state.currentRetryDelay,
      nextRetryAt: this.state.nextRetryAt.toISOString(),
      lastError: this.lastError ? {
        code: this.lastError.code,
        description: this.lastError.description,
        errorType: this.lastError.errorType,
        timestamp: this.lastError.timestamp.toISOString()
      } : null
    };
  }

  /**
   * Initializes connection manager by loading persisted state
   */
  async initialize(): Promise<void> {
    try {
      const persistedState = await this.persistence.loadConnectionState(this.serviceName);
      
      if (persistedState) {
        this.state = persistedState;
        logger.info('Loaded persisted connection state', {
          status: this.state.status,
          consecutiveFailures: this.state.consecutiveFailures,
          totalDowntime: this.state.totalDowntime
        });
      } else {
        logger.info('No persisted connection state found, using default state');
        // Save initial state
        await this.saveStateAsync();
      }
    } catch (error) {
      logger.error('Failed to initialize connection manager from persisted state', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue with default state
    }
  }

  /**
   * Saves current state to persistence (async, non-blocking)
   */
  private saveStateAsync(): void {
    this.persistence.saveConnectionState(this.serviceName, this.state, this.lastError)
      .catch(error => {
        logger.error('Failed to persist connection state', {
          error: error instanceof Error ? error.message : String(error)
        });
      });
  }

  /**
   * Records health metric (async, non-blocking)
   */
  private recordHealthMetricAsync(
    metricType: string, 
    success: boolean, 
    responseTime?: number, 
    errorCode?: string
  ): void {
    this.persistence.recordHealthMetric(this.serviceName, metricType, success, responseTime, errorCode)
      .catch(error => {
        logger.debug('Failed to record health metric', {
          metricType,
          success,
          error: error instanceof Error ? error.message : String(error)
        });
      });
  }

  /**
   * Gets connection statistics from persistence
   */
  async getConnectionStats(): Promise<any> {
    try {
      return await this.persistence.getConnectionStats(this.serviceName);
    } catch (error) {
      logger.error('Failed to get connection stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Cleans up old health metrics
   */
  async cleanupOldMetrics(retentionDays: number = 7): Promise<number> {
    try {
      return await this.persistence.cleanupOldMetrics(retentionDays);
    } catch (error) {
      logger.error('Failed to cleanup old metrics', {
        retentionDays,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Test connection to Telegram API (placeholder for actual implementation)
   */
  private async testConnection(): Promise<boolean> {
    // This will be implemented when integrating with BotService
    // For now, return true to simulate successful connection
    return true;
  }
}

// Singleton instance (will be initialized with Prisma client when available)
let _telegramConnectionManager: TelegramConnectionManager | null = null;

export function getTelegramConnectionManager(prisma?: PrismaClient): TelegramConnectionManager {
  if (!_telegramConnectionManager) {
    _telegramConnectionManager = new TelegramConnectionManager(prisma);
  }
  return _telegramConnectionManager;
}

// For backward compatibility
export const telegramConnectionManager = getTelegramConnectionManager();