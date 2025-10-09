import { describe, expect, it, vi } from 'vitest';
import type { URLConverter } from './converter.interface.js';
import { ConverterService } from './converter.service.js';

// Mock converter for testing
class MockConverter implements URLConverter {
  readonly platform = 'mock';

  canHandle(url: string): boolean {
    return url.includes('mock.com');
  }

  async convert(url: string): Promise<string> {
    return url.replace('mock.com', 'mock.com/rss');
  }

  async validate(rssUrl: string): Promise<boolean> {
    return rssUrl.includes('/rss');
  }
}

describe('ConverterService', () => {
  describe('registerConverter', () => {
    it('should register and retrieve converters', () => {
      const service = new ConverterService();
      const mockConverter = new MockConverter();

      service.registerConverter(mockConverter);
      expect(service.getConverter('mock')).toBe(mockConverter);
    });
  });

  describe('detectPlatform', () => {
    it('should detect Reddit platform', () => {
      const service = new ConverterService();
      expect(service.detectPlatform('https://reddit.com/r/programming')).toBe('reddit');
    });

    it('should return null for unknown platforms', () => {
      const service = new ConverterService();
      expect(service.detectPlatform('https://unknown.com/feed')).toBe(null);
    });
  });

  describe('isRssUrl', () => {
    it('should identify RSS URLs correctly', () => {
      const service = new ConverterService();

      expect(service.isRssUrl('https://example.com/feed.rss')).toBe(true);
      expect(service.isRssUrl('https://example.com/feed.xml')).toBe(true);
      expect(service.isRssUrl('https://example.com/rss')).toBe(true);
      expect(service.isRssUrl('https://example.com/feed')).toBe(true);
      expect(service.isRssUrl('https://example.com?feed=rss')).toBe(true);
      expect(service.isRssUrl('https://example.com?format=rss')).toBe(true);

      expect(service.isRssUrl('https://example.com/page')).toBe(false);
    });
  });

  describe('convertUrl', () => {
    it('should convert Reddit URLs successfully', async () => {
      const service = new ConverterService();

      // Mock the validation to avoid actual network calls
      const redditConverter = service.getConverter('reddit');
      if (redditConverter) {
        vi.spyOn(redditConverter, 'validate').mockResolvedValue(true);
      }

      const result = await service.convertUrl('https://reddit.com/r/programming');

      expect(result.success).toBe(true);
      expect(result.platform).toBe('reddit');
      expect(result.rssUrl).toBe('https://www.reddit.com/r/programming.rss');
    });

    it('should handle invalid URLs', async () => {
      const service = new ConverterService();

      const result = await service.convertUrl('invalid-url');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid URL format');
    });

    it('should handle unsupported URLs', async () => {
      const service = new ConverterService();

      const result = await service.convertUrl('https://unsupported.com/page');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No converter available for this URL type');
    });
  });
});
