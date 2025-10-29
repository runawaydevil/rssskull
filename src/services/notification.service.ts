import type { Bot } from 'grammy';
import { logger } from '../utils/logger/logger.service.js';
import type { RSSItem } from './rss.service.js';
import { TemplateService, type TemplateVariables } from './template.service.js';
import { 
  TelegramErrorClassifier, 
  telegramCircuitBreaker, 
  MessagePriority, 
  InMemoryMessageQueue 
} from '../resilience/index.js';

export interface MessageTemplate {
  title?: string;
  description?: string;
  link?: string;
  author?: string;
  pubDate?: string;
}

export interface NotificationMessage {
  chatId: string;
  content: string;
  parseMode?: 'HTML' | 'Markdown';
  disableWebPagePreview?: boolean;
}

export interface SendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export class NotificationService {
  private bot: Bot<any> | null = null;
  private readonly maxMessageLength = 4096; // Telegram's message length limit
  private readonly rateLimitDelay = 100; // 100ms between messages to avoid rate limits (reduced for tests)
  private lastMessageTime = 0;
  
  // Resilience system integration
  private messageQueue: any = null;
  private resilienceEnabled: boolean = true;

  /**
   * Initialize the notification service with a bot instance
   */
  initialize(bot: Bot<any>): void {
    this.bot = bot;
    logger.info('Notification service initialized');
  }

