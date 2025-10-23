import type { Queue, Worker } from 'bullmq';
import { logger } from '../utils/logger/logger.service.js';
import { jobService } from './job.service.js';
import {
  FEED_JOB_NAMES,
  FEED_QUEUE_NAMES,
  type FeedCheckJobData,
  type FeedCheckJobResult,
  processFeedCheck,
} from './processors/feed-checker.processor.js';
import {
  type MessageSendJobData,
  type MessageSendJobResult,
  processMessageSend,
} from './processors/message-sender.processor.js';

export class FeedQueueService {
  private feedCheckQueue: Queue;
  private messageSendQueue: Queue;
  private feedCheckWorkers: Worker<FeedCheckJobData, FeedCheckJobResult>[] = [];
  private messageSendWorkers: Worker<MessageSendJobData, MessageSendJobResult>[] = [];
  private scheduledFeeds: Set<string> = new Set();
  private readonly maxConcurrentWorkers = 5; // Processamento paralelo

  constructor() {
    // Create the feed check queue
    this.feedCheckQueue = jobService.createQueue(FEED_QUEUE_NAMES.FEED_CHECK);

    // Create the message send queue
    this.messageSendQueue = jobService.createQueue(FEED_QUEUE_NAMES.MESSAGE_SEND);

    // Create multiple workers for parallel processing
    this.createParallelWorkers();

    logger.info('Feed queue service initialized with parallel processing');
    logger.info(`Created ${this.maxConcurrentWorkers} feed check workers for queue: ${FEED_QUEUE_NAMES.FEED_CHECK}`);
    logger.info(`Created ${this.maxConcurrentWorkers} message send workers for queue: ${FEED_QUEUE_NAMES.MESSAGE_SEND}`);

    // Clean up orphaned jobs and auto-reset problematic feeds on startup
    this.cleanupOrphanedJobs();
    this.autoResetProblematicFeeds();
    
    // Schedule automatic maintenance tasks
    this.scheduleMaintenanceTasks();
  }

  /**
   * Create multiple workers for parallel processing with sharding
   */
  private createParallelWorkers(): void {
    // Create multiple feed check workers with sharding
    for (let i = 0; i < this.maxConcurrentWorkers; i++) {
      const worker = jobService.createWorker(FEED_QUEUE_NAMES.FEED_CHECK, processFeedCheck);
      this.feedCheckWorkers.push(worker);
    }

    // Create multiple message send workers with sharding
    for (let i = 0; i < this.maxConcurrentWorkers; i++) {
      const worker = jobService.createWorker(FEED_QUEUE_NAMES.MESSAGE_SEND, processMessageSend);
      this.messageSendWorkers.push(worker);
    }
  }

