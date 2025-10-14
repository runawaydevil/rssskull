import { logger } from './logger/logger.service.js';
import { FeedType } from './feed-type-detector.js';
import { UrlNormalizer } from './url-normalizer.js';

export interface DiscoveredFeed {
  url: string;
  type: FeedType;
  title?: string;
  description?: string;
  confidence: number;
  source: 'html-link' | 'url-pattern' | 'well-known' | 'wordpress' | 'blogger';
}

export interface FeedDiscoveryResult {
  success: boolean;
  feeds: DiscoveredFeed[];
  errors: string[];
  baseUrl: string;
}

export class FeedDiscovery {
  private static readonly COMMON_FEED_PATHS = [
    // Generic paths (prefer Atom)
    '/feed',
    '/feed/',
    '/atom.xml',
    '/atom',
    '/rss.xml',
    '/rss',
    '/feeds',
    '/feeds/',
    
    // WordPress paths
    '/?feed=atom',
    '/?feed=rss2',
    '/comments/feed/',
    
    // Blogger paths
    '/feeds/posts/default',
    '/feeds/posts/default?alt=rss',
    '/feeds/posts/default?alt=atom',
    '/feeds/posts/summary',
    '/feeds/posts/full',
    
    // Well-known paths
    '/feed.xml',
    '/rss.xml',
    '/index.xml',
    '/syndication.xml',
    
    // Alternative paths
    '/feed/index.xml',
    '/feed/index.rss',
    '/feed/index.atom',
    '/feeds/all.xml',
    '/feeds/all.rss',
    '/feeds/all.atom',
  ];

