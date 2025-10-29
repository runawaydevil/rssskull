import { HealthMonitor } from './health-monitor.js';
import { MessageQueue } from './message-queue.js';
import { QueueProcessor } from './queue-processor.js';
import { TelegramCircuitBreakerService } from './telegram-circuit-breaker.js';
import { TelegramConnectionManager } from './connection-manager.js';

export interface ResilienceEndpoints {
  getHealthStatus(): Promise<any>;
  getResilienceStats(): Promise<any>;
  getDetailedMetrics(): Promise<any>;
}

/**
 * Provides HTTP endpoints for resilience system monitoring
 */
export class TelegramResilienceEndpoints implements ResilienceEndpoints {
  private healthMonitor: HealthMonitor;
  private messageQueue: MessageQueue;
  private queueProcessor: QueueProcessor;
  private circuitBreaker: TelegramCircuitBreakerService;
  private connectionManager: TelegramConnectionManager;

  constructor(
    healthMonitor: HealthMonitor,
    messageQueue: MessageQueue,
    queueProcessor: QueueProcessor,
    circuitBreaker: TelegramCircuitBreakerService,
    connectionManager: TelegramConnectionManager
  ) {
    this.healthMonitor = healthMonitor;
    this.messageQueue = messageQueue;
    this.queueProcessor = queueProcessor;
    this.circuitBreaker = circuitBreaker;
    this.connectionManager = connectionManager;
  }

  /**
   * Gets overall health status for /health endpoint
   */
  async getHealthStatus(): Promise<any> {
    const healthStatus = this.healthMonitor.getHealthStatus();
    const connectionState = this.connectionManager.getConnectionState();
    const queueStats = this.messageQueue.getQueueStats();
    const processorStats = this.queueProcessor.getProcessingStats();

    return {
      status: healthStatus.overall === 'healthy' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: healthStatus.uptime,
      services: {
        telegram: {
          status: healthStatus.telegram.isConnected ? 'connected' : 'disconnected',
          errorRate: healthStatus.telegram.errorRate,
          consecutiveFailures: healthStatus.telegram.consecutiveFailures,
          lastSuccessfulCall: healthStatus.telegram.lastSuccessfulCall?.toISOString(),
          connectionState: connectionState.status
        },
        messageQueue: {
          status: processorStats.isRunning ? 'processing' : 'stopped',
          size: queueStats.totalMessages,
          backlog: healthStatus.messageQueue.backlogSize,
          processingRate: healthStatus.messageQueue.processingRate
        },
        circuitBreaker: {
          status: this.getCircuitBreakerStatus(),
          stats: this.circuitBreaker.getTelegramStats()
        }
      },
      lastIncident: healthStatus.lastIncident?.toISOString() || null
    };
  }

  /**
   * Gets detailed resilience statistics for /resilience-stats endpoint
   */
  async getResilienceStats(): Promise<any> {
    const metrics = this.healthMonitor.getMetrics();
    const connectionState = this.connectionManager.getConnectionState();
    const connectionStats = await this.connectionManager.getConnectionStats();
    const queueStats = this.messageQueue.getQueueStats();
    const processorStats = this.queueProcessor.getProcessingStats();
    const circuitBreakerStats = this.circuitBreaker.getTelegramStats();
    // Queue health is calculated from processor stats

    return {
      timestamp: new Date().toISOString(),
      overview: {
        successRate: metrics.successRate,
        averageResponseTime: metrics.averageResponseTime,
        totalRequests: metrics.totalRequests,
        failedRequests: metrics.failedRequests,
        downtimeMinutes: metrics.downtimeMinutes
      },
      connection: {
        state: connectionState,
        stats: connectionStats,
        health: {
          isHealthy: this.connectionManager.isHealthy(),
          metrics: this.connectionManager.getHealthMetrics()
        }
      },
      messageQueue: {
        current: queueStats,
        processing: processorStats,
        health: {
          isHealthy: processorStats.isRunning && queueStats.totalMessages < 500,
          backlogSize: queueStats.totalMessages
        }
      },
      circuitBreaker: circuitBreakerStats,
      performance: {
        queuedMessages: metrics.queuedMessages,
        processedMessages: metrics.processedMessages,
        averageWaitTime: queueStats.averageWaitTime,
        processingRate: processorStats.messagesProcessed > 0 ? 
          processorStats.messagesProcessed / (processorStats.averageProcessingTime / 1000) : 0
      }
    };
  }