  /**
   * Get worker index for sharding based on feed ID
   */
  private getWorkerIndex(feedId: string): number {
    // Simple hash-based sharding
    let hash = 0;
    for (let i = 0; i < feedId.length; i++) {
      const char = feedId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % this.maxConcurrentWorkers;
  }

  /**
   * Schedule a feed check job with sharding
   */
  async scheduleFeedCheck(data: FeedCheckJobData, delayMs?: number): Promise<void> {
    const workerIndex = this.getWorkerIndex(data.feedId);
    const options = delayMs ? { delay: delayMs } : {};

    // Add sharding information to job data
    const shardedData = {
      ...data,
      shardIndex: workerIndex,
      workerId: `worker-${workerIndex}`,
    };

    await jobService.addJob(FEED_QUEUE_NAMES.FEED_CHECK, FEED_JOB_NAMES.CHECK_FEED, shardedData, options);

    logger.debug(`Scheduled feed check for feed ${data.feedId} in chat ${data.chatId} (shard: ${workerIndex})`);
  }

  /**
   * Schedule recurring feed checks for a feed
   */
  async scheduleRecurringFeedCheck(data: FeedCheckJobData, intervalMinutes = 5, force = false): Promise<void> {
    const jobId = `recurring-feed-${data.feedId}`;
    
    // Only check in-memory set if not forcing (prevents duplicates during same session for new adds)
    if (!force && this.scheduledFeeds.has(data.feedId)) {
      logger.warn(`Feed ${data.feedId} already scheduled in this session, skipping duplicate creation`);
      return;
    }
    
    // Check if job already exists in Redis to prevent duplicates (unless forcing)
    if (!force) {
      try {
        const existingJob = await this.feedCheckQueue.getJob(jobId);
        if (existingJob) {
          logger.warn(`Recurring job for feed ${data.feedId} already exists in Redis, skipping duplicate creation`);
          this.scheduledFeeds.add(data.feedId); // Mark as scheduled to prevent future attempts
          return;
        }
      } catch (error) {
        // Job doesn't exist, continue with creation
      }
    }

    // Convert minutes to cron pattern (every X minutes)
    const cronPattern = `*/${intervalMinutes} * * * *`;

    await jobService.addRecurringJob(
      FEED_QUEUE_NAMES.FEED_CHECK,
      FEED_JOB_NAMES.CHECK_FEED,
      data,
      cronPattern,
      {
        jobId, // Unique ID to prevent duplicates
      }
    );

    // Mark as scheduled to prevent future duplicates
    this.scheduledFeeds.add(data.feedId);

    logger.info(
      `Scheduled recurring feed check for feed ${data.feedId} every ${intervalMinutes} minutes`
    );
  }

  /**
   * Remove recurring feed check for a feed
   */
  async removeRecurringFeedCheck(feedId: string): Promise<void> {
    const jobId = `recurring-feed-${feedId}`;
    
    // Remove from scheduled feeds set
    this.scheduledFeeds.delete(feedId);

    try {
      const job = await this.feedCheckQueue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info(`Removed recurring feed check for feed ${feedId}`);
      }
    } catch (error) {
      logger.error(`Failed to remove recurring feed check for feed ${feedId}:`, error);
    }
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    return await jobService.getQueueStats(FEED_QUEUE_NAMES.FEED_CHECK);
  }

  /**
   * Pause feed processing
   */
  async pause(): Promise<void> {
    await jobService.pauseQueue(FEED_QUEUE_NAMES.FEED_CHECK);
  }

  /**
   * Resume feed processing
   */
  async resume(): Promise<void> {
    await jobService.resumeQueue(FEED_QUEUE_NAMES.FEED_CHECK);
  }

  /**
   * Get the feed check queue instance
   */
  getFeedCheckQueue(): Queue {
    return this.feedCheckQueue;
  }

  /**
   * Get the message send queue instance
   */
  getMessageSendQueue(): Queue {
    return this.messageSendQueue;
  }

  /**
   * Clear all jobs from both queues (for reset operations)
   */
  async clearAllQueues(): Promise<void> {
    try {
      // Clear the feed check queue
      await this.feedCheckQueue.obliterate({ force: true });
      logger.info('Cleared feed check queue');
      
      // Clear the message send queue  
      await this.messageSendQueue.obliterate({ force: true });
      logger.info('Cleared message send queue');
    } catch (error) {
      logger.error('Failed to clear queues:', error);
      throw error;
    }
  }

