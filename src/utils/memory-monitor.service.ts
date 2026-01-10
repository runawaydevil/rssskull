import { logger } from './logger/logger.service.js';

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  usagePercent: number;
  timestamp: Date;
}

export class MemoryMonitorService {
  private monitoringInterval?: NodeJS.Timeout;
  private readonly memoryLimitMB: number;
  private readonly warningThreshold: number = 0.8; // 80%
  private readonly criticalThreshold: number = 0.9; // 90%
  private lastGCTime: number = 0;
  private readonly gcCooldownMs: number = 30000; // 30 seconds

  constructor(memoryLimitMB: number = 4096) {
    this.memoryLimitMB = memoryLimitMB;
  }

  start(): void {
    if (this.monitoringInterval) {
      return;
    }

    logger.info('Starting memory monitor', { 
      memoryLimitMB: this.memoryLimitMB,
      warningThreshold: this.warningThreshold,
      criticalThreshold: this.criticalThreshold
    });

    // Monitor every 60 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 60000);

    // Initial check
    this.checkMemoryUsage();
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('Memory monitor stopped');
    }
  }

  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const limitBytes = this.memoryLimitMB * 1024 * 1024;
    const usagePercent = memUsage.rss / limitBytes;

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      usagePercent,
      timestamp: new Date()
    };
  }

  private checkMemoryUsage(): void {
    const stats = this.getMemoryStats();
    const usageMB = Math.round(stats.rss / 1024 / 1024);
    const usagePercent = Math.round(stats.usagePercent * 100);

    // Log memory usage
    logger.info('Memory usage check', {
      usageMB,
      limitMB: this.memoryLimitMB,
      usagePercent,
      heapUsedMB: Math.round(stats.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(stats.heapTotal / 1024 / 1024)
    });

    // Warning threshold (80%)
    if (stats.usagePercent >= this.warningThreshold && stats.usagePercent < this.criticalThreshold) {
      logger.warn('Memory usage warning', {
        usageMB,
        usagePercent,
        threshold: Math.round(this.warningThreshold * 100)
      });

      // Trigger garbage collection if not done recently
      this.triggerGarbageCollection();
    }

    // Critical threshold (90%)
    if (stats.usagePercent >= this.criticalThreshold) {
      logger.error('Critical memory usage detected', {
        usageMB,
        usagePercent,
        threshold: Math.round(this.criticalThreshold * 100)
      });

      // Force garbage collection
      this.forceGarbageCollection();

      // If still high after GC, prepare for graceful restart
      setTimeout(() => {
        const newStats = this.getMemoryStats();
        if (newStats.usagePercent >= this.criticalThreshold) {
          logger.error('Memory usage still critical after GC, triggering graceful restart');
          this.triggerGracefulRestart();
        }
      }, 5000);
    }
  }

  private triggerGarbageCollection(): void {
    const now = Date.now();
    if (now - this.lastGCTime < this.gcCooldownMs) {
      return; // Too soon since last GC
    }

    try {
      if (global.gc) {
        const beforeStats = this.getMemoryStats();
        global.gc();
        this.lastGCTime = now;
        
        const afterStats = this.getMemoryStats();
        const freedMB = Math.round((beforeStats.rss - afterStats.rss) / 1024 / 1024);
        
        logger.info('Garbage collection triggered', {
          freedMB,
          beforeUsageMB: Math.round(beforeStats.rss / 1024 / 1024),
          afterUsageMB: Math.round(afterStats.rss / 1024 / 1024)
        });
      } else {
        logger.warn('Garbage collection not available (run with --expose-gc)');
      }
    } catch (error) {
      logger.error('Error during garbage collection', { error });
    }
  }

  private forceGarbageCollection(): void {
    // Reset cooldown for force GC
    this.lastGCTime = 0;
    this.triggerGarbageCollection();
  }

  private triggerGracefulRestart(): void {
    logger.error('CRITICAL: Memory usage still high after GC - but NOT killing process');
    logger.error('CRITICAL: Application will continue running. Monitor memory usage manually.');
    
    // NÃO EMITIR SIGTERM - isso mata o container!
    // Em vez disso, apenas logamos o problema crítico
    // O sistema de monitoramento externo (Docker, etc.) deve lidar com isso
    logger.error('CRITICAL: Consider restarting the container manually if memory usage persists');
  }
}

// Singleton instance
export const memoryMonitorService = new MemoryMonitorService();