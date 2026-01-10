import { PrismaClient } from '@prisma/client';
import { ConnectionState, TelegramError } from './types.js';
import { logger } from '../utils/logger/logger.service.js';

export interface ConnectionPersistence {
  saveConnectionState(service: string, state: ConnectionState, lastError?: TelegramError | null): Promise<void>;
  loadConnectionState(service: string): Promise<ConnectionState | null>;
  deleteConnectionState(service: string): Promise<void>;
  recordHealthMetric(service: string, metricType: string, success: boolean, responseTime?: number, errorCode?: string, metadata?: any): Promise<void>;
  getHealthMetrics(service: string, since?: Date): Promise<any[]>;
  cleanupOldMetrics(retentionDays: number): Promise<number>;
  getConnectionStats(service: string): Promise<any>;
}

/**
 * Handles persistence of connection state and health metrics
 */
export class ConnectionStatePersistence implements ConnectionPersistence {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Saves connection state to database
   */
  async saveConnectionState(service: string, state: ConnectionState, lastError?: TelegramError | null): Promise<void> {
    try {
      await (this.prisma as any).connectionState.upsert({
        where: { service },
        update: {
          status: state.status,
          lastSuccessfulCall: state.lastSuccessfulCall,
          consecutiveFailures: state.consecutiveFailures,
          currentRetryDelay: state.currentRetryDelay,
          nextRetryAt: state.nextRetryAt,
          totalDowntime: state.totalDowntime,
          lastErrorCode: lastError?.code || null,
          lastErrorDescription: lastError?.description || null,
          lastErrorType: lastError?.errorType || null,
          updatedAt: new Date()
        },
        create: {
          service,
          status: state.status,
          lastSuccessfulCall: state.lastSuccessfulCall,
          consecutiveFailures: state.consecutiveFailures,
          currentRetryDelay: state.currentRetryDelay,
          nextRetryAt: state.nextRetryAt,
          totalDowntime: state.totalDowntime,
          lastErrorCode: lastError?.code || null,
          lastErrorDescription: lastError?.description || null,
          lastErrorType: lastError?.errorType || null
        }
      });

      logger.debug('Connection state saved to database', {
        service,
        status: state.status,
        consecutiveFailures: state.consecutiveFailures,
        totalDowntime: state.totalDowntime
      });
    } catch (error) {
      logger.error('Failed to save connection state', {
        service,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Loads connection state from database
   */
  async loadConnectionState(service: string): Promise<ConnectionState | null> {
    try {
      const record = await (this.prisma as any).connectionState.findUnique({
        where: { service }
      });

      if (!record) {
        logger.debug('No connection state found in database', { service });
        return null;
      }

      const state: ConnectionState = {
        status: record.status as ConnectionState['status'],
        lastSuccessfulCall: record.lastSuccessfulCall,
        consecutiveFailures: record.consecutiveFailures,
        currentRetryDelay: record.currentRetryDelay,
        nextRetryAt: record.nextRetryAt,
        totalDowntime: record.totalDowntime
      };

      logger.debug('Connection state loaded from database', {
        service,
        status: state.status,
        consecutiveFailures: state.consecutiveFailures,
        totalDowntime: state.totalDowntime
      });

      return state;
    } catch (error) {
      logger.error('Failed to load connection state', {
        service,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Deletes connection state from database
   */
  async deleteConnectionState(service: string): Promise<void> {
    try {
      await (this.prisma as any).connectionState.delete({
        where: { service }
      });

      logger.debug('Connection state deleted from database', { service });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
        logger.debug('Connection state not found for deletion', { service });
        return;
      }

      logger.error('Failed to delete connection state', {
        service,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Records a health metric in the database
   */
  async recordHealthMetric(
    service: string, 
    metricType: string, 
    success: boolean, 
    responseTime?: number, 
    errorCode?: string, 
    metadata?: any
  ): Promise<void> {
    try {
      await (this.prisma as any).healthMetric.create({
        data: {
          service,
          metricType,
          success,
          responseTime,
          errorCode,
          metadata: metadata ? JSON.stringify(metadata) : null
        }
      });

      logger.debug('Health metric recorded', {
        service,
        metricType,
        success,
        responseTime,
        errorCode
      });
    } catch (error) {
      logger.error('Failed to record health metric', {
        service,
        metricType,
        success,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw here to avoid disrupting the main flow
    }
  }

  /**
   * Gets health metrics for a service since a specific date
   */
  async getHealthMetrics(service: string, since?: Date): Promise<any[]> {
    try {
      const whereClause: any = { service };
      
      if (since) {
        whereClause.timestamp = {
          gte: since
        };
      }

      const metrics = await (this.prisma as any).healthMetric.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        take: 1000 // Limit to prevent memory issues
      });

      return metrics.map((metric: any) => ({
        id: metric.id,
        timestamp: metric.timestamp,
        service: metric.service,
        metricType: metric.metricType,
        success: metric.success,
        responseTime: metric.responseTime,
        errorCode: metric.errorCode,
        metadata: metric.metadata ? JSON.parse(metric.metadata) : null
      }));
    } catch (error) {
      logger.error('Failed to get health metrics', {
        service,
        since: since?.toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Cleans up old health metrics beyond retention period
   */
  async cleanupOldMetrics(retentionDays: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await (this.prisma as any).healthMetric.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate
          }
        }
      });

      logger.info('Cleaned up old health metrics', {
        deletedCount: result.count,
        cutoffDate: cutoffDate.toISOString(),
        retentionDays
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup old health metrics', {
        retentionDays,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Gets connection state statistics
   */
  async getConnectionStats(service: string): Promise<any> {
    try {
      const [connectionState, recentMetrics] = await Promise.all([
        this.loadConnectionState(service),
        this.getHealthMetrics(service, new Date(Date.now() - 24 * 60 * 60 * 1000)) // Last 24 hours
      ]);

      const successfulCalls = recentMetrics.filter(m => m.success).length;
      const failedCalls = recentMetrics.filter(m => !m.success).length;
      const totalCalls = successfulCalls + failedCalls;
      const successRate = totalCalls > 0 ? successfulCalls / totalCalls : 0;

      const responseTimes = recentMetrics
        .filter(m => m.responseTime !== null)
        .map(m => m.responseTime);
      
      const averageResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
        : 0;

      return {
        connectionState,
        stats: {
          successfulCalls,
          failedCalls,
          totalCalls,
          successRate,
          averageResponseTime,
          metricsTimeframe: '24h'
        }
      };
    } catch (error) {
      logger.error('Failed to get connection stats', {
        service,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
}