  /**
   * Auto-reset problematic feeds that haven't detected new items for a long time
   */
  private async autoResetProblematicFeeds(): Promise<void> {
    try {
      logger.info('🔄 Starting auto-reset of problematic feeds...');
      
      const { database } = await import('../database/database.service.js');
      
      // Find feeds that haven't been updated in the last 6 hours (more aggressive)
      const cutoffTime = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago
      
      const problematicFeeds = await database.client.feed.findMany({
        where: {
          enabled: true,
          lastCheck: {
            lt: cutoffTime,
          },
          lastItemId: {
            not: null, // Only reset feeds that have a lastItemId
          },
        },
        select: {
          id: true,
          name: true,
          rssUrl: true,
          lastItemId: true,
          lastCheck: true,
        },
      });

      logger.info(`Found ${problematicFeeds.length} potentially problematic feeds`);

      if (problematicFeeds.length === 0) {
        logger.info('✅ No problematic feeds to reset');
        return;
      }

      let resetCount = 0;
      let errorCount = 0;

      for (const feed of problematicFeeds) {
        try {
          // Reset lastItemId to null to force processing all items
          await database.client.feed.update({
            where: { id: feed.id },
            data: { lastItemId: null },
          });

          logger.info(`🔄 Reset lastItemId for feed: ${feed.name} (${feed.id}) - Last check: ${feed.lastCheck?.toISOString()}`);
          resetCount++;
        } catch (error) {
          errorCount++;
          logger.error(`❌ Failed to reset feed ${feed.name} (${feed.id}):`, error);
        }
      }

      logger.info(`🔄 Auto-reset completed: ${resetCount} feeds reset, ${errorCount} errors`);
      
      if (resetCount > 0) {
        logger.info('✅ Problematic feeds reset - they will process all items on next check');
      }
    } catch (error) {
      logger.error('❌ Failed to auto-reset problematic feeds:', error);
    }
  }

