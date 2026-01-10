import { logger } from '../utils/logger/logger.service.js';

export enum MessagePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

export interface QueuedMessage {
  id: string;
  chatId: string;
  text: string;
  options?: any;
  priority: MessagePriority;
  enqueuedAt: Date;
  retryCount: number;
  maxRetries: number;
  expiresAt: Date;
}

export interface MessageQueue {
  enqueue(message: QueuedMessage): Promise<void>;
  dequeue(): Promise<QueuedMessage | null>;
  peek(): Promise<QueuedMessage | null>;
  size(): number;
  clear(): Promise<void>;
  getOldestMessage(): Promise<QueuedMessage | null>;
  removeExpiredMessages(): Promise<number>;
  getMessagesByPriority(priority: MessagePriority): QueuedMessage[];
  getQueueStats(): QueueStats;
}

export interface QueueStats {
  totalMessages: number;
  messagesByPriority: Record<MessagePriority, number>;
  oldestMessageAge: number;
  averageWaitTime: number;
  expiredMessages: number;
}

/**
 * In-memory message queue with priority handling and expiration
 */
export class InMemoryMessageQueue implements MessageQueue {
  private messages: QueuedMessage[] = [];
  private maxSize: number;
  private defaultTTL: number; // Time to live in milliseconds
  private expiredCount: number = 0;

  constructor(maxSize: number = 1000, defaultTTL: number = 60 * 60 * 1000) { // 1 hour default TTL
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Adds a message to the queue with priority ordering
   */
  async enqueue(message: QueuedMessage): Promise<void> {
    // Remove expired messages first
    await this.removeExpiredMessages();

    // Check if queue is full
    if (this.messages.length >= this.maxSize) {
      // Remove oldest low priority messages to make space
      const removed = this.removeOldestLowPriorityMessages(1);
      if (removed === 0) {
        throw new Error(`Message queue is full (${this.maxSize} messages)`);
      }
      
      logger.warn('Queue full, removed oldest low priority message', {
        queueSize: this.messages.length,
        maxSize: this.maxSize,
        newMessagePriority: message.priority
      });
    }

    // Insert message in priority order (higher priority first)
    let insertIndex = this.messages.length;
    for (let i = 0; i < this.messages.length; i++) {
      const currentMessage = this.messages[i];
      if (currentMessage && currentMessage.priority < message.priority) {
        insertIndex = i;
        break;
      }
    }

    this.messages.splice(insertIndex, 0, message);

    logger.debug('Message enqueued', {
      messageId: message.id,
      chatId: message.chatId,
      priority: message.priority,
      queueSize: this.messages.length,
      insertIndex,
      expiresAt: message.expiresAt.toISOString()
    });
  }

  /**
   * Removes and returns the highest priority message
   */
  async dequeue(): Promise<QueuedMessage | null> {
    // Remove expired messages first
    await this.removeExpiredMessages();

    if (this.messages.length === 0) {
      return null;
    }

    const message = this.messages.shift();
    if (!message) {
      return null;
    }

    logger.debug('Message dequeued', {
      messageId: message.id,
      chatId: message.chatId,
      priority: message.priority,
      waitTime: Date.now() - message.enqueuedAt.getTime(),
      remainingMessages: this.messages.length
    });

    return message;
  }

  /**
   * Returns the next message without removing it
   */
  async peek(): Promise<QueuedMessage | null> {
    // Remove expired messages first
    await this.removeExpiredMessages();

    const firstMessage = this.messages[0];
    return firstMessage || null;
  }

  /**
   * Returns the current queue size
   */
  size(): number {
    return this.messages.length;
  }

  /**
   * Clears all messages from the queue
   */
  async clear(): Promise<void> {
    const clearedCount = this.messages.length;
    this.messages = [];
    
    logger.info('Message queue cleared', {
      clearedMessages: clearedCount
    });
  }

  /**
   * Gets the oldest message in the queue
   */
  async getOldestMessage(): Promise<QueuedMessage | null> {
    if (this.messages.length === 0) {
      return null;
    }

    // Find oldest message by enqueuedAt timestamp
    let oldest = this.messages[0];
    if (!oldest) {
      return null;
    }
    
    for (const message of this.messages) {
      if (message.enqueuedAt < oldest.enqueuedAt) {
        oldest = message;
      }
    }

    return oldest;
  }

  /**
   * Removes expired messages from the queue
   */
  async removeExpiredMessages(): Promise<number> {
    const now = new Date();
    const initialCount = this.messages.length;
    
    this.messages = this.messages.filter(message => {
      const isExpired = message.expiresAt <= now;
      if (isExpired) {
        this.expiredCount++;
        logger.debug('Message expired and removed', {
          messageId: message.id,
          chatId: message.chatId,
          enqueuedAt: message.enqueuedAt.toISOString(),
          expiresAt: message.expiresAt.toISOString()
        });
      }
      return !isExpired;
    });

    const removedCount = initialCount - this.messages.length;
    
    if (removedCount > 0) {
      logger.info('Removed expired messages', {
        removedCount,
        remainingMessages: this.messages.length,
        totalExpired: this.expiredCount
      });
    }

    return removedCount;
  }

  /**
   * Gets messages by priority level
   */
  getMessagesByPriority(priority: MessagePriority): QueuedMessage[] {
    return this.messages.filter(message => message.priority === priority);
  }

  /**
   * Gets queue statistics
   */
  getQueueStats(): QueueStats {
    const now = Date.now();
    
    // Count messages by priority
    const messagesByPriority: Record<MessagePriority, number> = {
      [MessagePriority.LOW]: 0,
      [MessagePriority.NORMAL]: 0,
      [MessagePriority.HIGH]: 0,
      [MessagePriority.CRITICAL]: 0
    };

    let totalWaitTime = 0;
    let oldestMessageAge = 0;

    for (const message of this.messages) {
      messagesByPriority[message.priority]++;
      
      const waitTime = now - message.enqueuedAt.getTime();
      totalWaitTime += waitTime;
      
      if (waitTime > oldestMessageAge) {
        oldestMessageAge = waitTime;
      }
    }

    const averageWaitTime = this.messages.length > 0 ? totalWaitTime / this.messages.length : 0;

    return {
      totalMessages: this.messages.length,
      messagesByPriority,
      oldestMessageAge,
      averageWaitTime,
      expiredMessages: this.expiredCount
    };
  }

  /**
   * Removes oldest low priority messages to make space
   */
  private removeOldestLowPriorityMessages(count: number): number {
    const lowPriorityMessages = this.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.priority === MessagePriority.LOW)
      .sort((a, b) => a.message.enqueuedAt.getTime() - b.message.enqueuedAt.getTime());

    const toRemove = Math.min(count, lowPriorityMessages.length);
    
    for (let i = 0; i < toRemove; i++) {
      const item = lowPriorityMessages[i];
      if (item) {
        const { index } = item;
        this.messages.splice(index - i, 1); // Adjust index for previous removals
      }
    }

    return toRemove;
  }

