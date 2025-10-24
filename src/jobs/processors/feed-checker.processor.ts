import type { Job } from 'bullmq';
import { database } from '../../database/database.service.js';
import { FeedRepository } from '../../database/repositories/feed.repository.js';
import { parserService } from '../../services/parser.service.js';
import { logger } from '../../utils/logger/logger.service.js';
import { jobService } from '../job.service.js';
import type { JobData, JobResult } from '../job.service.js';
import { createDedupeService } from '../../services/dedupe.service.js';
import type { RSSItem } from '../../services/rss.service.js';

export interface FeedCheckJobData extends JobData {
  feedId: string;
  chatId: string;
  feedUrl: string;
  lastItemId?: string;
  failureCount?: number;
}

export interface FeedCheckJobResult extends JobResult {
  newItemsCount?: number;
  lastItemId?: string;
  nextCheckAt?: Date;
  failureCount?: number;
  totalItemsCount?: number;
}

export interface MessageJobData extends JobData {
  chatId: string;
  feedId: string;
  feedName: string;
  items: Array<{
    id: string;
    title: string;
    link: string;
    description?: string;
    pubDate?: string; // ISO string
    author?: string;
  }>;
}

/**
 * Process feed checking jobs
 * This processor will be responsible for:
 * 1. Fetching RSS feeds
 * 2. Detecting new items
 * 3. Queuing notification jobs for new items
 */
