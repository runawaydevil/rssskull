import type { Job } from 'bullmq';
import { notificationService } from '../../services/notification.service.js';
import type { RSSItem } from '../../services/rss.service.js';
import { logger } from '../../utils/logger/logger.service.js';
import { parseDate } from '../../utils/date-parser.js';
import type { JobData, JobResult } from '../job.service.js';

export interface MessageSendJobData extends JobData {
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
  template?: string;
}

export interface MessageSendJobResult extends JobResult {
  messagesSent?: number;
  messagesTotal?: number;
}

/**
 * Process message sending jobs
 * This processor will be responsible for:
 * 1. Formatting RSS items into messages
 * 2. Sending messages to Telegram chats
 * 3. Handling rate limiting and retries
 */
export async function processMessageSend(
  job: Job<MessageSendJobData>
): Promise<MessageSendJobResult> {
  // CRÍTICO: Try-catch adicional para garantir que nunca crasha o worker
  try {
    return await processMessageSendInternal(job);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error(`CRITICAL: Unhandled error in processMessageSend wrapper:`, error);
    logger.error(`CRITICAL: Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      jobId: job.id,
      feedId: job.data?.feedId,
      chatId: job.data?.chatId,
    });
    
    // Retornar erro controlado em vez de deixar crashar
    return {
      success: false,
      message: `Critical error: ${errorMessage}`,
      messagesSent: 0,
      messagesTotal: job.data?.items?.length || 0,
    };
  }
}

async function processMessageSendInternal(
  job: Job<MessageSendJobData>
): Promise<MessageSendJobResult> {
  const { chatId, feedId, feedName, items, template } = job.data;

  // 🔥 LOG ESPECÍFICO PARA RASTREAR DUPLICAÇÃO
  logger.info(`🔥 PROCESSING MESSAGE JOB - Job ID: ${job.id} | Feed: ${feedName} (${feedId}) | Chat: ${chatId} | Items: ${items.length}`);
  
  // Get feed configuration for max age filter
  const { database } = await import('../../database/database.service.js');
  const feed = await database.client.feed.findUnique({
    where: { id: feedId },
    select: { maxAgeMinutes: true },
  });
  
  const maxAgeMinutes = feed?.maxAgeMinutes ?? 1440; // Default 24 hours
  
  // Log item dates for debugging
  const firstItem = items[0];
  if (firstItem?.pubDate) {
    const firstItemDate = new Date(firstItem.pubDate);
    const minutesAgo = Math.round((Date.now() - firstItemDate.getTime()) / (1000 * 60));
    const hoursAgo = Math.round(minutesAgo / 60);
    
    logger.info(`📅 First item date: ${firstItemDate.toISOString()} (${minutesAgo} min / ${hoursAgo}h ago)`);
    
    // Configurable age filter based on feed settings
    if (minutesAgo > maxAgeMinutes) {
      logger.warn(`⚠️ Refusing to send items older than ${maxAgeMinutes} minutes (${minutesAgo} min old) for feed ${feedName} (${feedId})`);
      return {
        success: false,
        message: `Items too old (${minutesAgo} minutes, max: ${maxAgeMinutes})`,
        messagesSent: 0,
        messagesTotal: items.length,
      };
    }
  }
  
  logger.info(
    `Processing message send for feed ${feedName} (${feedId}) to chat ${chatId} (${items.length} items)`
  );

  try {
    // Convert job data items back to RSSItem format
    const rssItems: RSSItem[] = items.map((item) => ({
      id: item.id,
      title: item.title,
      link: item.link,
      description: item.description,
      author: item.author,
      pubDate: parseDate(item.pubDate),
    }));

    // Send the RSS items
    const results = await notificationService.sendRSSItems(chatId, rssItems, feedName, template);

    // Count successful sends
    const successfulSends = results.filter((result) => result.success).length;
    const totalSends = results.length;

    if (successfulSends === 0) {
      // All sends failed
      const firstError = results.find((r) => !r.success)?.error || 'Unknown error';
      logger.error(`All message sends failed for feed ${feedId} to chat ${chatId}: ${firstError}`);

      return {
        success: false,
        message: `All ${totalSends} message sends failed: ${firstError}`,
        messagesSent: 0,
        messagesTotal: totalSends,
      };
    }

    if (successfulSends < totalSends) {
      // Partial success
      logger.warn(
        `Partial success sending messages for feed ${feedId} to chat ${chatId}: ${successfulSends}/${totalSends} sent`
      );
    } else {
      // Full success
      logger.info(
        `Successfully sent all messages for feed ${feedId} to chat ${chatId}: ${successfulSends}/${totalSends}`
      );
    }

    return {
      success: successfulSends > 0,
      message: `Sent ${successfulSends}/${totalSends} messages successfully`,
      messagesSent: successfulSends,
      messagesTotal: totalSends,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error(`Message send failed for feed ${feedId} to chat ${chatId}:`, error);

    return {
      success: false,
      message: errorMessage,
      messagesSent: 0,
      messagesTotal: items.length,
    };
  }
}

/**
 * Queue names for message processing
 */
export const MESSAGE_QUEUE_NAMES = {
  MESSAGE_SEND: 'message-send',
} as const;

/**
 * Job names for message processing
 */
export const MESSAGE_JOB_NAMES = {
  SEND_MESSAGE: 'send-message',
} as const;