  /**
   * Creates a queued message with default values
   */
  static createMessage(
    chatId: string,
    text: string,
    options?: any,
    priority: MessagePriority = MessagePriority.NORMAL,
    maxRetries: number = 3,
    ttlMs?: number
  ): QueuedMessage {
    const now = new Date();
    const defaultTTL = 60 * 60 * 1000; // 1 hour
    
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      chatId,
      text,
      options,
      priority,
      enqueuedAt: now,
      retryCount: 0,
      maxRetries,
      expiresAt: new Date(now.getTime() + (ttlMs || defaultTTL))
    };
  }

  /**
   * Gets the default TTL for this queue
   */
  getDefaultTTL(): number {
    return this.defaultTTL;
  }

  /**
   * Determines message priority based on content and context
   */
  static determinePriority(text: string, chatType?: string): MessagePriority {
    // Critical messages (errors, alerts)
    if (text.includes('❌') || text.includes('🚨') || text.includes('CRITICAL') || text.includes('ERROR')) {
      return MessagePriority.CRITICAL;
    }

    // High priority (warnings, important notifications)
    if (text.includes('⚠️') || text.includes('WARNING') || text.includes('ALERT')) {
      return MessagePriority.HIGH;
    }

    // Normal priority for regular feed updates
    if (text.includes('📰') || text.includes('🔗') || chatType === 'channel') {
      return MessagePriority.NORMAL;
    }

    // Low priority for status messages, help text, etc.
    return MessagePriority.LOW;
  }
}