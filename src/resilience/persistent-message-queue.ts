import { PrismaClient } from '@prisma/client';
import { MessageQueue, QueuedMessage, MessagePriority, QueueStats, InMemoryMessageQueue } from './message-queue.js';
import { logger } from '../utils/logger/logger.service.js';

export interface QueuePersistence {
  saveMessage(message: QueuedMessage): Promise<void>;
  loadPendingMessages(): Promise<QueuedMessage[]>;
  updateMessageStatus(messageId: string, status: string, error?: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  cleanupExpiredMessages(): Promise<number>;
  getQueueStats(): Promise<QueueStats>;
}

/**
 * Database persistence layer for message queue
 */
export class MessageQueuePersistence implements QueuePersistence {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Saves a message to the database
   */
  async saveMessage(message: QueuedMessage): Promise<void> {
    try {
      await (this.prisma as any).queuedMessage.create({
        data: {
          id: message.id,
          chatId: message.chatId,
          messageData: JSON.stringify({
            text: message.text,
            options: message.options
          }),
          priority: message.priority,
          enqueuedAt: message.enqueuedAt,
          retryCount: message.retryCount,
          maxRetries: message.maxRetries,
          expiresAt: message.expiresAt,
          status: 'pending'
        }
      });

      logger.debug('Message saved to database', {
        messageId: message.id,
        chatId: message.chatId,
        priority: message.priority
      });
    } catch (error) {
      logger.error('Failed to save message to database', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Loads all pending messages from database
   */
  async loadPendingMessages(): Promise<QueuedMessage[]> {
    try {
      const records = await (this.prisma as any).queuedMessage.findMany({
        where: {
          status: 'pending',
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: [
          { priority: 'desc' },
          { enqueuedAt: 'asc' }
        ]
      });

      const messages: QueuedMessage[] = records.map((record: any) => {
        const messageData = JSON.parse(record.messageData);
        return {
          id: record.id,
          chatId: record.chatId,
          text: messageData.text,
          options: messageData.options,
          priority: record.priority as MessagePriority,
          enqueuedAt: record.enqueuedAt,
          retryCount: record.retryCount,
          maxRetries: record.maxRetries,
          expiresAt: record.expiresAt
        };
      });

      logger.debug('Loaded pending messages from database', {
        messageCount: messages.length
      });

      return messages;
    } catch (error) {
      logger.error('Failed to load pending messages', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Updates message status in database
   */
  async updateMessageStatus(messageId: string, status: string, error?: string): Promise<void> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date()
      };

      if (status === 'processing') {
        updateData.processedAt = new Date();
      }

      if (error) {
        updateData.lastError = error;
      }

      if (status === 'failed') {
        // Increment retry count
        const current = await (this.prisma as any).queuedMessage.findUnique({
          where: { id: messageId },
          select: { retryCount: true }
        });

        if (current) {
          updateData.retryCount = current.retryCount + 1;
        }
      }

      await (this.prisma as any).queuedMessage.update({
        where: { id: messageId },
        data: updateData
      });

      logger.debug('Updated message status', {
        messageId,
        status,
        error: error ? error.substring(0, 100) : undefined
      });
    } catch (error) {
      logger.error('Failed to update message status', {
        messageId,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Deletes a message from database
   */
  async deleteMessage(messageId: string): Promise<void> {
    try {
      await (this.prisma as any).queuedMessage.delete({
        where: { id: messageId }
      });

      logger.debug('Message deleted from database', { messageId });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
        logger.debug('Message not found for deletion', { messageId });
        return;
      }

      logger.error('Failed to delete message', {
        messageId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Cleans up expired messages from database
   */
  async cleanupExpiredMessages(): Promise<number> {
    try {
      const result = await (this.prisma as any).queuedMessage.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { 
              status: 'failed',
              retryCount: { gte: (this.prisma as any).queuedMessage.maxRetries }
            }
          ]
        }
      });

      if (result.count > 0) {
        logger.info('Cleaned up expired messages', {
          deletedCount: result.count
        });
      }

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup expired messages', {
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Gets queue statistics from database
   */
  async getQueueStats(): Promise<QueueStats> {
    try {
      const [totalMessages, messagesByStatus, oldestMessage] = await Promise.all([
        (this.prisma as any).queuedMessage.count({
          where: { status: 'pending' }
        }),
        (this.prisma as any).queuedMessage.groupBy({
          by: ['priority'],
          where: { status: 'pending' },
          _count: { id: true }
        }),
        (this.prisma as any).queuedMessage.findFirst({
          where: { status: 'pending' },
          orderBy: { enqueuedAt: 'asc' },
          select: { enqueuedAt: true }
        })
      ]);

      const messagesByPriority: Record<MessagePriority, number> = {
        [MessagePriority.LOW]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.CRITICAL]: 0
      };

      for (const group of messagesByStatus) {
        messagesByPriority[group.priority as MessagePriority] = group._count.id;
      }

      const now = Date.now();
      const oldestMessageAge = oldestMessage 
        ? now - oldestMessage.enqueuedAt.getTime()
        : 0;

      // Calculate average wait time (simplified)
      const averageWaitTime = oldestMessageAge / Math.max(totalMessages, 1);

      return {
        totalMessages,
        messagesByPriority,
        oldestMessageAge,
        averageWaitTime,
        expiredMessages: 0 // This would need a separate query to track
      };
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        totalMessages: 0,
        messagesByPriority: {
          [MessagePriority.LOW]: 0,
          [MessagePriority.NORMAL]: 0,
          [MessagePriority.HIGH]: 0,
          [MessagePriority.CRITICAL]: 0
        },
        oldestMessageAge: 0,
        averageWaitTime: 0,
        expiredMessages: 0
      };
    }
  }
}

/**
 * Hybrid message queue that uses in-memory queue with database persistence
 */
export class PersistentMessageQueue implements MessageQueue {
  private memoryQueue: InMemoryMessageQueue;
  private persistence: MessageQueuePersistence;
  private isInitialized: boolean = false;

  constructor(prisma: PrismaClient, maxSize: number = 1000, defaultTTL: number = 60 * 60 * 1000) {
    this.memoryQueue = new InMemoryMessageQueue(maxSize, defaultTTL);
    this.persistence = new MessageQueuePersistence(prisma);
  }

  /**
   * Initializes the queue by loading persisted messages
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Clean up expired messages first
      await this.persistence.cleanupExpiredMessages();

      // Load pending messages from database
      const persistedMessages = await this.persistence.loadPendingMessages();
      
      // Add them to memory queue
      for (const message of persistedMessages) {
        await this.memoryQueue.enqueue(message);
      }

      this.isInitialized = true;

      logger.info('Persistent message queue initialized', {
        loadedMessages: persistedMessages.length
      });
    } catch (error) {
      logger.error('Failed to initialize persistent message queue', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Enqueues a message with persistence
   */
  async enqueue(message: QueuedMessage): Promise<void> {
    // Save to database first
    await this.persistence.saveMessage(message);
    
    // Then add to memory queue
    await this.memoryQueue.enqueue(message);
  }

  /**
   * Dequeues a message and updates database status
   */
  async dequeue(): Promise<QueuedMessage | null> {
    const message = await this.memoryQueue.dequeue();
    
    if (message) {
      // Update status to processing
      await this.persistence.updateMessageStatus(message.id, 'processing');
    }

    return message;
  }

  /**
   * Peeks at next message without removing it
   */
  async peek(): Promise<QueuedMessage | null> {
    return await this.memoryQueue.peek();
  }

  /**
   * Returns current queue size
   */
  size(): number {
    return this.memoryQueue.size();
  }

  /**
   * Clears all messages from queue and database
   */
  async clear(): Promise<void> {
    await this.memoryQueue.clear();
    
    // Delete all pending messages from database
    try {
      await (this.persistence as any).prisma.queuedMessage.deleteMany({
        where: { status: 'pending' }
      });
      
      logger.info('Cleared all messages from persistent queue');
    } catch (error) {
      logger.error('Failed to clear messages from database', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Gets oldest message
   */
  async getOldestMessage(): Promise<QueuedMessage | null> {
    return await this.memoryQueue.getOldestMessage();
  }

  /**
   * Removes expired messages from both memory and database
   */
  async removeExpiredMessages(): Promise<number> {
    const memoryRemoved = await this.memoryQueue.removeExpiredMessages();
    const dbRemoved = await this.persistence.cleanupExpiredMessages();
    
    return memoryRemoved + dbRemoved;
  }

  /**
   * Gets messages by priority from memory queue
   */
  getMessagesByPriority(priority: MessagePriority): QueuedMessage[] {
    return this.memoryQueue.getMessagesByPriority(priority);
  }

  /**
   * Gets queue statistics
   */
  getQueueStats(): QueueStats {
    return this.memoryQueue.getQueueStats();
  }

  /**
   * Marks a message as successfully sent
   */
  async markMessageSent(messageId: string): Promise<void> {
    await this.persistence.updateMessageStatus(messageId, 'sent');
  }

  /**
   * Marks a message as failed
   */
  async markMessageFailed(messageId: string, error: string): Promise<void> {
    await this.persistence.updateMessageStatus(messageId, 'failed', error);
  }

  /**
   * Removes a message completely (after successful send or max retries)
   */
  async removeMessage(messageId: string): Promise<void> {
    await this.persistence.deleteMessage(messageId);
  }

  /**
   * Gets database statistics
   */
  async getDatabaseStats(): Promise<QueueStats> {
    return await this.persistence.getQueueStats();
  }
}