export async function processFeedCheck(job: Job<FeedCheckJobData>): Promise<FeedCheckJobResult> {
  const { feedId, chatId, feedUrl, lastItemId, failureCount = 0 } = job.data;

  // Add lock to prevent duplicate processing
  const lockKey = `feed-check-lock:${feedId}`;
  const lockValue = `${Date.now()}-${Math.random()}`;
  const lockTTL = 60; // 1 minute lock (reduced from 5 minutes)
  
  try {
    // Try to acquire lock
    const lockAcquired = await jobService.acquireLock(lockKey, lockValue, lockTTL);
    if (!lockAcquired) {
      logger.warn(`Feed ${feedId} is already being processed, skipping duplicate`);
      return {
        success: false,
        message: 'Feed is already being processed',
        failureCount,
      };
    }

    logger.info(`Processing feed check for feed ${feedId} in chat ${chatId} (lastItemId from job: ${lastItemId || 'none'})`);

    // Get feed information from database
    const feedRepository = new FeedRepository(database.client);
    const feed = await feedRepository.findById(feedId);
    
    if (!feed) {
      logger.error(`Feed ${feedId} not found in database - removing orphaned job`);
      
      // Remove the orphaned recurring job from Redis
      try {
        const orphanedJobId = `recurring-feed-${feedId}`;
        const feedQueue = jobService.getQueue(FEED_QUEUE_NAMES.FEED_CHECK);
        if (feedQueue) {
          const orphanedJob = await feedQueue.getJob(orphanedJobId);
          if (orphanedJob) {
            await orphanedJob.remove();
            logger.info(`Removed orphaned recurring job: ${orphanedJobId}`);
          }
        }
      } catch (error) {
        logger.warn(`Failed to remove orphaned job for feed ${feedId}:`, error);
      }
      
      return {
        success: false,
        message: `Feed ${feedId} not found`,
        failureCount: failureCount + 1,
      };
    }

    const feedName = feed.name;

    // Always use the lastItemId from database to ensure consistency
    // Only fall back to job data if database has no lastItemId
    const currentLastItemId = feed.lastItemId ?? lastItemId;
    
    logger.info(`Feed ${feedId} lastItemId - Database: ${feed.lastItemId || 'none'}, Job: ${lastItemId || 'none'}, Using: ${currentLastItemId || 'none'}`);

    // Check the feed for new items
    const checkResult = await parserService.checkFeed(feedUrl, currentLastItemId, failureCount);
    
    // Log total items found before filtering (for visibility)
    if (checkResult.success && checkResult.totalItemsCount !== undefined) {
      logger.info(`Feed check results for ${feedUrl}: total items found: ${checkResult.totalItemsCount}, new items: ${checkResult.newItems.length}`);
    }

    if (!checkResult.success) {
      // Feed check failed, return failure result with exponential backoff
      const newFailureCount = failureCount + 1;
      const nextCheckAt = new Date(Date.now() + (checkResult.nextCheckDelay || 300000));

      logger.warn(
        `Feed check failed for feed ${feedId} (failure #${newFailureCount}): ${checkResult.error}`
      );

      return {
        success: false,
        message: checkResult.error || 'Feed check failed',
        failureCount: newFailureCount,
        nextCheckAt,
        lastItemId: checkResult.lastItemId,
      };
    }

    // Get feed's timestamp filter (use lastNotifiedAt or createdAt as fallback)
    const lastNotifiedAt = feed.lastNotifiedAt || feed.createdAt;
    
    // Initialize dedupe service
    const dedupeService = createDedupeService(database.client);
    
    // Filter items by timestamp and dedupe
    const freshItems: RSSItem[] = [];
    const allSeenItems: RSSItem[] = [];
    
    for (const item of checkResult.newItems) {
      // Track all items seen (even if we don't notify)
      allSeenItems.push(item);
      
      // Check if item is newer than last notification
      const isNew = !item.pubDate || !lastNotifiedAt || item.pubDate > lastNotifiedAt;
      
      if (isNew) {
        // Check dedupe before adding
        const alreadySeen = await dedupeService.has(item.id);
        if (!alreadySeen) {
          freshItems.push(item);
        }
      }
    }
    
    // Mark items as seen in dedupe
    if (allSeenItems.length > 0) {
      await dedupeService.addBatch(allSeenItems.map(item => ({ itemId: item.id, feedId })));
    }
    
    // Process final items (deduplicate and sort)
    const processedItems = parserService.processItems(freshItems);
    const newItemsCount = processedItems.length;
    
    // Calculate timestamps for database update
    const mostRecentPubDate = allSeenItems.length > 0 && allSeenItems[0]?.pubDate 
      ? allSeenItems[0].pubDate 
      : undefined;
    
    const lastNotifiedTimestamp = newItemsCount > 0 && processedItems[0]?.pubDate
      ? processedItems[0].pubDate
      : undefined;

    // If there are new items, queue them for message sending
    if (newItemsCount > 0) {
      // Create unique job ID to prevent duplicate message sending
      const messageJobId = `message-${feedId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 🔥 LOG ESPECÍFICO PARA RASTREAR DUPLICAÇÃO
      logger.info(`🔥 CREATING MESSAGE JOB - Feed: ${feedId} | Chat: ${chatId} | Items: ${newItemsCount} | JobID: ${messageJobId}`);
      
      await queueMessageJob({
        chatId,
        feedId,
        feedName: feedName, // Use actual feed name from database
        items: processedItems.map((item) => ({
          id: item.id,
          title: item.title,
          link: item.link,
          description: item.description,
          pubDate: item.pubDate?.toISOString(),
          author: item.author,
        })),
      }, messageJobId);

      logger.info(`Queued ${newItemsCount} new items for sending to chat ${chatId} with job ID ${messageJobId}`);
    }

    // Calculate next check time (reset failure count on success)
    const nextCheckAt = new Date(Date.now() + (checkResult.nextCheckDelay || 300000));

    const result: FeedCheckJobResult = {
      success: true,
      message: `Feed check completed: ${newItemsCount} new items`,
      newItemsCount,
      lastItemId: checkResult.lastItemId,
      nextCheckAt,
      failureCount: 0, // Reset failure count on success
    };

    // Update the feed's last check time, last item ID, and timestamps in the database
    try {
      await database.feeds.updateLastNotified(
        feedId,
        lastNotifiedTimestamp,
        mostRecentPubDate,
        checkResult.lastItemId
      );
      logger.debug(`Updated feed ${feedId} last check time, last item ID, and timestamps`);
    } catch (error) {
      logger.error(`Failed to update feed ${feedId} timestamps:`, error);
      // Don't fail the entire job if database update fails
    }

    // Log already done above with total count, no need to duplicate
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const newFailureCount = failureCount + 1;
    const nextCheckAt = new Date(Date.now() + 300000 * 2 ** newFailureCount); // Exponential backoff

    logger.error(`Feed check failed for feed ${feedId} (failure #${newFailureCount}):`, error);

    return {
      success: false,
      message: errorMessage,
      failureCount: newFailureCount,
      nextCheckAt,
      lastItemId,
    };
  } finally {
    // Always release the lock
    await jobService.releaseLock(lockKey, lockValue);
  }
}

/**
 * Queue a message sending job
 */
async function queueMessageJob(data: MessageJobData, jobId?: string): Promise<void> {
  try {
    // Ensure the message queue exists
    jobService.createQueue(FEED_QUEUE_NAMES.MESSAGE_SEND);

    const options: any = {
      priority: 1, // High priority for message sending
      attempts: 5, // Retry message sending up to 5 times
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: false, // Don't remove completed jobs immediately to prevent duplicates
      removeOnFail: false, // Don't remove failed jobs immediately
    };

    // Add jobId if provided to prevent duplicates
    if (jobId) {
      options.jobId = jobId;
    }

    // 🔥 LOG ESPECÍFICO PARA RASTREAR DUPLICAÇÃO
    logger.info(`🔥 QUEUEING MESSAGE JOB - Job ID: ${jobId} | Feed: ${data.feedId} | Chat: ${data.chatId} | Items: ${data.items.length}`);

    await jobService.addJob(FEED_QUEUE_NAMES.MESSAGE_SEND, FEED_JOB_NAMES.SEND_MESSAGE, data, options);

    logger.debug(`Queued message job for chat ${data.chatId} with ${data.items.length} items${jobId ? ` (ID: ${jobId})` : ''}`);
  } catch (error) {
    logger.error('Failed to queue message job:', error);
    throw error;
  }
}

/**
 * Queue names for feed processing
 */
export const FEED_QUEUE_NAMES = {
  FEED_CHECK: 'feed-check',
  MESSAGE_SEND: 'message-send',
} as const;

/**
 * Job names for feed processing
 */
export const FEED_JOB_NAMES = {
  CHECK_FEED: 'check-feed',
  SEND_MESSAGE: 'send-message',
} as const;
