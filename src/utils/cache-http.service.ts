import { logger } from './logger/logger.service.js';
import type { RSSFeed } from '../services/rss.service.js';

export interface CacheHTTPEntry {
  url: string;
  feed: RSSFeed;
  etag?: string;
  lastModified?: string;
  timestamp: number;
}

export interface ConditionalHeaders {
  'If-None-Match'?: string;
  'If-Modified-Since'?: string;
}

export class CacheHTTPService {
  private cache: Map<string, CacheHTTPEntry> = new Map();
  private readonly maxEntries = 1000;

  /**
   * Get cached response with conditional headers
   */
  getCachedResponse(url: string): CacheHTTPEntry | null {
    const entry = this.cache.get(url);
    
    if (!entry) {
      logger.debug(`Cache HTTP miss for ${this.extractDomain(url)}`);
      return null;
    }

    logger.debug(`Cache HTTP hit for ${this.extractDomain(url)}`, {
      etag: entry.etag,
      lastModified: entry.lastModified,
    });

    return entry;
  }

  /**
   * Set cached response with headers
   */
  setCachedResponse(url: string, feed: RSSFeed, headers?: { etag?: string; lastModified?: string }): void {
    const entry: CacheHTTPEntry = {
      url,
      feed,
      etag: headers?.etag,
      lastModified: headers?.lastModified,
      timestamp: Date.now(),
    };

    this.cache.set(url, entry);

    // Cleanup if cache is too large
    if (this.cache.size > this.maxEntries) {
      this.cleanup();
    }

    logger.debug(`Cache HTTP set for ${this.extractDomain(url)}`, {
      etag: headers?.etag,
      lastModified: headers?.lastModified,
      itemCount: feed.items.length,
    });
  }

  /**
   * Build conditional headers for a request
   */
  buildConditionalHeaders(url: string): ConditionalHeaders {
    const entry = this.getCachedResponse(url);
    
    if (!entry) {
      return {};
    }

    const headers: ConditionalHeaders = {};
    
    if (entry.etag) {
      headers['If-None-Match'] = entry.etag;
    }
    
    if (entry.lastModified) {
      headers['If-Modified-Since'] = entry.lastModified;
    }

    return headers;
  }

  /**
   * Handle 304 Not Modified response
   */
  handle304(url: string): RSSFeed | null {
    const entry = this.getCachedResponse(url);
    
    if (!entry) {
      logger.warn(`Received 304 but no cached entry for ${url}`);
      return null;
    }

    logger.info(`✅ Received 304 Not Modified for ${this.extractDomain(url)} - using cached feed`);
    return entry.feed;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    // Remove oldest entries if cache is too large
    const entries = Array.from(this.cache.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 100 entries
    const toRemove = Math.min(100, entries.length);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i]![0]);
    }

    logger.debug(`Cache HTTP cleanup: removed ${toRemove} entries`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    entriesWithEtag: number;
    entriesWithLastModified: number;
    entriesWithBoth: number;
  } {
    const entries = Array.from(this.cache.values());
    
    return {
      totalEntries: entries.length,
      entriesWithEtag: entries.filter(e => !!e.etag).length,
      entriesWithLastModified: entries.filter(e => !!e.lastModified).length,
      entriesWithBoth: entries.filter(e => !!e.etag && !!e.lastModified).length,
    };
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cache HTTP cleared: removed ${size} entries`);
  }
}

// Singleton instance
export const cacheHTTPService = new CacheHTTPService();

