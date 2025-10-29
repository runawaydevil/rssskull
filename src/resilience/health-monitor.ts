import { ConnectionPersistence } from './connection-persistence.js';
import { MessageQueue } from './message-queue.js';
import { QueueProcessor } from './queue-processor.js';
import { logger } from '../utils/logger/logger.service.js';

export enum AlertType {
  CONNECTION_DOWN = 'connection_down',
  HIGH_ERROR_RATE = 'high_error_rate',
  QUEUE_OVERFLOW = 'queue_overflow',
  CIRCUIT_BREAKER_OPEN = 'circuit_breaker_open',
  RECOVERY_FAILURE = 'recovery_failure'
}

export interface ConnectionHealth {
  isConnected: boolean;
  lastSuccessfulCall: Date | null;
  consecutiveFailures: number;
  uptime: number;
  downtime: number;
  errorRate: number;
}

export interface QueueHealth {
  size: number;
  isProcessing: boolean;
  averageWaitTime: number;
  processingRate: number;
  backlogSize: number;
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  telegram: ConnectionHealth;
  messageQueue: QueueHealth;
  uptime: number;
  lastIncident: Date | null;
}

export interface HealthMetrics {
  successRate: number;
  averageResponseTime: number;
  totalRequests: number;
  failedRequests: number;
  queuedMessages: number;
  processedMessages: number;
  downtimeMinutes: number;
}

export interface HealthMonitor {
  recordConnectionAttempt(success: boolean, responseTime?: number): void;
  recordMessageSent(success: boolean, queueTime?: number): void;
  getHealthStatus(): HealthStatus;
  getMetrics(): HealthMetrics;
  shouldTriggerAlert(alertType: AlertType): boolean;
}

export interface HealthMonitorConfig {
  alertThresholds: {
    errorRate: number;           // Error rate threshold (0.0 - 1.0)
    downtimeMinutes: number;     // Downtime threshold in minutes
    queueSize: number;           // Queue size threshold
    responseTime: number;        // Response time threshold in ms
  };
  metricsRetentionHours: number; // How long to keep metrics
  healthCheckInterval: number;   // Health check interval in ms
}

/**
 * Monitors system health and triggers alerts based on thresholds
 */
export class TelegramHealthMonitor implements HealthMonitor {
  private config: HealthMonitorConfig;
  private persistence: ConnectionPersistence;
  private messageQueue: MessageQueue;
  private queueProcessor: QueueProcessor;
  private startTime: Date;
  private lastIncident: Date | null = null;
  private connectionAttempts: { timestamp: Date; success: boolean; responseTime?: number }[] = [];
  private messageSentAttempts: { timestamp: Date; success: boolean; queueTime?: number }[] = [];
  private alertHistory: Map<AlertType, Date[]> = new Map();

  constructor(
    persistence: ConnectionPersistence,
    messageQueue: MessageQueue,
    queueProcessor: QueueProcessor,
    config?: Partial<HealthMonitorConfig>
  ) {
    this.persistence = persistence;
    this.messageQueue = messageQueue;
    this.queueProcessor = queueProcessor;
    this.startTime = new Date();

    this.config = {
      alertThresholds: {
        errorRate: 0.1,        // 10% error rate
        downtimeMinutes: 15,   // 15 minutes downtime
        queueSize: 500,        // 500 messages in queue
        responseTime: 10000    // 10 seconds response time
      },
      metricsRetentionHours: 24,
      healthCheckInterval: 30000, // 30 seconds
      ...config
    };

    // Initialize alert history
    for (const alertType of Object.values(AlertType)) {
      this.alertHistory.set(alertType, []);
    }

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Records a connection attempt
   */
  recordConnectionAttempt(success: boolean, responseTime?: number): void {
    const attempt = {
      timestamp: new Date(),
      success,
      responseTime
    };

    this.connectionAttempts.push(attempt);
    
    // Record in persistence layer
    this.persistence.recordHealthMetric(
      'telegram',
      'connection_attempt',
      success,
      responseTime,
      success ? undefined : 'connection_failed'
    ).catch(error => {
      logger.debug('Failed to record connection metric', { error });
    });

    // Update last incident if this is a failure
    if (!success) {
      this.lastIncident = attempt.timestamp;
    }

    // Check for alerts
    this.checkConnectionAlerts();

    logger.debug('Recorded connection attempt', {
      success,
      responseTime,
      totalAttempts: this.connectionAttempts.length
    });
  }

  /**
   * Records a message sent attempt
   */
  recordMessageSent(success: boolean, queueTime?: number): void {
    const attempt = {
      timestamp: new Date(),
      success,
      queueTime
    };

    this.messageSentAttempts.push(attempt);

    // Record in persistence layer
    this.persistence.recordHealthMetric(
      'telegram',
      'message_sent',
      success,
      queueTime,
      success ? undefined : 'send_failed'
    ).catch(error => {
      logger.debug('Failed to record message metric', { error });
    });

    logger.debug('Recorded message sent attempt', {
      success,
      queueTime,
      totalAttempts: this.messageSentAttempts.length
    });
  }

  /**
   * Gets current health status
   */
  getHealthStatus(): HealthStatus {
    const telegramHealth = this.getTelegramHealth();
    const queueHealth = this.getQueueHealth();
    const uptime = Date.now() - this.startTime.getTime();

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!telegramHealth.isConnected || telegramHealth.errorRate > this.config.alertThresholds.errorRate) {
      overall = 'unhealthy';
    } else if (queueHealth.backlogSize > this.config.alertThresholds.queueSize * 0.7 || 
               telegramHealth.errorRate > this.config.alertThresholds.errorRate * 0.5) {
      overall = 'degraded';
    }

    return {
      overall,
      telegram: telegramHealth,
      messageQueue: queueHealth,
      uptime,
      lastIncident: this.lastIncident
    };
  }