  /**
   * Gets detailed metrics for monitoring systems
   */
  async getDetailedMetrics(): Promise<any> {
    const healthStatus = this.healthMonitor.getHealthStatus();
    const metrics = this.healthMonitor.getMetrics();
    const connectionMetrics = this.connectionManager.getHealthMetrics();
    const queueStats = this.messageQueue.getQueueStats();
    const processorStats = this.queueProcessor.getProcessingStats();

    return {
      timestamp: new Date().toISOString(),
      system: {
        uptime: healthStatus.uptime,
        status: healthStatus.overall,
        lastIncident: healthStatus.lastIncident?.toISOString()
      },
      telegram: {
        connection: {
          isConnected: healthStatus.telegram.isConnected,
          errorRate: healthStatus.telegram.errorRate,
          consecutiveFailures: healthStatus.telegram.consecutiveFailures,
          uptime: healthStatus.telegram.uptime,
          downtime: healthStatus.telegram.downtime,
          lastSuccessfulCall: healthStatus.telegram.lastSuccessfulCall?.toISOString()
        },
        performance: {
          successRate: metrics.successRate,
          averageResponseTime: metrics.averageResponseTime,
          totalRequests: metrics.totalRequests,
          failedRequests: metrics.failedRequests
        },
        detailed: connectionMetrics
      },
      messageQueue: {
        size: queueStats.totalMessages,
        messagesByPriority: queueStats.messagesByPriority,
        oldestMessageAge: queueStats.oldestMessageAge,
        averageWaitTime: queueStats.averageWaitTime,
        expiredMessages: queueStats.expiredMessages,
        processing: {
          isRunning: processorStats.isRunning,
          messagesProcessed: processorStats.messagesProcessed,
          messagesSuccessful: processorStats.messagesSuccessful,
          messagesFailed: processorStats.messagesFailed,
          averageProcessingTime: processorStats.averageProcessingTime,
          lastProcessedAt: processorStats.lastProcessedAt?.toISOString(),
          currentBatchSize: processorStats.currentBatchSize,
          rateLimitDelay: processorStats.rateLimitDelay
        }
      },
      circuitBreaker: this.circuitBreaker.getTelegramStats(),
      alerts: {
        connectionDown: this.healthMonitor.shouldTriggerAlert('connection_down' as any),
        highErrorRate: this.healthMonitor.shouldTriggerAlert('high_error_rate' as any),
        queueOverflow: this.healthMonitor.shouldTriggerAlert('queue_overflow' as any),
        circuitBreakerOpen: this.healthMonitor.shouldTriggerAlert('circuit_breaker_open' as any),
        recoveryFailure: this.healthMonitor.shouldTriggerAlert('recovery_failure' as any)
      }
    };
  }

  /**
   * Gets circuit breaker status summary
   */
  private getCircuitBreakerStatus(): string {
    const stats = this.circuitBreaker.getStats();
    const telegramStats = stats['telegram_api'];
    
    if (!telegramStats) {
      return 'closed';
    }

    return telegramStats.state || 'closed';
  }

  /**
   * Creates endpoint handlers for Fastify integration
   */
  static createEndpointHandlers(endpoints: TelegramResilienceEndpoints) {
    return {
      // Enhanced /health endpoint
      health: async (_request: any, reply: any) => {
        try {
          const health = await endpoints.getHealthStatus();
          
          if (health.status === 'ok') {
            return health;
          } else {
            reply.code(503);
            return health;
          }
        } catch (error) {
          reply.code(500);
          return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          };
        }
      },

      // New /resilience-stats endpoint
      resilienceStats: async (_request: any, reply: any) => {
        try {
          return await endpoints.getResilienceStats();
        } catch (error) {
          reply.code(500);
          return {
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          };
        }
      },

      // New /metrics endpoint for detailed monitoring
      detailedMetrics: async (_request: any, reply: any) => {
        try {
          return await endpoints.getDetailedMetrics();
        } catch (error) {
          reply.code(500);
          return {
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          };
        }
      }
    };
  }
}