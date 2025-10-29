import { MessageQueue, QueuedMessage } from './message-queue.js';
import { PersistentMessageQueue } from './persistent-message-queue.js';
import { logger } from '../utils/logger/logger.service.js';

export interface QueueProcessor {
  start(): Promise<void>;
  stop(): Promise<void>;
  processMessage(message: QueuedMessage): Promise<boolean>;
  getProcessingStats(): ProcessingStats;
}

export interface ProcessingStats {
  messagesProcessed: number;
  messagesSuccessful: number;
  messagesFailed: number;
  averageProcessingTime: number;
  isRunning: boolean;
  lastProcessedAt: Date | null;
  currentBatchSize: number;
  rateLimitDelay: number;
}

export interface QueueProcessorConfig {
  batchSize: number;           // Messages to process per batch
  processingInterval: number;  // Interval between batches (ms)
  maxMessagesPerMinute: number; // Rate limiting
  retryFailedMessages: boolean;
  maxRetryAttempts: number;
}

/**
 * Processes queued messages with rate limiting and batch processing
 */
export class TelegramQueueProcessor implements QueueProcessor {
  private queue: MessageQueue;
  private config: QueueProcessorConfig;
  private isRunning: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private stats: ProcessingStats;
  private messageHandler: ((message: QueuedMessage) => Promise<boolean>) | null = null;
  private rateLimitTracker: { count: number; windowStart: number } = { count: 0, windowStart: Date.now() };

  constructor(queue: MessageQueue, config?: Partial<QueueProcessorConfig>) {
    this.queue = queue;
    this.config = {
      batchSize: 20,
      processingInterval: 5000, // 5 seconds
      maxMessagesPerMinute: 20,
      retryFailedMessages: true,
      maxRetryAttempts: 3,
      ...config
    };

    this.stats = {
      messagesProcessed: 0,
      messagesSuccessful: 0,
      messagesFailed: 0,
      averageProcessingTime: 0,
      isRunning: false,
      lastProcessedAt: null,
      currentBatchSize: 0,
      rateLimitDelay: 0
    };
  }

  /**
   * Sets the message handler function
   */
  setMessageHandler(handler: (message: QueuedMessage) => Promise<boolean>): void {
    this.messageHandler = handler;
  }