  /**
   * Gets health metrics
   */
  getMetrics(): HealthMetrics {
    const recentAttempts = this.getRecentConnectionAttempts(60 * 60 * 1000); // Last hour
    const recentMessages = this.getRecentMessageAttempts(60 * 60 * 1000);

    const totalRequests = recentAttempts.length;
    const failedRequests = recentAttempts.filter(a => !a.success).length;
    const successRate = totalRequests > 0 ? (totalRequests - failedRequests) / totalRequests : 0;

    const responseTimes = recentAttempts
      .filter(a => a.responseTime !== undefined)
      .map(a => a.responseTime!);
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;

    const processedMessages = recentMessages.filter(m => m.success).length;
    const queuedMessages = this.messageQueue.size();

    // Calculate downtime in last 24 hours
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failuresInDay = this.connectionAttempts.filter(a => 
      !a.success && a.timestamp > dayAgo
    );
    
    // Estimate downtime (simplified calculation)
    const downtimeMinutes = failuresInDay.length * 2; // Assume 2 minutes per failure

    return {
      successRate,
      averageResponseTime,
      totalRequests,
      failedRequests,
      queuedMessages,
      processedMessages,
      downtimeMinutes
    };
  }

  /**
   * Checks if an alert should be triggered
   */
  shouldTriggerAlert(alertType: AlertType): boolean {
    const now = new Date();
    const alertHistory = this.alertHistory.get(alertType) || [];
    
    // Don't trigger same alert too frequently (minimum 5 minutes between same alerts)
    const lastAlert = alertHistory[alertHistory.length - 1];
    if (lastAlert && now.getTime() - lastAlert.getTime() < 5 * 60 * 1000) {
      return false;
    }

    switch (alertType) {
      case AlertType.CONNECTION_DOWN:
        return this.checkConnectionDownAlert();
      
      case AlertType.HIGH_ERROR_RATE:
        return this.checkHighErrorRateAlert();
      
      case AlertType.QUEUE_OVERFLOW:
        return this.checkQueueOverflowAlert();
      
      case AlertType.CIRCUIT_BREAKER_OPEN:
        return this.checkCircuitBreakerAlert();
      
      case AlertType.RECOVERY_FAILURE:
        return this.checkRecoveryFailureAlert();
      
      default:
        return false;
    }
  }

  /**
   * Triggers an alert and records it
   */
  triggerAlert(alertType: AlertType, details: Record<string, any>): void {
    const now = new Date();
    const alertHistory = this.alertHistory.get(alertType) || [];
    alertHistory.push(now);
    this.alertHistory.set(alertType, alertHistory);

    logger.warn(`Health alert triggered: ${alertType}`, {
      alertType,
      details,
      timestamp: now.toISOString()
    });

    // Record alert in persistence
    this.persistence.recordHealthMetric(
      'telegram',
      'alert_triggered',
      false,
      undefined,
      alertType,
      details
    ).catch(error => {
      logger.debug('Failed to record alert metric', { error });
    });
  }

  /**
   * Gets Telegram connection health
   */
  private getTelegramHealth(): ConnectionHealth {
    const recentAttempts = this.getRecentConnectionAttempts(10 * 60 * 1000); // Last 10 minutes
    
    const totalAttempts = recentAttempts.length;
    const failedAttempts = recentAttempts.filter(a => !a.success).length;
    const errorRate = totalAttempts > 0 ? failedAttempts / totalAttempts : 0;

    const successfulAttempts = recentAttempts.filter(a => a.success);
    const lastSuccessful = successfulAttempts.length > 0 
      ? successfulAttempts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]
      : undefined;

    const consecutiveFailures = this.getConsecutiveFailures();
    const isConnected = consecutiveFailures < 3 && (lastSuccessful ? 
      Date.now() - lastSuccessful.timestamp.getTime() < 5 * 60 * 1000 : false);

    const uptime = Date.now() - this.startTime.getTime();
    const downtime = this.calculateDowntime();

