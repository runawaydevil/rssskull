import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notification.service.js';
import type { RSSItem } from './rss.service.js';

// Mock logger service
vi.mock('../utils/logger/logger.service.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockBot: any;

  beforeEach(() => {
    notificationService = new NotificationService();

    // Mock bot instance
    mockBot = {
      api: {
        sendMessage: vi.fn(),
      },
    };

    notificationService.initialize(mockBot);
  });

  describe('formatMessage', () => {
    it('should format a single RSS item with default template', () => {
      const items: RSSItem[] = [
        {
          id: 'item1',
          title: 'Test Article',
          link: 'https://example.com/article',
          description: 'This is a test article description.',
          author: 'Test Author',
          pubDate: new Date('2023-01-01T12:00:00Z'),
        },
      ];

      const result = notificationService.formatMessage(items, 'Test Feed');

      expect(result).toContain('📰 *Test Feed*');
      expect(result).toContain('🔗 *Test Article*');
      expect(result).toContain('This is a test article description.');
      expect(result).toContain('[Read more](https://example.com/article)');
    });

    it('should format multiple RSS items', () => {
      const items: RSSItem[] = [
        {
          id: 'item1',
          title: 'First Article',
          link: 'https://example.com/1',
          description: 'First description',
        },
        {
          id: 'item2',
          title: 'Second Article',
          link: 'https://example.com/2',
          description: 'Second description',
        },
      ];

      const result = notificationService.formatMessage(items, 'Test Feed');

      expect(result).toContain('📰 *Test Feed* (2 new items)');
      expect(result).toContain('First Article');
      expect(result).toContain('Second Article');
    });

    it('should use custom template when provided', () => {
      const items: RSSItem[] = [
        {
          id: 'item1',
          title: 'Test Article',
          link: 'https://example.com/article',
          author: 'Test Author',
        },
      ];

      const customTemplate = 'Title: {title}\nAuthor: {author}\nLink: {link}';
      const result = notificationService.formatMessage(items, 'Test Feed', customTemplate);

      expect(result).toContain('Title: Test Article');
      expect(result).toContain('Author: Test Author');
      expect(result).toContain('Link: https://example.com/article');
    });

    it('should return empty string for empty items array', () => {
      const result = notificationService.formatMessage([], 'Test Feed');
      expect(result).toBe('');
    });
  });

  describe('validateTemplate', () => {
    it('should validate a correct template', () => {
      const template = '{title}\n{description}\n{link}';
      const result = notificationService.validateTemplate(template);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject template with invalid variables', () => {
      const template = '{title}\n{invalid_variable}\n{link}';
      const result = notificationService.validateTemplate(template);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid template variable: {invalid_variable}');
    });

    it('should accept template with all valid variables', () => {
      const template = '{title}\n{description}\n{link}\n{author}\n{pubDate}';
      const result = notificationService.validateTemplate(template);

      expect(result.valid).toBe(true);
    });
  });

  describe('splitMessage', () => {
    it('should not split short messages', () => {
      const shortMessage = 'This is a short message';
      const result = notificationService.splitMessage(shortMessage);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(shortMessage);
    });

    it('should split long messages', () => {
      // Create a message longer than 4096 characters
      const longMessage = 'A'.repeat(5000);
      const result = notificationService.splitMessage(longMessage);

      expect(result.length).toBeGreaterThan(1);
      expect(result[0].length).toBeLessThanOrEqual(4096);
    });

    it('should split on line boundaries when possible', () => {
      const lines = Array(200).fill('This is a line of text that is reasonably long').join('\n');
      const result = notificationService.splitMessage(lines);

      expect(result.length).toBeGreaterThan(1);
      // Each part should end with a complete line (no partial lines)
      for (const part of result) {
        expect(part.length).toBeLessThanOrEqual(4096);
      }
    });
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      mockBot.api.sendMessage.mockResolvedValue({ message_id: 123 });

      const result = await notificationService.sendMessage({
        chatId: '12345',
        content: 'Test message',
        parseMode: 'Markdown',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe(123);
      expect(mockBot.api.sendMessage).toHaveBeenCalledWith('12345', 'Test message', {
        parse_mode: 'Markdown',
        link_preview_options: {
          is_disabled: true,
        },
      });
    });

    it('should handle send errors', async () => {
      mockBot.api.sendMessage.mockRejectedValue(new Error('API Error'));

      const result = await notificationService.sendMessage({
        chatId: '12345',
        content: 'Test message',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });

    it('should fail when bot is not initialized', async () => {
      const uninitializedService = new NotificationService();

      const result = await uninitializedService.sendMessage({
        chatId: '12345',
        content: 'Test message',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bot not initialized');
    });
  });

  describe('sendRSSItems', () => {
    it('should send RSS items successfully', async () => {
      mockBot.api.sendMessage.mockResolvedValue({ message_id: 123 });

      const items: RSSItem[] = [
        {
          id: 'item1',
          title: 'Test Article',
          link: 'https://example.com/article',
          description: 'Test description',
        },
      ];

      const results = await notificationService.sendRSSItems('12345', items, 'Test Feed');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should return empty array for empty items', async () => {
      const results = await notificationService.sendRSSItems('12345', [], 'Test Feed');

      expect(results).toHaveLength(0);
      expect(mockBot.api.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle multiple message groups', async () => {
      mockBot.api.sendMessage.mockResolvedValue({ message_id: 123 });

      // Create many items that would exceed message length limit
      const items: RSSItem[] = Array(50)
        .fill(null)
        .map((_, i) => ({
          id: `item${i}`,
          title: `Very Long Article Title That Takes Up Space ${i}`.repeat(10),
          link: `https://example.com/article${i}`,
          description: 'Very long description that takes up a lot of space in the message'.repeat(
            20
          ),
        }));

      const results = await notificationService.sendRSSItems('12345', items, 'Test Feed');

      expect(results.length).toBeGreaterThan(1); // Should be split into multiple messages
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(results.length);
    });
  });
});
