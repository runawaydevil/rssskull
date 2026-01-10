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
    this.scheduleMaintenanceTasks().catch(error => {
      logger.error('Failed to schedule maintenance tasks:', error);
    });
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
   * Get priority for a feed based on domain
   */
  private getFeedPriority(feedUrl: string): number {
    // High priority for fast-moving feeds
    if (feedUrl.includes('reddit.com') || feedUrl.includes('instagram.com')) {
      return 1; // Highest priority
    }
    
    // Medium priority for moderate feeds
    if (feedUrl.includes('hnrss.org') || feedUrl.includes('techcrunch.com')) {
      return 2;
    }
    
    // Low priority for slow feeds
    if (feedUrl.includes('github.com') || feedUrl.includes('blog')) {
      return 3;
    }
    
    // Default priority
    return 2;
  }

  /**
   * Schedule a feed check job with sharding and priority
   */
  async scheduleFeedCheck(data: FeedCheckJobData, delayMs?: number): Promise<void> {
    const workerIndex = this.getWorkerIndex(data.feedId);
    const priority = this.getFeedPriority(data.feedUrl);
    
    const options: any = {
      priority,
    };
    
    if (delayMs) {
      options.delay = delayMs;
    }

    // Add sharding information to job data
    const shardedData = {
      ...data,
      shardIndex: workerIndex,
      workerId: `worker-${workerIndex}`,
    };

    await jobService.addJob(FEED_QUEUE_NAMES.FEED_CHECK, FEED_JOB_NAMES.CHECK_FEED, shardedData, options);

    logger.debug(`Scheduled feed check for feed ${data.feedId} in chat ${data.chatId} (shard: ${workerIndex}, priority: ${priority})`);
  }

  /**
   * Schedule recurring feed checks for a feed with jitter
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

    // Add jitter to avoid thundering herd: ±30 seconds random (reduced from ±1 minute)
    const jitterMs = Math.floor(Math.random() * 60000) - 30000; // ±30 seconds in milliseconds
    const intervalMs = intervalMinutes * 60 * 1000;
    const jitteredIntervalMs = Math.max(60000, intervalMs + jitterMs); // Minimum 1 minute

    // Convert back to cron pattern for BullMQ compatibility
    const jitteredMinutes = Math.ceil(jitteredIntervalMs / 60000);
    const cronPattern = `*/${jitteredMinutes} * * * *`;

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
      `Scheduled recurring feed check for feed ${data.feedId} every ${intervalMinutes} minutes (with ±1 min jitter)`
    );
  }

  /**
   * Remove recurring feed check for a feed
   */
  async removeRecurringFeedCheck(feedId: string): Promise<boolean> {
    const jobId = `recurring-feed-${feedId}`;
    
    // Remove from scheduled feeds set
    this.scheduledFeeds.delete(feedId);

    try {
      // First try to get and remove the job by ID
      const job = await this.feedCheckQueue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info(`Removed recurring job by ID for feed ${feedId}`);
      }

      // Also check repeatable jobs and remove by key
      const repeatableJobs = await this.feedCheckQueue.getRepeatableJobs();
      
      for (const repeatableJob of repeatableJobs) {
        if (repeatableJob.id === jobId) {
          await this.feedCheckQueue.removeRepeatableByKey(repeatableJob.key);
          logger.info(`Removed repeatable job by key for feed ${feedId}`);
          break;
        }
      }

      // Verify removal was successful
      const verificationResult = await this.verifyJobRemoval(feedId);
      if (verificationResult) {
        logger.info(`✅ Successfully verified removal of job for feed ${feedId}`);
        return true;
      } else {
        logger.warn(`⚠️ Job removal verification failed for feed ${feedId}, attempting force removal`);
        return await this.forceRemoveOrphanedJob(feedId);
      }
    } catch (error) {
      logger.error(`Failed to remove recurring feed check for feed ${feedId}:`, error);
      return false;
    }
  }

  /**
   * Verify that a job was actually removed from Redis
   */
  async verifyJobRemoval(feedId: string): Promise<boolean> {
    const jobId = `recurring-feed-${feedId}`;
    
    try {
      // Check if job still exists by ID
      const job = await this.feedCheckQueue.getJob(jobId);
      if (job) {
        logger.debug(`Job ${jobId} still exists in queue`);
        return false;
      }

      // Check repeatable jobs
      const repeatableJobs = await this.feedCheckQueue.getRepeatableJobs();
      const stillExists = repeatableJobs.some(job => job.id === jobId);
      
      if (stillExists) {
        logger.debug(`Repeatable job ${jobId} still exists in queue`);
        return false;
      }

      logger.debug(`✅ Verified job ${jobId} was successfully removed`);
      return true;
    } catch (error) {
      logger.error(`Error verifying job removal for feed ${feedId}:`, error);
      return false;
    }
  }

  /**
   * Force remove an orphaned job using multiple methods
   */
  async forceRemoveOrphanedJob(feedId: string): Promise<boolean> {
    const jobId = `recurring-feed-${feedId}`;
    let removalAttempts = 0;
    let successful = false;

    try {
      logger.info(`🔧 Force removing orphaned job for feed ${feedId}`);

      // Method 1: Remove by job ID
      try {
        const job = await this.feedCheckQueue.getJob(jobId);
        if (job) {
          await job.remove();
          removalAttempts++;
          logger.debug(`Attempt ${removalAttempts}: Removed job by ID`);
        }
      } catch (error) {
        logger.debug(`Failed to remove job by ID: ${error}`);
      }

      // Method 2: Remove all repeatable jobs with matching ID
      try {
        const repeatableJobs = await this.feedCheckQueue.getRepeatableJobs();
        for (const repeatableJob of repeatableJobs) {
          if (repeatableJob.id === jobId) {
            await this.feedCheckQueue.removeRepeatableByKey(repeatableJob.key);
            removalAttempts++;
            logger.debug(`Attempt ${removalAttempts}: Removed repeatable job by key`);
          }
        }
      } catch (error) {
        logger.debug(`Failed to remove repeatable jobs: ${error}`);
      }

      // Method 3: Clean all jobs with feed ID in data
      try {
        const allJobs = await this.feedCheckQueue.getJobs(['waiting', 'active', 'delayed']);
        for (const job of allJobs) {
          if (job.data && job.data.feedId === feedId) {
            await job.remove();
            removalAttempts++;
            logger.debug(`Attempt ${removalAttempts}: Removed job with matching feedId in data`);
          }
        }
      } catch (error) {
        logger.debug(`Failed to clean jobs by data: ${error}`);
      }

      // Final verification
      successful = await this.verifyJobRemoval(feedId);
      
      if (successful) {
        logger.info(`✅ Successfully force-removed orphaned job for feed ${feedId} (${removalAttempts} attempts)`);
      } else {
        logger.error(`❌ Failed to force-remove orphaned job for feed ${feedId} after ${removalAttempts} attempts`);
      }

      return successful;
    } catch (error) {
      logger.error(`Error during force removal of job for feed ${feedId}:`, error);
      return false;
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

      if (problematicFeeds.length === 0) {
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
          resetCount++;
        } catch (error) {
          errorCount++;
          logger.error(`❌ Failed to reset feed ${feed.name} (${feed.id}):`, error);
        }
      }

      if (resetCount > 0) {
        logger.info(`🔄 Reset ${resetCount} problematic feeds${errorCount > 0 ? ` (${errorCount} errors)` : ''}`);
      }
    } catch (error) {
      logger.error('❌ Failed to auto-reset problematic feeds:', error);
    }
  }

  /**
   * Get monitoring metrics for orphaned job cleanup
   */
  async getCleanupMetrics(): Promise<{
    totalRecurringJobs: number;
    orphanedJobsDetected: number;
    lastCleanupTime: Date;
    cleanupErrors: number;
  }> {
    try {
      const recurringJobs = await this.feedCheckQueue.getRepeatableJobs();
      const { database } = await import('../database/database.service.js');
      
      const existingFeeds = await database.client.feed.findMany({
        select: { id: true }
      });
      const existingFeedIds = new Set(existingFeeds.map((feed: any) => feed.id));
      
      let orphanedCount = 0;
      for (const job of recurringJobs) {
        if (job.id) {
          const feedIdMatch = job.id.match(/^recurring-feed-(.+)$/);
          if (feedIdMatch && feedIdMatch[1] && !existingFeedIds.has(feedIdMatch[1])) {
            orphanedCount++;
          }
        }
      }

      return {
        totalRecurringJobs: recurringJobs.length,
        orphanedJobsDetected: orphanedCount,
        lastCleanupTime: new Date(),
        cleanupErrors: 0 // This would be tracked in a real monitoring system
      };
    } catch (error) {
      logger.error('Failed to get cleanup metrics:', error);
      return {
        totalRecurringJobs: 0,
        orphanedJobsDetected: 0,
        lastCleanupTime: new Date(),
        cleanupErrors: 1
      };
    }
  }

  /**
   * Schedule automatic cleanup and maintenance tasks with enhanced monitoring
   */
  private async scheduleMaintenanceTasks(): Promise<void> {
    let isMaintenanceRunning = false;
    let maintenanceStats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRunTime: new Date(),
      orphanedJobsCleanedTotal: 0
    };
    
    // Get cleanup configuration
    const { config } = await import('../config/config.service.js');
    const cleanupIntervalMs = config.jobCleanup.intervalMinutes * 60 * 1000;
    const thoroughIntervalMs = config.jobCleanup.thoroughIntervalHours * 60 * 60 * 1000;
    
    if (!config.jobCleanup.enabled) {
      logger.info('🚫 Job cleanup is disabled via configuration');
      return;
    }
    
    // Run cleanup every configured interval (default: 30 minutes)
    setInterval(async () => {
      if (isMaintenanceRunning) {
        logger.debug('⏭️ Maintenance already running, skipping...');
        return;
      }
      
      try {
        isMaintenanceRunning = true;
        maintenanceStats.totalRuns++;
        maintenanceStats.lastRunTime = new Date();
        
        logger.info('🧹 Running scheduled maintenance tasks...');
        
        // Get metrics before cleanup
        const beforeMetrics = await this.getCleanupMetrics();
        
        await this.cleanupOrphanedJobs();
        await this.autoResetProblematicFeeds();
        
        // Get metrics after cleanup
        const afterMetrics = await this.getCleanupMetrics();
        const cleanedJobs = beforeMetrics.orphanedJobsDetected - afterMetrics.orphanedJobsDetected;
        maintenanceStats.orphanedJobsCleanedTotal += Math.max(0, cleanedJobs);
        
        maintenanceStats.successfulRuns++;
        logger.info(`✅ Scheduled maintenance completed - Cleaned ${cleanedJobs} orphaned jobs`);
        
        // Log stats every 10 runs
        if (maintenanceStats.totalRuns % 10 === 0) {
          logger.info(`📊 Maintenance Stats: ${maintenanceStats.successfulRuns}/${maintenanceStats.totalRuns} successful, ${maintenanceStats.orphanedJobsCleanedTotal} total orphaned jobs cleaned`);
        }
      } catch (error) {
        maintenanceStats.failedRuns++;
        logger.error('❌ Scheduled maintenance failed:', error);
        
        // Alert if failure rate is high
        const failureRate = maintenanceStats.failedRuns / maintenanceStats.totalRuns;
        if (failureRate > 0.5 && maintenanceStats.totalRuns > 5) {
          logger.error(`🚨 HIGH MAINTENANCE FAILURE RATE: ${(failureRate * 100).toFixed(1)}% (${maintenanceStats.failedRuns}/${maintenanceStats.totalRuns})`);
        }
      } finally {
        isMaintenanceRunning = false;
      }
    }, cleanupIntervalMs);

    // Run cleanup every configured thorough interval (default: 2 hours)
    setInterval(async () => {
      if (isMaintenanceRunning) {
        logger.debug('⏭️ Maintenance already running, skipping thorough cleanup...');
        return;
      }
      
      try {
        isMaintenanceRunning = true;
        logger.info('🧹 Running thorough maintenance tasks...');
        
        const beforeMetrics = await this.getCleanupMetrics();
        await this.thoroughCleanup();
        const afterMetrics = await this.getCleanupMetrics();
        
        const cleanedJobs = beforeMetrics.orphanedJobsDetected - afterMetrics.orphanedJobsDetected;
        logger.info(`✅ Thorough maintenance completed - Cleaned ${cleanedJobs} orphaned jobs`);
        
        // Alert if many orphaned jobs were found (configurable threshold)
        if (beforeMetrics.orphanedJobsDetected > config.jobCleanup.orphanedThreshold) {
          logger.warn(`⚠️ HIGH ORPHANED JOB COUNT: Found ${beforeMetrics.orphanedJobsDetected} orphaned jobs during thorough cleanup (threshold: ${config.jobCleanup.orphanedThreshold})`);
        }
      } catch (error) {
        logger.error('❌ Thorough maintenance failed:', error);
      } finally {
        isMaintenanceRunning = false;
      }
    }, thoroughIntervalMs);
  }

  /**
   * Thorough cleanup that removes ALL orphaned jobs and resets problematic feeds
   */
  private async thoroughCleanup(): Promise<void> {
    try {
      const { database } = await import('../database/database.service.js');
      
      // Get ALL recurring jobs from Redis
      const recurringJobs = await this.feedCheckQueue.getRepeatableJobs();

      if (recurringJobs.length === 0) {
        logger.debug('No recurring jobs found for thorough cleanup');
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
            cleanedCount++;
            continue;
          }
          
          const feedIdMatch = jobId.match(/^recurring-feed-(.+)$/);
          if (!feedIdMatch) {
            // Remove jobs with unexpected ID format
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
            cleanedCount++;
            continue;
          }

          const feedId = feedIdMatch[1];
          
          if (feedId && !existingFeedIds.has(feedId)) {
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
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
          resetCount++;
        } catch (error) {
          logger.error(`❌ Failed to reset stale feed ${feed.name} (${feed.id}):`, error);
        }
      }

      if (cleanedCount > 0 || resetCount > 0) {
        logger.info(`🧹 Thorough cleanup: ${cleanedCount} orphaned jobs removed, ${resetCount} stale feeds reset`);
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
      logger.info('🧹 Starting enhanced orphaned job cleanup...');
      
      // Get all recurring jobs from Redis
      const recurringJobs = await this.feedCheckQueue.getRepeatableJobs();

      if (recurringJobs.length === 0) {
        logger.debug('No recurring jobs to clean up');
        return;
      }

      // Import database service to check if feeds exist
      const { database } = await import('../database/database.service.js');
      
      // Get all existing feed IDs in one query for efficiency
      const existingFeeds = await database.client.feed.findMany({
        select: { id: true, name: true }
      });
      const existingFeedIds = new Set(existingFeeds.map((feed: any) => feed.id));
      
      let cleanedCount = 0;
      let errorCount = 0;
      let verifiedCount = 0;

      logger.info(`Found ${recurringJobs.length} recurring jobs, checking against ${existingFeedIds.size} existing feeds`);

      for (const job of recurringJobs) {
        try {
          // Extract feed ID from job ID (format: recurring-feed-{feedId})
          const jobId = job.id;
          
          if (!jobId) {
            // Remove jobs with null/undefined IDs
            // Sanitize job data before logging
            const { sanitizeForLogging } = await import('../utils/security/sanitizer.js');
            logger.warn(`Removing job with null/undefined ID: ${JSON.stringify(sanitizeForLogging(job))}`);
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
            cleanedCount++;
            continue;
          }
          
          const feedIdMatch = jobId.match(/^recurring-feed-(.+)$/);
          
          if (!feedIdMatch) {
            // Remove jobs with unexpected ID format
            logger.warn(`Removing job with unexpected ID format: ${jobId}`);
            await this.feedCheckQueue.removeRepeatableByKey(job.key);
            cleanedCount++;
            continue;
          }

          const feedId = feedIdMatch[1];
          
          // Check if feed exists using our pre-loaded set
          if (feedId && !existingFeedIds.has(feedId)) {
            // Feed doesn't exist, remove the orphaned job
            logger.info(`🗑️ Removing orphaned job for non-existent feed: ${feedId} (${jobId})`);
            
            // Use force removal for better cleanup
            const removed = await this.forceRemoveOrphanedJob(feedId);
            if (removed) {
              cleanedCount++;
              logger.info(`✅ Successfully removed orphaned job for feed ${feedId}`);
            } else {
              errorCount++;
              logger.error(`❌ Failed to remove orphaned job for feed ${feedId}`);
            }
          } else if (feedId) {
            verifiedCount++;
            logger.debug(`✅ Verified job exists for active feed: ${feedId}`);
          }
        } catch (error) {
          errorCount++;
          logger.error(`❌ Error processing job ${job.id || 'unknown'}:`, error);
        }
      }

      logger.info(`🧹 Enhanced cleanup completed: ${cleanedCount} orphaned jobs removed, ${verifiedCount} jobs verified, ${errorCount} errors`);
      
      if (cleanedCount > 0) {
        logger.info(`✅ Successfully cleaned up ${cleanedCount} orphaned jobs`);
      }
      
      if (errorCount > 0) {
        logger.warn(`⚠️ ${errorCount} errors occurred during cleanup - some orphaned jobs may remain`);
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