    return {
      isConnected,
      lastSuccessfulCall: lastSuccessful?.timestamp || null,
      consecutiveFailures,
      uptime,
      downtime,
      errorRate
    };
  }

  /**
   * Gets message queue health
   */
  private getQueueHealth(): QueueHealth {
    const queueStats = this.messageQueue.getQueueStats();
    const processorStats = this.queueProcessor.getProcessingStats();

    return {
      size: queueStats.totalMessages,
      isProcessing: processorStats.isRunning,
      averageWaitTime: queueStats.averageWaitTime,
      processingRate: processorStats.messagesProcessed / Math.max(1, Date.now() - this.startTime.getTime()) * 60000, // per minute
      backlogSize: queueStats.totalMessages
    };
  }

  /**
   * Gets recent connection attempts within time window
   */
  private getRecentConnectionAttempts(timeWindowMs: number): typeof this.connectionAttempts {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.connectionAttempts.filter(a => a.timestamp > cutoff);
  }

  /**
   * Gets recent message attempts within time window
   */
  private getRecentMessageAttempts(timeWindowMs: number): typeof this.messageSentAttempts {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.messageSentAttempts.filter(a => a.timestamp > cutoff);
  }

  /**
   * Gets consecutive failures from most recent attempts
   */
  private getConsecutiveFailures(): number {
    let failures = 0;
    for (let i = this.connectionAttempts.length - 1; i >= 0; i--) {
      const attempt = this.connectionAttempts[i];
      if (!attempt) {
        break;
      }
      if (attempt.success) {
        break;
      }
      failures++;
    }
    return failures;
  }

  /**
   * Calculates total downtime
   */
  private calculateDowntime(): number {
    // Simplified calculation - sum of failure periods
    let totalDowntime = 0;
    let currentDowntimeStart: Date | null = null;

    for (const attempt of this.connectionAttempts) {
      if (!attempt.success && !currentDowntimeStart) {
        currentDowntimeStart = attempt.timestamp;
      } else if (attempt.success && currentDowntimeStart) {
        totalDowntime += attempt.timestamp.getTime() - currentDowntimeStart.getTime();
        currentDowntimeStart = null;
      }
    }

    // Add ongoing downtime if currently down
    if (currentDowntimeStart) {
      totalDowntime += Date.now() - currentDowntimeStart.getTime();
    }

    return totalDowntime;
  }

  /**
   * Checks for connection-related alerts
   */
  private checkConnectionAlerts(): void {
    if (this.shouldTriggerAlert(AlertType.CONNECTION_DOWN)) {
      this.triggerAlert(AlertType.CONNECTION_DOWN, {
        consecutiveFailures: this.getConsecutiveFailures(),
        lastSuccessful: this.getTelegramHealth().lastSuccessfulCall
      });
    }

    if (this.shouldTriggerAlert(AlertType.HIGH_ERROR_RATE)) {
      this.triggerAlert(AlertType.HIGH_ERROR_RATE, {
        errorRate: this.getTelegramHealth().errorRate,
        threshold: this.config.alertThresholds.errorRate
      });
    }
  }

  /**
   * Alert condition checkers
   */
  private checkConnectionDownAlert(): boolean {
    const health = this.getTelegramHealth();
    return !health.isConnected && health.consecutiveFailures >= 5;
  }

  private checkHighErrorRateAlert(): boolean {
    const health = this.getTelegramHealth();
    return health.errorRate > this.config.alertThresholds.errorRate;
  }

  private checkQueueOverflowAlert(): boolean {
    const queueSize = this.messageQueue.size();
    return queueSize > this.config.alertThresholds.queueSize;
  }

  private checkCircuitBreakerAlert(): boolean {
    // This would need integration with circuit breaker service
    return false;
  }

  private checkRecoveryFailureAlert(): boolean {
    const recentAttempts = this.getRecentConnectionAttempts(30 * 60 * 1000); // Last 30 minutes
    const failures = recentAttempts.filter(a => !a.success).length;
    return failures > 10; // More than 10 failures in 30 minutes
  }

  /**
   * Starts periodic cleanup of old metrics
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Cleans up old metrics to prevent memory leaks
   */
  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.config.metricsRetentionHours * 60 * 60 * 1000);
    
    this.connectionAttempts = this.connectionAttempts.filter(a => a.timestamp > cutoff);
    this.messageSentAttempts = this.messageSentAttempts.filter(a => a.timestamp > cutoff);
    
    // Clean up alert history
    for (const [alertType, alerts] of this.alertHistory.entries()) {
      this.alertHistory.set(alertType, alerts.filter(date => date > cutoff));
    }

    logger.debug('Cleaned up old health metrics', {
      connectionAttempts: this.connectionAttempts.length,
      messageAttempts: this.messageSentAttempts.length,
      cutoff: cutoff.toISOString()
    });
  }
}