  /**
   * Starts the queue processor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Queue processor is already running');
      return;
    }

    if (!this.messageHandler) {
      throw new Error('Message handler must be set before starting processor');
    }

    this.isRunning = true;
    this.stats.isRunning = true;

    logger.info('Starting queue processor', {
      batchSize: this.config.batchSize,
      processingInterval: this.config.processingInterval,
      maxMessagesPerMinute: this.config.maxMessagesPerMinute
    });

    // Start processing loop
    this.processingInterval = setInterval(async () => {
      try {
        await this.processBatch();
      } catch (error) {
        logger.error('Error in processing batch', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.processingInterval);

    // Initial batch processing
    setTimeout(() => this.processBatch(), 1000);
  }

  /**
   * Stops the queue processor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.stats.isRunning = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info('Queue processor stopped', {
      totalProcessed: this.stats.messagesProcessed,
      successRate: this.stats.messagesProcessed > 0 
        ? this.stats.messagesSuccessful / this.stats.messagesProcessed 
        : 0
    });
  }

  /**
   * Processes a single message
   */
  async processMessage(message: QueuedMessage): Promise<boolean> {
    if (!this.messageHandler) {
      throw new Error('Message handler not set');
    }

    const startTime = Date.now();

    try {
      logger.debug('Processing message', {
        messageId: message.id,
        chatId: message.chatId,
        priority: message.priority,
        retryCount: message.retryCount
      });

      // Check if message has expired
      if (message.expiresAt <= new Date()) {
        logger.warn('Message expired, skipping', {
          messageId: message.id,
          expiresAt: message.expiresAt.toISOString()
        });
        
        if (this.queue instanceof PersistentMessageQueue) {
          await this.queue.removeMessage(message.id);
        }
        
        return false;
      }

      // Check retry limit
      if (message.retryCount >= message.maxRetries) {
        logger.warn('Message exceeded max retries, removing', {
          messageId: message.id,
          retryCount: message.retryCount,
          maxRetries: message.maxRetries
        });
        
        if (this.queue instanceof PersistentMessageQueue) {
          await this.queue.markMessageFailed(message.id, 'Max retries exceeded');
          await this.queue.removeMessage(message.id);
        }
        
        this.stats.messagesFailed++;
        return false;
      }

      // Process the message
      const success = await this.messageHandler(message);
      const processingTime = Date.now() - startTime;

      // Update statistics
      this.updateProcessingStats(processingTime);

      if (success) {
        logger.debug('Message processed successfully', {
          messageId: message.id,
          processingTime
        });

        if (this.queue instanceof PersistentMessageQueue) {
          await this.queue.markMessageSent(message.id);
          await this.queue.removeMessage(message.id);
        }

        this.stats.messagesSuccessful++;
        return true;
      } else {
        logger.warn('Message processing failed', {
          messageId: message.id,
          retryCount: message.retryCount,
          processingTime
        });

        if (this.queue instanceof PersistentMessageQueue) {
          await this.queue.markMessageFailed(message.id, 'Processing failed');
        }

        // Re-queue for retry if enabled and under retry limit
        if (this.config.retryFailedMessages && message.retryCount < message.maxRetries) {
          message.retryCount++;
          await this.queue.enqueue(message);
          
          logger.info('Message re-queued for retry', {
            messageId: message.id,
            retryCount: message.retryCount
          });
        }

        this.stats.messagesFailed++;
        return false;
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateProcessingStats(processingTime);

      logger.error('Error processing message', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      if (this.queue instanceof PersistentMessageQueue) {
        await this.queue.markMessageFailed(
          message.id, 
          error instanceof Error ? error.message : String(error)
        );
      }

      this.stats.messagesFailed++;
      return false;
    }
  }

  /**
   * Gets current processing statistics
   */
  getProcessingStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Processes a batch of messages
   */
  private async processBatch(): Promise<void> {
    if (!this.isRunning || !this.messageHandler) {
      return;
    }

    // Check rate limiting
    if (!this.checkRateLimit()) {
      logger.debug('Rate limit reached, skipping batch');
      return;
    }

    // Remove expired messages first
    await this.queue.removeExpiredMessages();

    const batchSize = Math.min(this.config.batchSize, this.getRemainingRateLimit());
    const messages: QueuedMessage[] = [];

    // Collect messages for batch
    for (let i = 0; i < batchSize; i++) {
      const message = await this.queue.dequeue();
      if (!message) {
        break;
      }
      messages.push(message);
    }

    if (messages.length === 0) {
      return;
    }

    this.stats.currentBatchSize = messages.length;

    logger.debug('Processing message batch', {
      batchSize: messages.length,
      queueSize: this.queue.size(),
      rateLimitRemaining: this.getRemainingRateLimit()
    });

    // Process messages with delay between each to respect rate limits
    const delayBetweenMessages = this.calculateMessageDelay(messages.length);
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (!message) {
        continue;
      }
      
      try {
        await this.processMessage(message);
        this.rateLimitTracker.count++;
        
        // Add delay between messages (except for the last one)
        if (i < messages.length - 1 && delayBetweenMessages > 0) {
          await this.sleep(delayBetweenMessages);
        }
      } catch (error) {
        logger.error('Error in batch processing', {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.stats.lastProcessedAt = new Date();
    this.stats.currentBatchSize = 0;
  }

  /**
   * Checks if we're within rate limits
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowDuration = 60 * 1000; // 1 minute

    // Reset window if needed
    if (now - this.rateLimitTracker.windowStart >= windowDuration) {
      this.rateLimitTracker.count = 0;
      this.rateLimitTracker.windowStart = now;
    }

    return this.rateLimitTracker.count < this.config.maxMessagesPerMinute;
  }

  /**
   * Gets remaining rate limit capacity
   */
  private getRemainingRateLimit(): number {
    return Math.max(0, this.config.maxMessagesPerMinute - this.rateLimitTracker.count);
  }

  /**
   * Calculates delay between messages to spread them evenly
   */
  private calculateMessageDelay(messageCount: number): number {
    if (messageCount <= 1) {
      return 0;
    }

    // Spread messages evenly across the processing interval
    const totalDelay = this.config.processingInterval * 0.8; // Use 80% of interval
    const delay = Math.floor(totalDelay / messageCount);
    
    this.stats.rateLimitDelay = delay;
    return delay;
  }

  /**
   * Updates processing statistics
   */
  private updateProcessingStats(processingTime: number): void {
    this.stats.messagesProcessed++;
    
    // Update average processing time
    const totalMessages = this.stats.messagesProcessed;
    this.stats.averageProcessingTime = 
      ((this.stats.averageProcessingTime * (totalMessages - 1)) + processingTime) / totalMessages;
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets queue health information
   */
  getQueueHealth(): Record<string, any> {
    const queueStats = this.queue.getQueueStats();
    
    return {
      processor: this.getProcessingStats(),
      queue: queueStats,
      health: {
        isHealthy: this.isRunning && queueStats.totalMessages < 500, // Healthy if under 500 messages
        queueBacklog: queueStats.totalMessages,
        processingRate: this.calculateProcessingRate(),
        estimatedClearTime: this.estimateQueueClearTime(queueStats.totalMessages)
      }
    };
  }

  /**
   * Calculates current processing rate (messages per minute)
   */
  private calculateProcessingRate(): number {
    if (!this.stats.lastProcessedAt || this.stats.messagesProcessed === 0) {
      return 0;
    }

    const runtimeMinutes = (Date.now() - (this.stats.lastProcessedAt.getTime() - (this.stats.messagesProcessed * this.stats.averageProcessingTime))) / (60 * 1000);
    return runtimeMinutes > 0 ? this.stats.messagesProcessed / runtimeMinutes : 0;
  }

  /**
   * Estimates time to clear current queue
   */
  private estimateQueueClearTime(queueSize: number): number {
    const processingRate = this.calculateProcessingRate();
    if (processingRate === 0) {
      return 0;
    }

    return (queueSize / processingRate) * 60 * 1000; // Return in milliseconds
  }
}

// Factory function to create a queue processor
export function createQueueProcessor(
  queue: MessageQueue, 
  config?: Partial<QueueProcessorConfig>
): TelegramQueueProcessor {
  return new TelegramQueueProcessor(queue, config);
}