import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParserService } from './parser.service.js';
import type { RSSItem } from './rss.service.js';

// Mock the RSS service
vi.mock('./rss.service.js', () => ({
  rssService: {
    getNewItems: vi.fn(),
    validateFeedUrl: vi.fn(),
    fetchFeed: vi.fn(),
  },
}));

// Mock logger service
vi.mock('../utils/logger/logger.service.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ParserService', () => {
  let parserService: ParserService;

  beforeEach(() => {
    parserService = new ParserService();
    vi.clearAllMocks();
  });

  describe('deduplicateItems', () => {
    it('should remove duplicate items based on ID', () => {
      const items: RSSItem[] = [
        {
          id: 'item1',
          title: 'Item 1',
          link: 'https://example.com/1',
        },
        {
          id: 'item2',
          title: 'Item 2',
          link: 'https://example.com/2',
        },
        {
          id: 'item1', // Duplicate
          title: 'Item 1 Duplicate',
          link: 'https://example.com/1-dup',
        },
      ];

      const deduplicated = parserService.deduplicateItems(items);

      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].id).toBe('item1');
      expect(deduplicated[1].id).toBe('item2');
      expect(deduplicated[0].title).toBe('Item 1'); // First occurrence kept
    });

    it('should return empty array for empty input', () => {
      const result = parserService.deduplicateItems([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('filterItemsByDate', () => {
    it('should filter items newer than the given date', () => {
      const sinceDate = new Date('2023-01-02T00:00:00Z');
      const items: RSSItem[] = [
        {
          id: 'item1',
          title: 'Old Item',
          link: 'https://example.com/1',
          pubDate: new Date('2023-01-01T00:00:00Z'),
        },
        {
          id: 'item2',
          title: 'New Item',
          link: 'https://example.com/2',
          pubDate: new Date('2023-01-03T00:00:00Z'),
        },
        {
          id: 'item3',
          title: 'No Date Item',
          link: 'https://example.com/3',
          // No pubDate
        },
      ];

      const filtered = parserService.filterItemsByDate(items, sinceDate);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('item2');
      expect(filtered[1].id).toBe('item3'); // Items without date are included
    });
  });

  describe('sortItemsByDate', () => {
    it('should sort items by publication date (newest first)', () => {
      const items: RSSItem[] = [
        {
          id: 'item1',
          title: 'Old Item',
          link: 'https://example.com/1',
          pubDate: new Date('2023-01-01T00:00:00Z'),
        },
        {
          id: 'item2',
          title: 'New Item',
          link: 'https://example.com/2',
          pubDate: new Date('2023-01-03T00:00:00Z'),
        },
        {
          id: 'item3',
          title: 'Middle Item',
          link: 'https://example.com/3',
          pubDate: new Date('2023-01-02T00:00:00Z'),
        },
      ];

      const sorted = parserService.sortItemsByDate(items);

      expect(sorted).toHaveLength(3);
      expect(sorted[0].id).toBe('item2'); // Newest
      expect(sorted[1].id).toBe('item3'); // Middle
      expect(sorted[2].id).toBe('item1'); // Oldest
    });

    it('should handle items without dates', () => {
      const items: RSSItem[] = [
        {
          id: 'item1',
          title: 'With Date',
          link: 'https://example.com/1',
          pubDate: new Date('2023-01-01T00:00:00Z'),
        },
        {
          id: 'item2',
          title: 'No Date',
          link: 'https://example.com/2',
        },
      ];

      const sorted = parserService.sortItemsByDate(items);

      expect(sorted).toHaveLength(2);
      expect(sorted[0].id).toBe('item1'); // With date comes first
      expect(sorted[1].id).toBe('item2'); // Without date comes last
    });
  });

  describe('processItems', () => {
    it('should deduplicate and sort items', () => {
      const items: RSSItem[] = [
        {
          id: 'item1',
          title: 'Old Item',
          link: 'https://example.com/1',
          pubDate: new Date('2023-01-01T00:00:00Z'),
        },
        {
          id: 'item2',
          title: 'New Item',
          link: 'https://example.com/2',
          pubDate: new Date('2023-01-03T00:00:00Z'),
        },
        {
          id: 'item1', // Duplicate
          title: 'Old Item Duplicate',
          link: 'https://example.com/1-dup',
          pubDate: new Date('2023-01-01T00:00:00Z'),
        },
      ];

      const processed = parserService.processItems(items);

      expect(processed).toHaveLength(2);
      expect(processed[0].id).toBe('item2'); // Newest first
      expect(processed[1].id).toBe('item1'); // Oldest second, no duplicate
    });
  });
});
