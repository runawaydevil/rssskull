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
  private feedCheckWorker: Worker<FeedCheckJobData, FeedCheckJobResult>;
  private messageSendWorker: Worker<MessageSendJobData, MessageSendJobResult>;
  private scheduledFeeds: Set<string> = new Set();

  constructor() {
    // Create the feed check queue
    this.feedCheckQueue = jobService.createQueue(FEED_QUEUE_NAMES.FEED_CHECK);

    // Create the message send queue
    this.messageSendQueue = jobService.createQueue(FEED_QUEUE_NAMES.MESSAGE_SEND);

    // Create the worker for processing feed checks
    this.feedCheckWorker = jobService.createWorker(FEED_QUEUE_NAMES.FEED_CHECK, processFeedCheck);

    // Create the worker for processing message sends
    this.messageSendWorker = jobService.createWorker(
      FEED_QUEUE_NAMES.MESSAGE_SEND,
      processMessageSend
    );

    logger.info('Feed queue service initialized');
    logger.info(`Created feed check worker for queue: ${FEED_QUEUE_NAMES.FEED_CHECK}`);
    logger.info(`Created message send worker for queue: ${FEED_QUEUE_NAMES.MESSAGE_SEND}`);
  }

  /**
   * Schedule a feed check job
   */
  async scheduleFeedCheck(data: FeedCheckJobData, delayMs?: number): Promise<void> {
    const options = delayMs ? { delay: delayMs } : {};

    await jobService.addJob(FEED_QUEUE_NAMES.FEED_CHECK, FEED_JOB_NAMES.CHECK_FEED, data, options);

    logger.debug(`Scheduled feed check for feed ${data.feedId} in chat ${data.chatId}`);
  }

  /**
   * Schedule recurring feed checks for a feed
   */
  async scheduleRecurringFeedCheck(data: FeedCheckJobData, intervalMinutes = 5): Promise<void> {
    const jobId = `recurring-feed-${data.feedId}`;
    
    // Global duplicate prevention - check if feed was already scheduled in this session
    if (this.scheduledFeeds.has(data.feedId)) {
      logger.warn(`Feed ${data.feedId} already scheduled in this session, skipping duplicate creation`);
      return;
    }
    
    // Check if job already exists in Redis to prevent duplicates
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
   * Close the service
   */
  async close(): Promise<void> {
    await this.feedCheckWorker.close();
    await this.messageSendWorker.close();
    logger.info('Feed queue service closed');
  }
}

// Singleton instance
export const feedQueueService = new FeedQueueService();
