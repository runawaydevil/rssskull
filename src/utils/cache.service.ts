import { logger } from './logger/logger.service.js';
import type { RSSFeed } from '../services/rss.service.js';

export interface CacheEntry {
  url: string;
  feed: RSSFeed;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  hitCount: number;
  lastAccess: number;
  etag?: string;
  lastModified?: string;
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry: number;
  newestEntry: number;
}

export class CacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
  };

  // TTL base por tipo de domínio (em milliseconds)
  private domainTTL: Record<string, number> = {
    // Alta frequência - cache curto
    'reddit.com': 10 * 60 * 1000, // 10 minutos
    'hackernews': 5 * 60 * 1000,  // 5 minutos
    'techcrunch.com': 5 * 60 * 1000, // 5 minutos
    
    // Frequência moderada
    'youtube.com': 15 * 60 * 1000, // 15 minutos
    'medium.com': 15 * 60 * 1000,  // 15 minutos
    'dev.to': 15 * 60 * 1000,      // 15 minutos
    
    // Baixa frequência - cache longo
    'github.com': 60 * 60 * 1000,  // 60 minutos (releases)
    'blog': 30 * 60 * 1000,        // 30 minutos (blogs pessoais)
    
    // Padrão
    'default': 20 * 60 * 1000,     // 20 minutos
  };

  /**
   * Calcula TTL com variação aleatória para evitar padrões
   */
  private calculateTTL(url: string): number {
    const domain = this.extractDomain(url);
    const baseTTL = this.domainTTL[domain] || this.domainTTL.default || 20 * 60 * 1000;
    
    // Adicionar variação aleatória (±25% de variação)
    const variation = Math.random() * 0.5 * baseTTL - 0.25 * baseTTL;
    const randomTTL = Math.max(baseTTL * 0.5, baseTTL + variation); // Mínimo 50% do TTL base
    
    logger.debug(`Calculated TTL for ${domain}: ${randomTTL}ms (base: ${baseTTL}ms, variation: ${variation.toFixed(0)}ms)`);
    return randomTTL;
  }

  /**
   * Get cached feed if available and not expired
   */
  get(url: string): RSSFeed | null {
    const entry = this.cache.get(url);
    
    if (!entry) {
      this.stats.misses++;
      logger.debug(`Cache MISS: ${this.extractDomain(url)}`, { url });
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(url);
      this.stats.misses++;
      logger.debug(`Cache EXPIRED: ${this.extractDomain(url)}`, { 
        url, 
        age: now - entry.timestamp,
        ttl: entry.ttl 
      });
      return null;
    }

    // Update access stats
    entry.hitCount++;
    entry.lastAccess = now;
    this.stats.hits++;

    logger.debug(`Cache HIT: ${this.extractDomain(url)}`, { 
      url, 
      age: now - entry.timestamp,
      hitCount: entry.hitCount 
    });

    return entry.feed;
  }

  /**
   * Store feed in cache with appropriate TTL
   */
  set(url: string, feed: RSSFeed): void {
    this.setWithHeaders(url, feed);
  }

  /**
   * Store feed in cache with conditional headers
   */
  setWithHeaders(url: string, feed: RSSFeed, headers?: { etag?: string; lastModified?: string }): void {
    const now = Date.now();
    const ttl = this.getTTLForUrl(url);
    
    const entry: CacheEntry = {
      url,
      feed,
      timestamp: now,
      ttl,
      hitCount: 0,
      lastAccess: now,
      etag: headers?.etag,
      lastModified: headers?.lastModified,
    };

    this.cache.set(url, entry);

    logger.debug(`Cache SET: ${this.extractDomain(url)}`, { 
      url, 
      ttl: ttl / 1000 / 60, // TTL in minutes
      itemCount: feed.items.length,
      etag: headers?.etag,
      lastModified: headers?.lastModified
    });

    // Cleanup old entries periodically
    if (this.cache.size % 50 === 0) {
      this.cleanup();
    }
  }

  /**
   * Get cache entry with conditional headers
   */
  getEntry(url: string): CacheEntry | null {
    const entry = this.cache.get(url);
    
    if (!entry) {
      this.stats.misses++;
      logger.debug(`Cache MISS: ${this.extractDomain(url)}`, { url });
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(url);
      this.stats.misses++;
      logger.debug(`Cache EXPIRED: ${this.extractDomain(url)}`, { 
        url, 
        age: now - entry.timestamp,
        ttl: entry.ttl 
      });
      return null;
    }

    // Update access stats
    entry.hitCount++;
    entry.lastAccess = now;
    this.stats.hits++;

    logger.debug(`Cache HIT: ${this.extractDomain(url)}`, { 
      url, 
      age: now - entry.timestamp,
      hitCount: entry.hitCount,
      etag: entry.etag,
      lastModified: entry.lastModified
    });

    return entry;
  }

  /**
   * Check if URL is cached and not expired
   */
  has(url: string): boolean {
    const entry = this.cache.get(url);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(url);
      return false;
    }

    return true;
  }

  /**
   * Get TTL for a specific URL based on domain and feed characteristics
   */
  private getTTLForUrl(url: string): number {
    return this.calculateTTL(url); // Usar TTL aleatório
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
   * Cleanup expired entries and manage memory
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;
    const maxEntries = 1000; // Limite máximo de entradas

    // Remove expired entries
    for (const [url, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(url);
        removedCount++;
      }
    }

    // If still too many entries, remove least recently used
    if (this.cache.size > maxEntries) {
      const entries = Array.from(this.cache.entries());
      
      // Sort by last access (oldest first)
      entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
      
      // Remove oldest entries
      const toRemove = this.cache.size - maxEntries;
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.cache.delete(entries[i]![0]);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info(`Cache cleanup: removed ${removedCount} entries, ${this.cache.size} remaining`);
    }
  }

  /**
   * Get all cache entries (for debugging/testing)
   */
  getAllEntries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    const entries = Array.from(this.cache.values());
    
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    // Calculate memory usage (rough estimate)
    const memoryUsage = entries.reduce((total, entry) => {
      return total + JSON.stringify(entry.feed).length;
    }, 0);

    const timestamps = entries.map(e => e.timestamp);
    const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : now;
    const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : now;

    return {
      totalEntries: this.cache.size,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage,
      oldestEntry: now - oldestEntry,
      newestEntry: now - newestEntry,
    };
  }

  /**
   * Get detailed cache info for debugging
   */
  getDetailedInfo(): any {
    const entries = Array.from(this.cache.entries()).map(([url, entry]) => ({
      url: this.extractDomain(url),
      age: Date.now() - entry.timestamp,
      ttl: entry.ttl,
      hitCount: entry.hitCount,
      itemCount: entry.feed.items.length,
      expired: Date.now() - entry.timestamp > entry.ttl,
    }));

    return {
      stats: this.getStats(),
      entries: entries.slice(0, 20), // Primeiras 20 entradas
      domainTTL: Object.entries(this.domainTTL).map(([domain, ttl]) => ({
        domain,
        ttlMinutes: ttl / 1000 / 60,
      })),
    };
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    logger.info(`Cache cleared: removed ${size} entries`);
  }

  /**
   * Remove specific URL from cache
   */
  delete(url: string): boolean {
    const deleted = this.cache.delete(url);
    if (deleted) {
      logger.debug(`Cache DELETE: ${this.extractDomain(url)}`, { url });
    }
    return deleted;
  }

  /**
   * Get cache entry info for specific URL
   */
  getEntryInfo(url: string): any {
    const entry = this.cache.get(url);
    if (!entry) return null;

    const now = Date.now();
    return {
      url: this.extractDomain(url),
      age: now - entry.timestamp,
      ttl: entry.ttl,
      hitCount: entry.hitCount,
      itemCount: entry.feed.items.length,
      expired: now - entry.timestamp > entry.ttl,
      remainingTTL: Math.max(0, entry.ttl - (now - entry.timestamp)),
    };
  }

  /**
   * Preload cache with multiple URLs (for batch operations)
   */
  async preload(urls: string[], fetchFunction: (url: string) => Promise<RSSFeed | null>): Promise<void> {
    const uncachedUrls = urls.filter(url => !this.has(url));
    
    if (uncachedUrls.length === 0) {
      logger.debug('All URLs already cached');
      return;
    }

    logger.info(`Preloading cache for ${uncachedUrls.length} URLs`);

    // Process in batches to avoid overwhelming
    const batchSize = 5;
    for (let i = 0; i < uncachedUrls.length; i += batchSize) {
      const batch = uncachedUrls.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (url) => {
          try {
            const feed = await fetchFunction(url);
            if (feed) {
              this.set(url, feed);
            }
          } catch (error) {
            logger.warn(`Failed to preload cache for ${url}:`, error);
          }
        })
      );

      // Small delay between batches
      if (i + batchSize < uncachedUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(`Cache preload completed: ${this.cache.size} total entries`);
  }
}

// Singleton instance
export const cacheService = new CacheService();