  /**
   * Discover available feeds from a website URL
   */
  static async discoverFeeds(baseUrl: string): Promise<FeedDiscoveryResult> {
    const result: FeedDiscoveryResult = {
      success: false,
      feeds: [],
      errors: [],
      baseUrl,
    };

    try {
      logger.info(`Starting feed discovery for: ${baseUrl}`);

      // Normalize base URL
      const normalizedUrl = UrlNormalizer.normalizeUrl(baseUrl);
      result.baseUrl = normalizedUrl;

      // Strategy 1: Check HTML for <link> tags
      const htmlFeeds = await this.discoverFromHtml(normalizedUrl);
      result.feeds.push(...htmlFeeds);

      // Strategy 2: Try common feed paths
      const pathFeeds = await this.discoverFromCommonPaths(normalizedUrl);
      result.feeds.push(...pathFeeds);

      // Strategy 3: WordPress-specific discovery
      if (this.isLikelyWordPress(normalizedUrl)) {
        const wpFeeds = await this.discoverWordPressFeeds(normalizedUrl);
        result.feeds.push(...wpFeeds);
      }

      // Strategy 4: Blogger-specific discovery
      if (this.isLikelyBlogger(normalizedUrl)) {
        const bloggerFeeds = await this.discoverBloggerFeeds(normalizedUrl);
        result.feeds.push(...bloggerFeeds);
      }

      // Remove duplicates and sort by confidence
      result.feeds = this.deduplicateAndSortFeeds(result.feeds);

      result.success = result.feeds.length > 0;

      logger.info(`Feed discovery completed: found ${result.feeds.length} feeds for ${normalizedUrl}`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Discovery failed: ${errorMessage}`);
      logger.error(`Feed discovery failed for ${baseUrl}:`, error);
      return result;
    }
  }

  /**
   * Discover feeds from HTML <link> tags
   */
  private static async discoverFromHtml(baseUrl: string): Promise<DiscoveredFeed[]> {
    const feeds: DiscoveredFeed[] = [];

    try {
      logger.debug(`Checking HTML for feed links: ${baseUrl}`);

      const response = await fetch(baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSSSkullBot/1.0; +https://portalidea.com.br)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Look for <link> tags with rel="alternate"
      const linkRegex = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
      const matches = html.match(linkRegex) || [];

      for (const match of matches) {
        const hrefMatch = match.match(/href=["']([^"']+)["']/i);
        const typeMatch = match.match(/type=["']([^"']+)["']/i);
        const titleMatch = match.match(/title=["']([^"']+)["']/i);

        if (hrefMatch && hrefMatch[1]) {
          const feedUrl = this.resolveUrl(hrefMatch[1]!, baseUrl);
          const mimeType = typeMatch?.[1] || '';
          const title = titleMatch?.[1];

          // Detect feed type from MIME type
          const feedType = this.detectTypeFromMimeType(mimeType);

          if (feedType !== FeedType.UNKNOWN) {
            feeds.push({
              url: feedUrl,
              type: feedType,
              title,
              confidence: 0.9, // High confidence from HTML link
              source: 'html-link',
            });

            logger.debug(`Found feed in HTML: ${feedUrl} (${feedType})`);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to check HTML for feeds: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return feeds;
  }

  /**
   * Discover feeds by trying common paths
   */
  private static async discoverFromCommonPaths(baseUrl: string): Promise<DiscoveredFeed[]> {
    const feeds: DiscoveredFeed[] = [];

    logger.debug(`Trying common feed paths for: ${baseUrl}`);

    // Try paths in parallel with limited concurrency
    const batchSize = 5;
    for (let i = 0; i < this.COMMON_FEED_PATHS.length; i += batchSize) {
      const batch = this.COMMON_FEED_PATHS.slice(i, i + batchSize);
      const batchPromises = batch.map(path => this.tryFeedPath(baseUrl, path));
      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          feeds.push(result.value);
        }
      }
    }

    return feeds;
  }

  /**
   * Try a specific feed path
   */
  private static async tryFeedPath(baseUrl: string, path: string): Promise<DiscoveredFeed | null> {
    try {
      const feedUrl = this.resolveUrl(path, baseUrl);
      
      const response = await fetch(feedUrl, {
        method: 'HEAD', // Use HEAD to check if feed exists
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSSSkullBot/1.0; +https://portalidea.com.br)',
          'Accept': 'application/atom+xml, application/rss+xml, application/json, text/xml;q=0.9, */*;q=0.8',
        },
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const feedType = this.detectTypeFromMimeType(contentType);
        
        if (feedType !== FeedType.UNKNOWN) {
          const confidence = this.calculatePathConfidence(path, feedType);
          
          logger.debug(`Found feed at path: ${feedUrl} (${feedType}, confidence: ${confidence})`);
          
          return {
            url: feedUrl,
            type: feedType,
            confidence,
            source: 'url-pattern',
          };
        }
      }
    } catch (error) {
      // Silently ignore failed attempts
    }

    return null;
  }

  /**
   * Discover WordPress-specific feeds
   */
  private static async discoverWordPressFeeds(baseUrl: string): Promise<DiscoveredFeed[]> {
    const feeds: DiscoveredFeed[] = [];

    logger.debug(`Trying WordPress-specific feeds for: ${baseUrl}`);

    const wpPaths = [
      '/?feed=atom',
      '/?feed=rss2',
      '/comments/feed/',
      '/feed/',
    ];

    for (const path of wpPaths) {
      const feed = await this.tryFeedPath(baseUrl, path);
      if (feed) {
        feed.source = 'wordpress';
        feed.confidence += 0.1; // Boost confidence for WordPress paths
        feeds.push(feed);
      }
    }

    return feeds;
  }

  /**
   * Discover Blogger-specific feeds
   */
  private static async discoverBloggerFeeds(baseUrl: string): Promise<DiscoveredFeed[]> {
    const feeds: DiscoveredFeed[] = [];

    logger.debug(`Trying Blogger-specific feeds for: ${baseUrl}`);

    const bloggerPaths = [
      '/feeds/posts/default',
      '/feeds/posts/default?alt=rss',
      '/feeds/posts/default?alt=atom',
      '/feeds/posts/summary',
      '/feeds/posts/full',
    ];

    for (const path of bloggerPaths) {
      const feed = await this.tryFeedPath(baseUrl, path);
      if (feed) {
        feed.source = 'blogger';
        feed.confidence += 0.2; // High confidence for Blogger paths
        feeds.push(feed);
      }
    }

    return feeds;
  }

  /**
   * Calculate confidence based on path and type
   */
  private static calculatePathConfidence(path: string, type: FeedType): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence for specific extensions
    if (path.endsWith('.xml') || path.endsWith('.rss') || path.endsWith('.atom')) {
      confidence += 0.2;
    }

    // Boost confidence for well-known paths
    if (path.includes('/feed') || path.includes('/rss') || path.includes('/atom')) {
      confidence += 0.1;
    }

    // Boost confidence for Atom (preference)
    if (type === FeedType.ATOM_1_0) {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Detect feed type from MIME type
   */
  private static detectTypeFromMimeType(mimeType: string): FeedType {
    const lowerMimeType = mimeType.toLowerCase();

    if (lowerMimeType.includes('application/atom+xml')) {
      return FeedType.ATOM_1_0;
    } else if (lowerMimeType.includes('application/rss+xml')) {
      return FeedType.RSS_2_0;
    } else if (lowerMimeType.includes('application/feed+json') || lowerMimeType.includes('application/json')) {
      return FeedType.JSON_FEED_1_1;
    } else if (lowerMimeType.includes('text/xml') || lowerMimeType.includes('application/xml')) {
      // Generic XML - can't determine specific type
      return FeedType.UNKNOWN;
    }

    return FeedType.UNKNOWN;
  }

  /**
   * Check if URL is likely from a WordPress site
   */
  private static isLikelyWordPress(baseUrl: string): boolean {
    // Simple heuristics - could be enhanced
    return baseUrl.includes('wordpress') || 
           baseUrl.includes('wp-') ||
           baseUrl.includes('/wp-content/') ||
           baseUrl.includes('/wp-json/');
  }

  /**
   * Check if URL is likely from a Blogger site
   */
  private static isLikelyBlogger(baseUrl: string): boolean {
    // Simple heuristics for Blogger sites
    return baseUrl.includes('blogger.com') || 
           baseUrl.includes('blogspot.com') ||
           baseUrl.includes('blogspot.') ||
           baseUrl.includes('/feeds/posts/');
  }


  /**
   * Resolve relative URL against base URL
   */
  private static resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    if (url.startsWith('//')) {
      return 'https:' + url;
    }

    if (url.startsWith('/')) {
      return baseUrl + url;
    }

    return baseUrl + '/' + url;
  }

  /**
   * Remove duplicate feeds and sort by confidence
   */
  private static deduplicateAndSortFeeds(feeds: DiscoveredFeed[]): DiscoveredFeed[] {
    const seen = new Set<string>();
    const unique: DiscoveredFeed[] = [];

    for (const feed of feeds) {
      if (!seen.has(feed.url)) {
        seen.add(feed.url);
        unique.push(feed);
      }
    }

    // Sort by confidence (highest first), then by type preference
    return unique.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }

      // Type preference: JSON Feed > Atom > RSS
      const typePriority = {
        [FeedType.JSON_FEED_1_1]: 3,
        [FeedType.ATOM_1_0]: 2,
        [FeedType.RSS_2_0]: 1,
        [FeedType.UNKNOWN]: 0,
      };

      return typePriority[b.type] - typePriority[a.type];
    });
  }

  /**
   * Get discovery statistics
   */
  static getDiscoveryStats(result: FeedDiscoveryResult): {
    totalFeeds: number;
    byType: Record<FeedType, number>;
    bySource: Record<string, number>;
    topFeeds: DiscoveredFeed[];
  } {
    const byType: Record<FeedType, number> = {
      [FeedType.RSS_2_0]: 0,
      [FeedType.ATOM_1_0]: 0,
      [FeedType.JSON_FEED_1_1]: 0,
      [FeedType.UNKNOWN]: 0,
    };

    const bySource: Record<string, number> = {};

    for (const feed of result.feeds) {
      byType[feed.type]++;
      bySource[feed.source] = (bySource[feed.source] || 0) + 1;
    }

    return {
      totalFeeds: result.feeds.length,
      byType,
      bySource,
      topFeeds: result.feeds.slice(0, 5), // Top 5 feeds
    };
  }
}
