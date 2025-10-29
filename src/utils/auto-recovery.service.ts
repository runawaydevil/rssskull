import { logger } from './logger/logger.service.js';
import { jobService } from '../jobs/job.service.js';
import { database } from '../database/database.service.js';

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastCheck: Date;
  consecutiveFailures: number;
  lastError?: string;
}

export class AutoRecoveryService {
  private services: Map<string, ServiceStatus> = new Map();
  private recoveryInterval?: NodeJS.Timeout;
  private readonly maxConsecutiveFailures = 3;
  private readonly checkIntervalMs = 30000; // 30 seconds

  start(): void {
    logger.info('Starting auto-recovery service');

    // Initialize service statuses
    this.initializeServices();

    // Check services every 30 seconds
    this.recoveryInterval = setInterval(() => {
      this.checkAllServices();
    }, this.checkIntervalMs);

    // Initial check
    setTimeout(() => {
      this.checkAllServices();
    }, 5000);
  }

  stop(): void {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = undefined;
    }
    logger.info('Auto-recovery service stopped');
  }

  private initializeServices(): void {
    const serviceNames = ['redis', 'database', 'telegram'];
    
    for (const name of serviceNames) {
      this.services.set(name, {
        name,
        status: 'healthy',
        lastCheck: new Date(),
        consecutiveFailures: 0
      });
    }
  }

  private async checkAllServices(): Promise<void> {
    logger.debug('Checking all services health');

    await Promise.all([
      this.checkRedisHealth(),
      this.checkDatabaseHealth(),
      this.checkTelegramHealth()
    ]);

    // Log overall status
    const failedServices = Array.from(this.services.values())
      .filter(service => service.status === 'failed');

    if (failedServices.length > 0) {
      logger.warn('Services in failed state', {
        failedServices: failedServices.map(s => s.name),
        totalServices: this.services.size
      });
    }
  }

  private async checkRedisHealth(): Promise<void> {
    const serviceName = 'redis';
    const service = this.services.get(serviceName)!;

    try {
      const isHealthy = await jobService.healthCheck();
      
      if (isHealthy) {
        this.markServiceHealthy(service);
      } else {
        await this.markServiceFailed(service, 'Redis health check failed');
      }
    } catch (error) {
      await this.markServiceFailed(service, error instanceof Error ? error.message : String(error));
    }
  }

  private async checkDatabaseHealth(): Promise<void> {
    const serviceName = 'database';
    const service = this.services.get(serviceName)!;

    try {
      const isHealthy = await database.healthCheck();
      
      if (isHealthy) {
        this.markServiceHealthy(service);
      } else {
        await this.markServiceFailed(service, 'Database health check failed');
      }
    } catch (error) {
      await this.markServiceFailed(service, error instanceof Error ? error.message : String(error));
    }
  }

  private async checkTelegramHealth(): Promise<void> {
    const serviceName = 'telegram';
    const service = this.services.get(serviceName)!;

    try {
      // For Telegram, we'll check if we can make a simple API call
      // This is a simplified check - in practice you might want to use the bot's getMe() method
      service.lastCheck = new Date();
      this.markServiceHealthy(service);
    } catch (error) {
      await this.markServiceFailed(service, error instanceof Error ? error.message : String(error));
    }
  }

  private markServiceHealthy(service: ServiceStatus): void {
    const wasUnhealthy = service.status !== 'healthy';
    
    service.status = 'healthy';
    service.consecutiveFailures = 0;
    service.lastCheck = new Date();
    service.lastError = undefined;

    if (wasUnhealthy) {
      logger.info('Service recovered', {
        service: service.name,
        status: service.status
      });
    }
  }

  private async markServiceFailed(service: ServiceStatus, error: string): Promise<void> {
    service.consecutiveFailures++;
    service.lastCheck = new Date();
    service.lastError = error;

    if (service.consecutiveFailures >= this.maxConsecutiveFailures) {
      service.status = 'failed';
      logger.error('Service marked as failed', {
        service: service.name,
        consecutiveFailures: service.consecutiveFailures,
        error
      });

      // Attempt recovery
      await this.attemptServiceRecovery(service);
    } else {
      service.status = 'degraded';
      logger.warn('Service degraded', {
        service: service.name,
        consecutiveFailures: service.consecutiveFailures,
        maxFailures: this.maxConsecutiveFailures,
        error
      });
    }
  }

  private async attemptServiceRecovery(service: ServiceStatus): Promise<void> {
    logger.info('Attempting service recovery', { service: service.name });

    try {
      switch (service.name) {
        case 'redis':
          await this.recoverRedisService();
          break;
        case 'database':
          await this.recoverDatabaseService();
          break;
        case 'telegram':
          await this.recoverTelegramService();
          break;
        default:
          logger.warn('Unknown service for recovery', { service: service.name });
      }
    } catch (error) {
      logger.error('Service recovery failed', {
        service: service.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async recoverRedisService(): Promise<void> {
    try {
      // Attempt to reconnect Redis
      const redis = jobService.getRedisConnection();
      if (redis) {
        await redis.ping();
        logger.info('Redis service recovery successful');
      }
    } catch (error) {
      logger.error('Redis recovery failed', { error });
      throw error;
    }
  }

  private async recoverDatabaseService(): Promise<void> {
    try {
      // Attempt to reconnect database
      await database.connect();
      logger.info('Database service recovery successful');
    } catch (error) {
      logger.error('Database recovery failed', { error });
      throw error;
    }
  }

  private async recoverTelegramService(): Promise<void> {
    try {
      // For Telegram recovery, we might want to restart the bot polling
      // This is a placeholder - actual implementation would depend on your bot setup
      logger.info('Telegram service recovery attempted');
    } catch (error) {
      logger.error('Telegram recovery failed', { error });
      throw error;
    }
  }

  getServiceStatuses(): ServiceStatus[] {
    return Array.from(this.services.values());
  }

  getOverallHealth(): 'healthy' | 'degraded' | 'failed' {
    const statuses = Array.from(this.services.values());
    
    if (statuses.some(s => s.status === 'failed')) {
      return 'failed';
    }
    
    if (statuses.some(s => s.status === 'degraded')) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  async forceServiceCheck(serviceName?: string): Promise<void> {
    if (serviceName) {
      logger.info('Forcing service check', { service: serviceName });
      
      switch (serviceName) {
        case 'redis':
          await this.checkRedisHealth();
          break;
        case 'database':
          await this.checkDatabaseHealth();
          break;
        case 'telegram':
          await this.checkTelegramHealth();
          break;
        default:
          throw new Error(`Unknown service: ${serviceName}`);
      }
    } else {
      logger.info('Forcing check of all services');
      await this.checkAllServices();
    }
  }
}

// Singleton instance
export const autoRecoveryService = new AutoRecoveryService();