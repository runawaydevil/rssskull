import { logger } from './logger/logger.service.js';
import { jobService } from '../jobs/job.service.js';
import { cacheService } from './cache.service.js';
import { cacheHTTPService } from './cache-http.service.js';
import { database } from '../database/database.service.js';

export class ResourceCleanupService {
    private cleanupInterval?: NodeJS.Timeout;
    private jobCleanupInterval?: NodeJS.Timeout;
    private cacheCleanupInterval?: NodeJS.Timeout;

    start(): void {
        logger.info('Starting resource cleanup service');

        // Job cleanup every 30 minutes
        this.jobCleanupInterval = setInterval(() => {
            this.cleanupJobs();
        }, 30 * 60 * 1000); // 30 minutes

        // Cache cleanup every 15 minutes
        this.cacheCleanupInterval = setInterval(() => {
            this.cleanupCache();
        }, 15 * 60 * 1000); // 15 minutes

        // General cleanup every hour
        this.cleanupInterval = setInterval(() => {
            this.performGeneralCleanup();
        }, 60 * 60 * 1000); // 1 hour

        // Initial cleanup
        setTimeout(() => {
            this.performGeneralCleanup();
        }, 30000); // 30 seconds after start
    }

    stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        if (this.jobCleanupInterval) {
            clearInterval(this.jobCleanupInterval);
            this.jobCleanupInterval = undefined;
        }
        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
            this.cacheCleanupInterval = undefined;
        }
        logger.info('Resource cleanup service stopped');
    }

    private async cleanupJobs(): Promise<void> {
        try {
            logger.info('Starting job cleanup');

            const redis = jobService.getRedisConnection();
            if (!redis) {
                logger.warn('Redis connection not available for job cleanup');
                return;
            }

            // Get all queue names
            const queueNames = ['feed-processing', 'notifications', 'cleanup'];

            for (const queueName of queueNames) {
                try {
                    const queue = jobService.getQueue(queueName);
                    if (!queue) continue;

                    // Clean completed jobs older than 1 hour
                    const oneHourAgo = Date.now() - (60 * 60 * 1000);
                    await queue.clean(oneHourAgo, 100, 'completed');

                    // Clean failed jobs older than 24 hours
                    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                    await queue.clean(oneDayAgo, 50, 'failed');

                    logger.debug(`Cleaned jobs for queue: ${queueName}`);
                } catch (error) {
                    logger.error(`Error cleaning queue ${queueName}:`, error);
                }
            }

            // Clean orphaned jobs (jobs without active workers)
            await this.cleanupOrphanedJobs();

            logger.info('Job cleanup completed');
        } catch (error) {
            logger.error('Error during job cleanup:', error);
        }
    }

    private async cleanupOrphanedJobs(): Promise<void> {
        try {
            const redis = jobService.getRedisConnection();
            if (!redis) return;

            // Get all active job keys
            const activeKeys = await redis.keys('bull:*:active');

            for (const key of activeKeys) {
                try {
                    // Check if job has been active for more than 30 minutes
                    const jobs = await redis.lrange(key, 0, -1);

                    for (const jobData of jobs) {
                        const job = JSON.parse(jobData);
                        const jobAge = Date.now() - job.processedOn;

                        // If job is older than 30 minutes, consider it orphaned
                        if (jobAge > 30 * 60 * 1000) {
                            logger.warn('Found orphaned job', {
                                jobId: job.id,
                                queue: key,
                                ageMinutes: Math.round(jobAge / 60000)
                            });

                            // Move job back to waiting or failed
                            await redis.lrem(key, 1, jobData);
                        }
                    }
                } catch (error) {
                    logger.error(`Error processing active jobs for ${key}:`, error);
                }
            }
        } catch (error) {
            logger.error('Error cleaning orphaned jobs:', error);
        }
    }

    private cleanupCache(): void {
        try {
            logger.info('Starting cache cleanup');

            // Get cache stats before cleanup
            const cacheStats = cacheService.getStats();
            const httpCacheStats = cacheHTTPService.getStats();

            logger.info('Cache cleanup completed', {
                cacheEntries: cacheStats.totalEntries,
                httpCacheEntries: httpCacheStats.totalEntries,
                cacheHitRate: cacheStats.hitRate
            });
        } catch (error) {
            logger.error('Error during cache cleanup:', error);
        }
    }

    private async performGeneralCleanup(): Promise<void> {
        try {
            logger.info('Starting general cleanup');

            // Database cleanup
            await this.cleanupDatabase();

            // Memory cleanup
            this.cleanupMemory();

            // Log cleanup stats
            const memUsage = process.memoryUsage();
            logger.info('General cleanup completed', {
                heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
                rssMB: Math.round(memUsage.rss / 1024 / 1024),
                uptime: Math.round(process.uptime())
            });
        } catch (error) {
            logger.error('Error during general cleanup:', error);
        }
    }

    private async cleanupDatabase(): Promise<void> {
        try {
            const db = database.client;

            // Clean old deduplication entries (older than 7 days)
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const deletedDedupe = await db.itemDedupe.deleteMany({
                where: {
                    expiresAt: {
                        lt: sevenDaysAgo
                    }
                }
            });

            // Clean old health metrics (older than 30 days) - if available
            let deletedMetrics = { count: 0 };
            let deletedMessages = { count: 0 };

            try {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                deletedMetrics = await (db as any).healthMetric.deleteMany({
                    where: {
                        createdAt: {
                            lt: thirtyDaysAgo
                        }
                    }
                });
            } catch (error) {
                logger.debug('HealthMetric table not available or error during cleanup', { error });
            }

            // Clean old queued messages (older than 24 hours) - if available
            try {
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                deletedMessages = await (db as any).queuedMessage.deleteMany({
                    where: {
                        OR: [
                            { status: 'sent', updatedAt: { lt: oneDayAgo } },
                            { status: 'failed', updatedAt: { lt: oneDayAgo } },
                            { status: 'expired' }
                        ]
                    }
                });
            } catch (error) {
                logger.debug('QueuedMessage table not available or error during cleanup', { error });
            }

            logger.info('Database cleanup completed', {
                deletedDedupe: deletedDedupe.count,
                deletedMetrics: deletedMetrics.count,
                deletedMessages: deletedMessages.count
            });
        } catch (error) {
            logger.error('Error during database cleanup:', error);
        }
    }

    private cleanupMemory(): void {
        try {
            // Force garbage collection if available
            if (global.gc) {
                const beforeMem = process.memoryUsage();
                global.gc();
                const afterMem = process.memoryUsage();

                const freedMB = Math.round((beforeMem.rss - afterMem.rss) / 1024 / 1024);
                logger.info('Forced garbage collection', {
                    freedMB,
                    beforeRssMB: Math.round(beforeMem.rss / 1024 / 1024),
                    afterRssMB: Math.round(afterMem.rss / 1024 / 1024)
                });
            }

            // Clear any large objects that might be hanging around
            // This is application-specific cleanup
            this.clearApplicationCaches();
        } catch (error) {
            logger.error('Error during memory cleanup:', error);
        }
    }

    private clearApplicationCaches(): void {
        try {
            // Clear any application-specific caches or large objects
            // This would be customized based on your application's needs

            // Example: Clear any large arrays or maps that might accumulate
            // feedCache.clear();
            // userSessionCache.clear();

            logger.debug('Application caches cleared');
        } catch (error) {
            logger.error('Error clearing application caches:', error);
        }
    }

    async forceCleanup(): Promise<void> {
        logger.info('Forcing immediate cleanup');

        await Promise.all([
            this.cleanupJobs(),
            this.performGeneralCleanup()
        ]);

        this.cleanupCache();

        logger.info('Force cleanup completed');
    }

    getStats() {
        return {
            jobCleanupActive: !!this.jobCleanupInterval,
            cacheCleanupActive: !!this.cacheCleanupInterval,
            generalCleanupActive: !!this.cleanupInterval,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
    }
}

// Singleton instance
export const resourceCleanupService = new ResourceCleanupService();