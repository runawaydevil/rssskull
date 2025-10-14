import { describe, expect, it, vi } from 'vitest';
import { ConverterService } from './converter.service.js';
import { RedditConverter } from './reddit.converter.js';

describe('URL Converter Integration', () => {
  describe('ConverterService with RedditConverter', () => {
    it('should successfully convert Reddit URLs end-to-end', async () => {
      const service = new ConverterService();

      // Mock the validation to avoid network calls
      const redditConverter = service.getConverter('reddit');
      if (redditConverter) {
        vi.spyOn(redditConverter, 'validate').mockResolvedValue(true);
      }

      const result = await service.convertUrl('https://reddit.com/r/programming');

      expect(result.success).toBe(true);
      expect(result.originalUrl).toBe('https://reddit.com/r/programming');
      expect(result.rssUrl).toBe('https://old.reddit.com/r/programming/.rss');
      expect(result.platform).toBe('reddit');
    });

    it('should handle user URLs correctly', async () => {
      const service = new ConverterService();

      // Mock the validation
      const redditConverter = service.getConverter('reddit');
      if (redditConverter) {
        vi.spyOn(redditConverter, 'validate').mockResolvedValue(true);
      }

      const result = await service.convertUrl('https://reddit.com/u/testuser');

      expect(result.success).toBe(true);
      expect(result.rssUrl).toBe('https://old.reddit.com/u/testuser/.rss');
      expect(result.platform).toBe('reddit');
    });

    it('should handle validation failures', async () => {
      const service = new ConverterService();

      // Mock validation to fail
      const redditConverter = service.getConverter('reddit');
      if (redditConverter) {
        vi.spyOn(redditConverter, 'validate').mockResolvedValue(false);
      }

      const result = await service.convertUrl('https://reddit.com/r/programming');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Converted RSS URL is not accessible or invalid');
      expect(result.platform).toBe('reddit');
    });

    it('should detect RSS URLs correctly', () => {
      const service = new ConverterService();

      expect(service.isRssUrl('https://example.com/feed.rss')).toBe(true);
      expect(service.isRssUrl('https://example.com/feed.xml')).toBe(true);
      expect(service.isRssUrl('https://example.com/rss')).toBe(true);
      expect(service.isRssUrl('https://example.com/feeds')).toBe(true);
      expect(service.isRssUrl('https://example.com?feed=rss')).toBe(true);
      expect(service.isRssUrl('https://example.com?format=rss')).toBe(true);

      expect(service.isRssUrl('https://reddit.com/r/programming')).toBe(false);
      expect(service.isRssUrl('https://example.com/page')).toBe(false);
    });

    it('should detect platforms correctly', () => {
      const service = new ConverterService();

      expect(service.detectPlatform('https://reddit.com/r/programming')).toBe('reddit');
      expect(service.detectPlatform('https://www.reddit.com/u/user')).toBe('reddit');
      expect(service.detectPlatform('https://old.reddit.com/r/javascript')).toBe('reddit');

      expect(service.detectPlatform('https://youtube.com/watch?v=123')).toBe('youtube');
      expect(service.detectPlatform('https://www.youtube.com/user/username')).toBe('youtube');
      expect(service.detectPlatform('https://example.com/page')).toBe(null);
    });

    it('should handle multiple converters', () => {
      const service = new ConverterService();

      // Verify Reddit converter is registered
      expect(service.getConverter('reddit')).toBeInstanceOf(RedditConverter);
      expect(service.getConverter('youtube')).toBeDefined();

      // Verify we can get all converters
      const allConverters = service.getAllConverters();
      expect(allConverters).toHaveLength(2); // Reddit + YouTube
      expect(allConverters[0]).toBeInstanceOf(RedditConverter);
    });
  });
});
