/**
 * Unit tests for Cache HTTP Service
 * Tests ETag/Last-Modified handling and 304 responses
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { cacheHTTPService } from '../src/utils/cache-http.service.js';
import type { RSSFeed } from '../src/services/rss.service.js';

describe('CacheHTTPService', () => {
  beforeEach(() => {
    cacheHTTPService.clear();
  });

  describe('setCachedResponse and getCachedResponse', () => {
    it('should store and retrieve cached response with headers', () => {
      const mockFeed: RSSFeed = {
        title: 'Test Feed',
        items: [],
      };

      cacheHTTPService.setCachedResponse(
        'https://example.com/rss',
        mockFeed,
        { etag: 'W/"abc123"', lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT' }
      );

      const cached = cacheHTTPService.getCachedResponse('https://example.com/rss');
      
      expect(cached).not.toBeNull();
      expect(cached?.feed.title).toBe('Test Feed');
      expect(cached?.etag).toBe('W/"abc123"');
      expect(cached?.lastModified).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
    });

    it('should return null for non-existent cache entry', () => {
      const cached = cacheHTTPService.getCachedResponse('https://nonexistent.com/rss');
      expect(cached).toBeNull();
    });
  });

  describe('buildConditionalHeaders', () => {
    it('should build conditional headers from cached entry', () => {
      const mockFeed: RSSFeed = { title: 'Test', items: [] };
      
      cacheHTTPService.setCachedResponse(
        'https://example.com/rss',
        mockFeed,
        { etag: 'W/"abc123"', lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT' }
      );

      const headers = cacheHTTPService.buildConditionalHeaders('https://example.com/rss');
      
      expect(headers['If-None-Match']).toBe('W/"abc123"');
      expect(headers['If-Modified-Since']).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
    });

    it('should return empty headers for non-existent cache', () => {
      const headers = cacheHTTPService.buildConditionalHeaders('https://nonexistent.com/rss');
      expect(headers).toEqual({});
    });
  });

  describe('handle304', () => {
    it('should return cached feed on 304', () => {
      const mockFeed: RSSFeed = { title: 'Test Feed', items: [] };
      
      cacheHTTPService.setCachedResponse('https://example.com/rss', mockFeed);
      
      const result = cacheHTTPService.handle304('https://example.com/rss');
      
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test Feed');
    });

    it('should return null if no cached entry exists', () => {
      const result = cacheHTTPService.handle304('https://nonexistent.com/rss');
      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const mockFeed: RSSFeed = { title: 'Test', items: [] };
      
      cacheHTTPService.setCachedResponse('https://example.com/rss', mockFeed, { etag: 'W/"123"' });
      cacheHTTPService.setCachedResponse('https://example2.com/rss', mockFeed, { lastModified: 'Mon, 01 Jan 2024' });
      cacheHTTPService.setCachedResponse('https://example3.com/rss', mockFeed, { etag: 'W/"456"', lastModified: 'Mon, 01 Jan 2024' });

      const stats = cacheHTTPService.getStats();
      
      expect(stats.totalEntries).toBe(3);
      expect(stats.entriesWithEtag).toBe(2);
      expect(stats.entriesWithLastModified).toBe(2);
      expect(stats.entriesWithBoth).toBe(1);
    });
  });
});