  /**
   * Schedule automatic cleanup and maintenance tasks
   */
  private scheduleMaintenanceTasks(): void {
    // Run cleanup every 30 minutes
    setInterval(async () => {
      try {
        logger.info('🧹 Running scheduled maintenance tasks...');
        await this.cleanupOrphanedJobs();
        await this.autoResetProblematicFeeds();
        logger.info('✅ Scheduled maintenance completed');
      } catch (error) {
        logger.error('❌ Scheduled maintenance failed:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes

    // Run cleanup every 2 hours for more thorough cleanup
    setInterval(async () => {
      try {
        logger.info('🧹 Running thorough maintenance tasks...');
        await this.thoroughCleanup();
        logger.info('✅ Thorough maintenance completed');
      } catch (error) {
        logger.error('❌ Thorough maintenance failed:', error);
      }
    }, 2 * 60 * 60 * 1000); // 2 hours
  }

  /**
   * Thorough cleanup that removes ALL orphaned jobs and resets problematic feeds
   */
  private async thoroughCleanup(): Promise<void> {
    try {
      logger.info('🧹 Starting thorough cleanup...');
      
      const { database } = await import('../database/database.service.js');
      
      // Get ALL recurring jobs from Redis
      const recurringJobs = await this.feedCheckQueue.getRepeatableJobs();
      logger.info(`Found ${recurringJobs.length} recurring jobs in Redis`);

      if (recurringJobs.length === 0) {
        logger.info('✅ No recurring jobs to clean up');
        return;
      }

      // Get ALL feeds from database
      const allFeeds = await database.client.feed.findMany({
        select: { id: true, name: true },
      });
      const existingFeedIds = new Set(allFeeds.map(feed => feed.id));

      let cleanedCount = 0;
      let errorCount = 0;

      // Remove jobs for non-existent feeds
      for (const job of recurringJobs) {
        try {
          const jobId = job.id;
          if (!jobId) {
            // Remove jobs with null/undefined IDs
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
            logger.info(`🗑️ Removed job with null/undefined ID (key: ${job.key})`);
            cleanedCount++;
            continue;
          }
          
          const feedIdMatch = jobId.match(/^recurring-feed-(.+)$/);
          if (!feedIdMatch) {
            // Remove jobs with unexpected ID format
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
            logger.info(`🗑️ Removed job with unexpected ID format: ${jobId}`);
            cleanedCount++;
            continue;
          }

          const feedId = feedIdMatch[1];
          
          if (feedId && !existingFeedIds.has(feedId)) {
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
            logger.info(`🗑️ Removed orphaned job for non-existent feed: ${feedId} (${jobId})`);
            cleanedCount++;
          }
        } catch (error) {
          errorCount++;
          logger.error(`❌ Error processing job ${job.id || 'unknown'}:`, error);
        }
      }

      // Reset feeds that haven't been updated in the last 2 hours
      const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      
      const staleFeeds = await database.client.feed.findMany({
        where: {
          enabled: true,
          lastCheck: {
            lt: cutoffTime,
          },
          lastItemId: {
            not: null,
          },
        },
        select: {
          id: true,
          name: true,
          lastCheck: true,
        },
      });

      let resetCount = 0;
      for (const feed of staleFeeds) {
        try {
          await database.client.feed.update({
            where: { id: feed.id },
            data: { lastItemId: null },
          });
          logger.info(`🔄 Reset stale feed: ${feed.name} (${feed.id}) - Last check: ${feed.lastCheck?.toISOString()}`);
          resetCount++;
        } catch (error) {
          logger.error(`❌ Failed to reset stale feed ${feed.name} (${feed.id}):`, error);
        }
      }

      logger.info(`🧹 Thorough cleanup completed: ${cleanedCount} orphaned jobs removed, ${resetCount} stale feeds reset, ${errorCount} errors`);
      
      if (cleanedCount > 0 || resetCount > 0) {
        logger.info('✅ Thorough cleanup successful - system is now clean');
      }
    } catch (error) {
      logger.error('❌ Failed to perform thorough cleanup:', error);
    }
  }

  /**
   * Clean up orphaned recurring jobs for feeds that no longer exist
   */
  private async cleanupOrphanedJobs(): Promise<void> {
    try {
      logger.info('🧹 Starting cleanup of orphaned recurring jobs...');

      // Get all recurring jobs from Redis
      const recurringJobs = await this.feedCheckQueue.getRepeatableJobs();
      logger.info(`Found ${recurringJobs.length} recurring jobs in Redis`);

      if (recurringJobs.length === 0) {
        logger.info('✅ No recurring jobs to clean up');
        return;
      }

      // Import database service to check if feeds exist
      const { database } = await import('../database/database.service.js');
      
      let cleanedCount = 0;
      let errorCount = 0;

      for (const job of recurringJobs) {
        try {
          // Extract feed ID from job ID (format: recurring-feed-{feedId})
          const jobId = job.id;
          
          if (!jobId) {
            // Remove jobs with null/undefined IDs
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
            logger.info(`🗑️ Removed job with null/undefined ID (key: ${job.key})`);
            cleanedCount++;
            continue;
          }
          
          const feedIdMatch = jobId.match(/^recurring-feed-(.+)$/);
          
          if (!feedIdMatch) {
            // Remove jobs with unexpected ID format
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
            logger.info(`🗑️ Removed job with unexpected ID format: ${jobId}`);
            cleanedCount++;
            continue;
          }

          const feedId = feedIdMatch[1];
          
          // Check if feed exists in database
          const feed = await database.client.feed.findUnique({
            where: { id: feedId },
            select: { id: true, name: true }
          });

          if (!feed) {
            // Feed doesn't exist, remove the orphaned job
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
            logger.info(`🗑️ Removed orphaned job for non-existent feed: ${feedId} (${jobId})`);
            cleanedCount++;
          } else {
            logger.debug(`✅ Feed exists: ${feed.name} (${feedId})`);
          }
        } catch (error) {
          errorCount++;
          logger.error(`❌ Error processing job ${job.id}:`, error);
        }
      }

      logger.info(`🧹 Cleanup completed: ${cleanedCount} orphaned jobs removed, ${errorCount} errors`);
      
      if (cleanedCount > 0) {
        logger.info('✅ Redis cleanup successful - orphaned jobs removed');
      }
    } catch (error) {
      logger.error('❌ Failed to cleanup orphaned jobs:', error);
      // Don't throw error - cleanup failure shouldn't prevent bot startup
    }
  }

  /**
   * Close the service
   */
  async close(): Promise<void> {
    // Close all feed check workers
    await Promise.all(this.feedCheckWorkers.map(worker => worker.close()));
    
    // Close all message send workers
    await Promise.all(this.messageSendWorkers.map(worker => worker.close()));
    
    logger.info(`Feed queue service closed (${this.maxConcurrentWorkers} workers each)`);
  }
}

// Singleton instance
export const feedQueueService = new FeedQueueService();
