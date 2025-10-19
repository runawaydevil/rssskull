import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RSSService } from './rss.service.js';

// Create a mock parser instance that will be reused
const mockParseURL = vi.fn();
const mockParseString = vi.fn();
const mockParser = {
  parseURL: mockParseURL,
  parseString: mockParseString,
};

// Mock rss-parser to return our mock parser
vi.mock('rss-parser', () => {
  return {
    default: vi.fn().mockImplementation(() => mockParser),
  };
});

// Mock rate limiter service
vi.mock('../utils/rate-limiter.service.js', () => ({
  rateLimiterService: {
    waitIfNeeded: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock user agent service
vi.mock('../utils/user-agent.service.js', () => ({
  userAgentService: {
    getHeaders: vi.fn().mockReturnValue({
      'User-Agent': 'RSS-Skull-Bot/0.01 (+https://github.com/runawaydevil/rssskull)',
      'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    }),
  },
}));

// Mock circuit breaker service
vi.mock('../utils/circuit-breaker.service.js', () => ({
  circuitBreakerService: {
    canExecute: vi.fn().mockResolvedValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  },
}));

// Mock cache service
vi.mock('../utils/cache.service.js', () => ({
  cacheService: {
    get: vi.fn().mockReturnValue(null), // Always return cache miss for tests
    getEntry: vi.fn().mockReturnValue(null), // Always return cache miss for tests
    set: vi.fn(),
    setWithHeaders: vi.fn(),
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

// Mock global fetch
global.fetch = vi.fn();

describe('RSSService', () => {
  let rssService: RSSService;

  beforeEach(() => {
    vi.clearAllMocks();
    rssService = new RSSService();
  });

  describe('fetchFeed', () => {
    it('should successfully parse a valid RSS feed', async () => {
      const mockFeedData = {
        title: 'Test Feed',
        description: 'Test Description',
        link: 'https://example.com',
        items: [
          {
            title: 'Test Item 1',
            link: 'https://example.com/item1',
            guid: 'item1',
            pubDate: '2023-01-01T00:00:00Z',
            contentSnippet: 'Test content 1',
          },
          {
            title: 'Test Item 2',
            link: 'https://example.com/item2',
            guid: 'item2',
            pubDate: '2023-01-02T00:00:00Z',
            contentSnippet: 'Test content 2',
          },
        ],
      };

      // Mock fetch response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([
          ['content-type', 'application/rss+xml'],
          ['etag', 'test-etag'],
          ['last-modified', 'Wed, 11 Oct 2025 03:00:00 GMT'],
        ]),
        text: () => Promise.resolve('<?xml version="1.0"?><rss><channel><title>Test Feed</title></channel></rss>'),
      };
      
      // Mock headers.get method
      mockResponse.headers.get = vi.fn((key) => {
        const map = new Map([
          ['content-type', 'application/rss+xml'],
          ['etag', 'test-etag'],
          ['last-modified', 'Wed, 11 Oct 2025 03:00:00 GMT'],
        ]);
        return map.get(key) || null;
      });
      
      global.fetch = vi.fn().mockResolvedValue(mockResponse);
      mockParseString.mockResolvedValue(mockFeedData);

      const result = await rssService.fetchFeed('https://example.com/feed.xml');

      expect(result.success).toBe(true);
      expect(result.feed).toBeDefined();
      expect(result.feed!.title).toBe('Test Feed');
      expect(result.feed!.items).toHaveLength(2);
      expect(result.feed!.items[0].id).toBe('item1');
      expect(result.feed!.items[0].title).toBe('Test Item 1');
    });

    it('should handle parsing errors with retry logic', async () => {
      // Mock fetch to fail first, then succeed
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: () => Promise.resolve('<?xml version="1.0"?><rss><channel><title>Test Feed</title></channel></rss>'),
      };
      
      mockResponse.headers.get = vi.fn().mockReturnValue('application/rss+xml');
      
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(mockResponse);
        
      mockParseString.mockResolvedValue({
        title: 'Test Feed',
        items: [],
      });

      const result = await rssService.fetchFeed('https://example.com/feed.xml');

      expect(result.success).toBe(true);
    });

    it('should fail after max retries', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Persistent error'));

      const result = await rssService.fetchFeed('https://example.com/feed.xml');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Persistent error');
    }, 10000); // Increase timeout to 10 seconds

    it('should not retry on non-retryable errors', async () => {
      // Mock circuit breaker to be closed
      const { circuitBreakerService } = await import('../utils/circuit-breaker.service.js');
      vi.mocked(circuitBreakerService.canExecute).mockResolvedValue(false);
      
      const result = await rssService.fetchFeed('https://example.com/feed.xml');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Circuit breaker is open');
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('getNewItems', () => {
    beforeEach(async () => {
      // Reset circuit breaker to allow execution
      const { circuitBreakerService } = await import('../utils/circuit-breaker.service.js');
      vi.mocked(circuitBreakerService.canExecute).mockResolvedValue(true);
      const mockFeedData = {
        title: 'Test Feed',
        items: [
          {
            title: 'New Item',
            link: 'https://example.com/new',
            guid: 'new-item',
            pubDate: '2023-01-03T00:00:00Z',
          },
          {
            title: 'Old Item',
            link: 'https://example.com/old',
            guid: 'old-item',
            pubDate: '2023-01-01T00:00:00Z',
          },
        ],
      };

      // Mock fetch response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: () => Promise.resolve('<?xml version="1.0"?><rss><channel><title>Test Feed</title></channel></rss>'),
      };
      
      mockResponse.headers.get = vi.fn().mockReturnValue('application/rss+xml');
      
      global.fetch = vi.fn().mockResolvedValue(mockResponse);
      mockParseString.mockResolvedValue(mockFeedData);
    });

    it('should return only items from bot startup onwards when no lastItemId is provided', async () => {
      // Set bot startup time to a specific time
      process.env.BOT_STARTUP_TIME = '2023-01-02T10:00:00Z';
      
      // Create items with different dates
      const mockFeedDataWithDifferentDates = {
        title: 'Test Feed',
        items: [
          {
            title: 'After Startup Item',
            link: 'https://example.com/after',
            guid: 'after-startup-item',
            pubDate: '2023-01-02T12:00:00Z', // After startup
          },
          {
            title: 'Before Startup Item',
            link: 'https://example.com/before',
            guid: 'before-startup-item',
            pubDate: '2023-01-02T08:00:00Z', // Before startup
          },
        ],
      };
      
      mockParseString.mockResolvedValue(mockFeedDataWithDifferentDates);
      
      const result = await rssService.getNewItems('https://example.com/feed.xml');

      // Should only return items from startup onwards
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('after-startup-item');
    });

    it('should return empty array when all items are older than bot startup', async () => {
      // Set bot startup time to after all test items
      process.env.BOT_STARTUP_TIME = '2023-01-04T00:00:00Z';
      
      const result = await rssService.getNewItems('https://example.com/feed.xml');

      // Should return empty array when all items are older than startup
      expect(result.items).toHaveLength(0);
    });

    it('should return only new items when lastItemId is provided', async () => {
      const result = await rssService.getNewItems('https://example.com/feed.xml', 'old-item');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('new-item');
    });

    it('should return up to 5 most recent items when lastItemId is not found', async () => {
      const result = await rssService.getNewItems('https://example.com/feed.xml', 'non-existent');

      // With the new logic, when lastItemId is not found, return up to 5 most recent items
      expect(result.items).toHaveLength(2); // Only 2 items available in mock data
      expect(result.items[0].id).toBe('new-item');
      expect(result.items[1].id).toBe('old-item');
    });

    it('should return empty array when feed fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Feed error'));

      const result = await rssService.getNewItems('https://example.com/feed.xml');

      expect(result.items).toHaveLength(0);
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('validateFeedUrl', () => {
    beforeEach(async () => {
      // Reset circuit breaker to allow execution
      const { circuitBreakerService } = await import('../utils/circuit-breaker.service.js');
      vi.mocked(circuitBreakerService.canExecute).mockResolvedValue(true);
    });

    it('should return true for valid feed URL', async () => {
      // Mock fetch response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: () => Promise.resolve('<?xml version="1.0"?><rss><channel><title>Test Feed</title></channel></rss>'),
      };
      
      mockResponse.headers.get = vi.fn().mockReturnValue('application/rss+xml');
      
      global.fetch = vi.fn().mockResolvedValue(mockResponse);
      mockParseString.mockResolvedValue({ items: [] });

      const isValid = await rssService.validateFeedUrl('https://example.com/feed.xml');

      expect(isValid).toBe(true);
    });

    it('should return false for invalid feed URL', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Invalid feed'));

      const isValid = await rssService.validateFeedUrl('https://example.com/invalid');

      expect(isValid).toBe(false);
    });
  });
});
