import type { Job } from 'bullmq';
import { database } from '../../database/database.service.js';
import { parserService } from '../../services/parser.service.js';
import { logger } from '../../utils/logger/logger.service.js';
import { jobService } from '../job.service.js';
import type { JobData, JobResult } from '../job.service.js';

export interface FeedCheckJobData extends JobData {
  feedId: string;
  chatId: string;
  feedUrl: string;
  lastItemId?: string;
  failureCount?: number;
  forceProcessAll?: boolean;
}

export interface FeedCheckJobResult extends JobResult {
  newItemsCount?: number;
  lastItemId?: string;
  nextCheckAt?: Date;
  failureCount?: number;
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
  const { feedId, chatId, feedUrl, lastItemId, failureCount = 0, forceProcessAll = false } = job.data;

  logger.info(`Processing feed check for feed ${feedId} in chat ${chatId}`);

  try {
    // Check the feed for new items
    const checkResult = await parserService.checkFeed(feedUrl, lastItemId, failureCount, forceProcessAll);

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

    // Process and deduplicate new items
    const processedItems = parserService.processItems(checkResult.newItems);
    const newItemsCount = processedItems.length;

    // If there are new items, queue them for message sending
    if (newItemsCount > 0) {
      await queueMessageJob({
        chatId,
        feedId,
        feedName: feedId, // TODO: Get actual feed name from database
        items: processedItems.map((item) => ({
          id: item.id,
          title: item.title,
          link: item.link,
          description: item.description,
          pubDate: item.pubDate?.toISOString(),
          author: item.author,
        })),
      });

      logger.info(`Queued ${newItemsCount} new items for sending to chat ${chatId}`);
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

    // Update the feed's last check time and last item ID in the database
    try {
      await database.feeds.updateLastCheck(feedId, checkResult.lastItemId);
      logger.debug(`Updated feed ${feedId} last check time and last item ID: ${checkResult.lastItemId}`);
    } catch (error) {
      logger.error(`Failed to update feed ${feedId} last check time:`, error);
      // Don't fail the entire job if database update fails
    }

    logger.info(`Feed check completed for feed ${feedId}: ${newItemsCount} new items`);
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
  }
}

/**
 * Queue a message sending job
 */
async function queueMessageJob(data: MessageJobData): Promise<void> {
  try {
    // Ensure the message queue exists
    jobService.createQueue(FEED_QUEUE_NAMES.MESSAGE_SEND);

    await jobService.addJob(FEED_QUEUE_NAMES.MESSAGE_SEND, FEED_JOB_NAMES.SEND_MESSAGE, data, {
      priority: 1, // High priority for message sending
      attempts: 5, // Retry message sending up to 5 times
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    logger.debug(`Queued message job for chat ${data.chatId} with ${data.items.length} items`);
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
