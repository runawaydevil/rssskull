import type { Bot } from 'grammy';
import { logger } from '../utils/logger/logger.service.js';
import type { RSSItem } from './rss.service.js';
import { TemplateService, type TemplateVariables } from './template.service.js';

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

  /**
   * Initialize the notification service with a bot instance
   */
  initialize(bot: Bot<any>): void {
    this.bot = bot;
    logger.info('Notification service initialized');
  }

  /**
   * Send a notification message to a chat
   */
  async sendMessage(message: NotificationMessage): Promise<SendResult> {
    if (!this.bot) {
      return {
        success: false,
        error: 'Bot not initialized',
      };
    }

    try {
      // Apply rate limiting
      await this.applyRateLimit();

      // Truncate message if too long
      const content = this.truncateMessage(message.content);

      logger.debug(`Sending message to chat ${message.chatId}: ${content.substring(0, 100)}...`);

      const result = await this.bot.api.sendMessage(message.chatId, content, {
        parse_mode: message.parseMode,
        link_preview_options: { is_disabled: message.disableWebPagePreview ?? true },
      });

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
    } else {
      return formattedItems;
    }
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
        parts.push(remaining.substring(0, this.maxMessageLength - 3) + '...');
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
            parts.push(remainingLine.substring(0, this.maxMessageLength - 3) + '...');
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

    return results;
  }

  /**
   * Format a single RSS item using a template
   */
  private formatSingleItem(item: RSSItem, feedName: string, template?: string | null): string {
    const variables: TemplateVariables = {
      title: item.title || 'Untitled',
      description: item.description || '',
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

    return content.substring(0, this.maxMessageLength - 3) + '...';
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
}

// Singleton instance
export const notificationService = new NotificationService();