  /**
   * Send a notification message to a chat with resilience support
   */
  async sendMessage(message: NotificationMessage): Promise<SendResult> {
    if (!this.bot) {
      return {
        success: false,
        error: 'Bot not initialized',
      };
    }

    // Check circuit breaker before attempting to send
    if (this.resilienceEnabled) {
      const canExecute = await telegramCircuitBreaker.canExecute('telegram_api');
      if (!canExecute) {
        logger.warn('Circuit breaker is open, queuing message', {
          chatId: message.chatId
        });
        
        await this.enqueueMessage(message, MessagePriority.NORMAL);
        return {
          success: false,
          error: 'Circuit breaker open - message queued for retry'
        };
      }
    }

    try {
      // Apply rate limiting
      await this.applyRateLimit();

      // Truncate message if too long
      const content = this.truncateMessage(message.content);

      logger.debug(`Sending message to chat ${message.chatId}: ${content.substring(0, 100)}...`);

      const startTime = Date.now();
      const result = await this.bot.api.sendMessage(message.chatId, content, {
        parse_mode: message.parseMode,
        link_preview_options: { is_disabled: message.disableWebPagePreview ?? true },
      });
      const responseTime = Date.now() - startTime;

      // Record successful operation in resilience system
      if (this.resilienceEnabled) {
        telegramCircuitBreaker.recordSuccess('telegram_api', responseTime);
      }

      // 🔥 LOG ESPECÍFICO PARA MENSAGENS ENVIADAS AO TELEGRAM
      logger.info(`📤 TELEGRAM MESSAGE SENT - Chat: ${message.chatId} | Message ID: ${result.message_id} | Content Preview: ${content.substring(0, 150)}...`);

      logger.debug(
        `Message sent successfully to chat ${message.chatId}, message ID: ${result.message_id}`
      );

      return {
        success: true,
        messageId: result.message_id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to send message to chat ${message.chatId}:`, errorMessage);

      // Handle error with resilience system
      if (this.resilienceEnabled) {
        await this.handleSendError(error, message);
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Format RSS items into a message using a template
   */
  formatMessage(items: RSSItem[], feedName: string, template?: string | null): string {
    if (items.length === 0) {
      return '';
    }

    // Format each item using the TemplateService
    const formattedItems = items
      .map((item) => this.formatSingleItem(item, feedName, template))
      .join('\n\n');

    // Add feed header if multiple items
    if (items.length > 1) {
      return `📰 *${this.escapeMarkdown(feedName)}* (${items.length} new items)\n\n${formattedItems}`;
    }
    return formattedItems;
  }

  /**
   * Validate a message template
   */
  validateTemplate(template: string): { valid: boolean; error?: string } {
    try {
      const validationErrors = TemplateService.validateTemplate(template);

      if (validationErrors.length > 0) {
        return {
          valid: false,
          error: validationErrors.map((err) => err.message).join(', '),
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Template validation failed',
      };
    }
  }

  /**
   * Split a long message into multiple parts if needed
   */
  splitMessage(content: string): string[] {
    if (content.length <= this.maxMessageLength) {
      return [content];
    }

    const parts: string[] = [];

    // If the content has no newlines and is too long, split by character count
    if (!content.includes('\n')) {
      let remaining = content;
      while (remaining.length > this.maxMessageLength) {
        parts.push(`${remaining.substring(0, this.maxMessageLength - 3)}...`);
        remaining = remaining.substring(this.maxMessageLength - 3);
      }
      if (remaining) {
        parts.push(remaining);
      }
      return parts;
    }

    // Split by lines for content with newlines
    let currentPart = '';
    const lines = content.split('\n');

    for (const line of lines) {
      // If adding this line would exceed the limit, start a new part
      if (currentPart.length + line.length + 1 > this.maxMessageLength) {
        if (currentPart) {
          parts.push(currentPart.trim());
          currentPart = '';
        }

        // If a single line is too long, split it
        if (line.length > this.maxMessageLength) {
          let remainingLine = line;
          while (remainingLine.length > this.maxMessageLength) {
            parts.push(`${remainingLine.substring(0, this.maxMessageLength - 3)}...`);
            remainingLine = remainingLine.substring(this.maxMessageLength - 3);
          }
          if (remainingLine) {
            currentPart = remainingLine;
          }
        } else {
          currentPart = line;
        }
      } else {
        currentPart += (currentPart ? '\n' : '') + line;
      }
    }

    if (currentPart) {
      parts.push(currentPart.trim());
    }

    return parts;
  }

  /**
   * Send multiple RSS items, splitting into multiple messages if needed
   */
  async sendRSSItems(
    chatId: string,
    items: RSSItem[],
    feedName: string,
    template?: string | null
  ): Promise<SendResult[]> {
    if (items.length === 0) {
      return [];
    }

    const results: SendResult[] = [];

    // Group items to fit within message limits
    const itemGroups = this.groupItemsForMessages(items, feedName, template);

    // 🔥 LOG ESPECÍFICO PARA MÚLTIPLAS MENSAGENS RSS
    logger.info(`📰 RSS BATCH SENDING - Chat: ${chatId} | Feed: ${feedName} | Total Items: ${items.length} | Message Groups: ${itemGroups.length}`);

    for (const group of itemGroups) {
      const content = this.formatMessage(group, feedName, template);
      const result = await this.sendMessage({
        chatId,
        content,
        parseMode: 'Markdown',
        disableWebPagePreview: true,
      });

      results.push(result);

      // If sending failed, log and continue with next group
      if (!result.success) {
        logger.warn(`Failed to send message group to chat ${chatId}: ${result.error}`);
      }
    }

    // 🔥 LOG ESPECÍFICO PARA RESULTADO DO BATCH
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    logger.info(`📊 RSS BATCH COMPLETED - Chat: ${chatId} | Feed: ${feedName} | Success: ${successCount} | Failed: ${failCount}`);

    return results;
  }

  /**
   * Format a single RSS item using a template
   */
  private formatSingleItem(item: RSSItem, feedName: string, template?: string | null): string {
    // Clean and limit description
    let description = item.description || '';
    if (description) {
      // Limit description to 200 characters and add ellipsis if truncated
      if (description.length > 200) {
        description = description.substring(0, 200).trim() + '...';
      }
    }

    const variables: TemplateVariables = {
      title: item.title || 'Untitled',
      description: description,
      link: item.link || '',
      author: item.author || '',
      pubDate: item.pubDate ? this.formatDate(item.pubDate) : '',
      feedName: feedName,
      categories: [], // RSS items don't have categories in current implementation
    };

    return TemplateService.renderTemplate(template ?? null, variables);
  }

  /**
   * Group RSS items to fit within message length limits
   */
  private groupItemsForMessages(
    items: RSSItem[],
    feedName: string,
    template?: string | null
  ): RSSItem[][] {
    const groups: RSSItem[][] = [];
    let currentGroup: RSSItem[] = [];

    for (const item of items) {
      // Test if adding this item would exceed the message limit
      const testGroup = [...currentGroup, item];
      const testMessage = this.formatMessage(testGroup, feedName, template ?? null);

      if (testMessage.length > this.maxMessageLength && currentGroup.length > 0) {
        // Start a new group
        groups.push(currentGroup);
        currentGroup = [item];
      } else {
        currentGroup.push(item);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Apply rate limiting to avoid Telegram API limits
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;

    if (timeSinceLastMessage < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - timeSinceLastMessage;
      logger.debug(`Rate limiting: waiting ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastMessageTime = Date.now();
  }

  /**
   * Truncate message if it exceeds Telegram's limit
   */
  private truncateMessage(content: string): string {
    if (content.length <= this.maxMessageLength) {
      return content;
    }

    return `${content.substring(0, this.maxMessageLength - 3)}...`;
  }

  /**
   * Escape markdown special characters
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/[*_`\[\]()~>#+=|{}.!-]/g, '\\$&');
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Sets the message queue for resilience support
   */
  setMessageQueue(messageQueue: any): void {
    this.messageQueue = messageQueue;
    logger.info('Message queue set for notification service');
  }

  /**
   * Enables or disables resilience features
   */
  setResilienceEnabled(enabled: boolean): void {
    this.resilienceEnabled = enabled;
    logger.info(`Resilience ${enabled ? 'enabled' : 'disabled'} for notification service`);
  }

  /**
   * Handles send errors with resilience system
   */
  private async handleSendError(error: any, message: NotificationMessage): Promise<void> {
    try {
      // Classify the error
      const telegramError = TelegramErrorClassifier.classifyError(
        error,
        'sendMessage',
        { chatId: message.chatId }
      );

      // Record failure in circuit breaker
      telegramCircuitBreaker.recordFailure('telegram_api');

      // Handle specific error types
      telegramCircuitBreaker.handleTelegramSpecificError(telegramError);

      // Determine if message should be queued for retry
      const shouldQueue = this.shouldQueueMessage(telegramError);
      
      if (shouldQueue) {
        const priority = this.determinePriority(message, telegramError);
        await this.enqueueMessage(message, priority);
        
        logger.info('Message queued for retry due to error', {
          chatId: message.chatId,
          errorType: telegramError.errorType,
          errorCode: telegramError.code,
          priority
        });
      }

    } catch (resilienceError) {
      logger.error('Error in resilience error handling', {
        originalError: error instanceof Error ? error.message : String(error),
        resilienceError: resilienceError instanceof Error ? resilienceError.message : String(resilienceError)
      });
    }
  }

  /**
   * Enqueues a message for retry
   */
  private async enqueueMessage(message: NotificationMessage, priority: MessagePriority): Promise<void> {
    if (!this.messageQueue) {
      logger.warn('Message queue not available, cannot enqueue message', {
        chatId: message.chatId
      });
      return;
    }

    try {
      const queuedMessage = InMemoryMessageQueue.createMessage(
        message.chatId,
        message.content,
        {
          parseMode: message.parseMode,
          disableWebPagePreview: message.disableWebPagePreview,
          originalSource: 'notification_service'
        },
        priority,
        3, // max retries
        60 * 60 * 1000 // 1 hour TTL
      );

      await this.messageQueue.enqueue(queuedMessage);

      logger.debug('Message enqueued successfully', {
        messageId: queuedMessage.id,
        chatId: message.chatId,
        priority
      });

    } catch (queueError) {
      logger.error('Failed to enqueue message', {
        chatId: message.chatId,
        error: queueError instanceof Error ? queueError.message : String(queueError)
      });
    }
  }

  /**
   * Determines if a message should be queued based on error type
   */
  private shouldQueueMessage(telegramError: any): boolean {
    // Queue messages for recoverable errors
    switch (telegramError.errorType) {
      case 'network_error':
      case 'server_error':
      case 'timeout':
      case 'connection_refused':
        return true;
      case 'rate_limited':
        return true; // Queue rate limited messages for later retry
      case 'client_error':
        return false; // Don't queue client errors (4xx)
      default:
        return false;
    }
  }

  /**
   * Determines message priority based on content and error type
   */
  private determinePriority(message: NotificationMessage, telegramError: any): MessagePriority {
    // High priority for network errors (need quick retry)
    if (telegramError.errorType === 'network_error') {
      return MessagePriority.HIGH;
    }

    // Normal priority for server errors
    if (telegramError.errorType === 'server_error') {
      return MessagePriority.NORMAL;
    }

    // Low priority for rate limited messages (can wait)
    if (telegramError.errorType === 'rate_limited') {
      return MessagePriority.LOW;
    }

    // Determine priority based on content
    const content = message.content.toLowerCase();
    
    // Critical for error messages
    if (content.includes('error') || content.includes('❌') || content.includes('failed')) {
      return MessagePriority.CRITICAL;
    }

    // High for warnings
    if (content.includes('warning') || content.includes('⚠️')) {
      return MessagePriority.HIGH;
    }

    // Normal for regular feed updates
    return MessagePriority.NORMAL;
  }

  /**
   * Gets resilience status for monitoring
   */
  getResilienceStatus(): any {
    return {
      resilienceEnabled: this.resilienceEnabled,
      hasMessageQueue: !!this.messageQueue,
      queueSize: this.messageQueue ? this.messageQueue.size() : 0
    };
  }
}

// Singleton instance
export const notificationService = new NotificationService();
