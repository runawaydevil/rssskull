import type { FeedFilter as PrismaFeedFilter } from '@prisma/client';
import Parser from 'rss-parser';

import { filterService } from '../utils/filters/filter.service.js';
import { logger } from '../utils/logger/logger.service.js';
import { rateLimiterService } from '../utils/rate-limiter.service.js';
import { userAgentService } from '../utils/user-agent.service.js';
import { cacheService } from '../utils/cache.service.js';

export interface RSSItem {
  id: string;
  title: string;
  link: string;
  description?: string;
  pubDate?: Date;
  author?: string;
  categories?: string[];
  guid?: string;
}

export interface RSSFeed {
  title?: string;
  description?: string;
  link?: string;
  items: RSSItem[];
}

export interface ParseResult {
  success: boolean;
  feed?: RSSFeed;
  error?: string;
}

export class RSSService {
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second
  private readonly maxDelay = 30000; // 30 seconds

  constructor() {
    // Parser instances are created per request with domain-specific headers
  }

  /**
   * Fetch and parse an RSS feed with retry logic, rate limiting, and caching
   */
  async fetchFeed(url: string): Promise<ParseResult> {
    // Check cache first
    const cachedFeed = cacheService.get(url);
    if (cachedFeed) {
      logger.debug(`Using cached RSS feed: ${url} (${cachedFeed.items.length} items)`);
      return {
        success: true,
        feed: cachedFeed,
      };
    }

    // Check if URL is known to be problematic
    if (this.isProblematicUrl(url)) {
      logger.warn(`Skipping problematic URL: ${url}`);
      return {
        success: false,
        error: 'URL is known to be problematic and has been skipped',
      };
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug(`Fetching RSS feed (attempt ${attempt}/${this.maxRetries}): ${url}`);

        // Apply rate limiting before making the request
        await rateLimiterService.waitIfNeeded(url);

        // Get realistic browser headers with User-Agent rotation
        const browserHeaders = userAgentService.getHeaders(url);
        
        // Create a parser instance with realistic browser headers
        const domainParser = new Parser({
          timeout: 10000,
          headers: browserHeaders,
        });

        const feed = await domainParser.parseURL(url);
        const processedFeed = this.processFeed(feed);

        // Cache the successful result
        cacheService.set(url, processedFeed);

        logger.debug(`Successfully parsed RSS feed: ${url} (${processedFeed.items.length} items)`);

        return {
          success: true,
          feed: processedFeed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if it's a rate limiting error (429)
        if (this.isRateLimitError(lastError)) {
          logger.warn(`Rate limit hit for ${url}, increasing delay for next attempt`);
          // For rate limit errors, wait longer before retry
          if (attempt < this.maxRetries) {
            const rateLimitDelay = this.getRateLimitDelay(url, attempt);
            logger.debug(`Waiting ${rateLimitDelay}ms due to rate limiting...`);
            await this.sleep(rateLimitDelay);
          }
        } else {
          logger.warn(`RSS fetch attempt ${attempt} failed for ${url}:`, lastError.message);
          
          // Don't retry on certain errors
          if (this.isNonRetryableError(lastError)) {
            break;
          }

          // Wait before retrying (exponential backoff)
          if (attempt < this.maxRetries) {
            const delay = Math.min(this.baseDelay * 2 ** (attempt - 1), this.maxDelay);
            logger.debug(`Waiting ${delay}ms before retry...`);
            await this.sleep(delay);
          }
        }
      }
    }

    const errorMessage = lastError?.message || 'Unknown error occurred';
    logger.error(
      `Failed to fetch RSS feed after ${this.maxRetries} attempts: ${url} - ${errorMessage}`
    );

    return {
      success: false,
      error: errorMessage,
    };
  }

  /**
   * Get new items from a feed based on the last known item ID
   */
  async getNewItems(url: string, lastItemId?: string, forceProcessAll = false): Promise<RSSItem[]> {
    const result = await this.fetchFeed(url);

    if (!result.success || !result.feed) {
      return [];
    }

    const items = result.feed.items;

    // If no last item ID, return only items from bot startup time onwards
    // Unless forceProcessAll is true, then return all items
    if (!lastItemId) {
      logger.info(`No lastItemId for ${url}, forceProcessAll: ${forceProcessAll}, BOT_STARTUP_TIME: ${process.env.BOT_STARTUP_TIME}`);
      
      if (forceProcessAll) {
        logger.info(`Force processing all items for ${url}, returning ${items.length} items`);
        return items;
      }
      
      const botStartupTime = new Date(process.env.BOT_STARTUP_TIME || Date.now());
      logger.info(`Bot startup time: ${botStartupTime.toISOString()}`);
      
      const startupItems = items.filter(item => {
        if (!item.pubDate) return false;
        const isAfterStartup = item.pubDate > botStartupTime;
        logger.debug(`Item ${item.id} pubDate: ${item.pubDate?.toISOString()}, after startup: ${isAfterStartup}`);
        return isAfterStartup;
      });
      
      logger.info(`No last item ID for ${url}, returning ${startupItems.length} items from bot startup onwards out of ${items.length} total`);
      return startupItems;
    }

    // Find the index of the last known item
    const lastItemIndex = items.findIndex((item) => item.id === lastItemId);

    if (lastItemIndex === -1) {
      // Last item not found, might be too old or feed changed
      // Return only the most recent item to avoid spam
      logger.warn(`Last item ID ${lastItemId} not found in feed ${url}, returning only the most recent item`);
      return items.slice(0, 1);
    }

    // Return only new items (items before the last known item in the array)
    const newItems = items.slice(0, lastItemIndex);
    logger.debug(`Found ${newItems.length} new items in feed ${url}`);

    return newItems;
  }

  /**
   * Get new items from a feed and apply filters
   */
  async getNewItemsWithFilters(
    url: string,
    filters: PrismaFeedFilter[],
    lastItemId?: string
  ): Promise<RSSItem[]> {
    const newItems = await this.getNewItems(url, lastItemId);

    if (newItems.length === 0 || filters.length === 0) {
      return newItems;
    }

    // Convert Prisma FeedFilter to our filter type
    const filterObjects = filters.map((f) => ({
      id: f.id,
      feedId: f.feedId,
      type: f.type as 'include' | 'exclude',
      pattern: f.pattern,
      isRegex: f.isRegex,
    }));

    logger.debug(
      `Applying ${filterObjects.length} filters to ${newItems.length} new items for feed`
    );
    const filteredItems = filterService.applyFilters(newItems, filterObjects);
    logger.debug(
      `Filter processing complete: ${filteredItems.length}/${newItems.length} items passed filters`
    );

    return filteredItems;
  }

  /**
   * Validate if a URL is a valid RSS feed
   */
  async validateFeedUrl(url: string): Promise<boolean> {
    try {
      const result = await this.fetchFeed(url);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Process raw RSS feed data into our standardized format
   */
  private processFeed(rawFeed: any): RSSFeed {
    const items: RSSItem[] = (rawFeed.items || []).map((item: any) => {
      // Generate a unique ID for the item
      const id = this.generateItemId(item);

      // Extract original link from Reddit posts
      const originalLink = this.extractOriginalLink(item);

      return {
        id,
        title: this.sanitizeText(item.title || 'Untitled'),
        link: originalLink || item.link || '',
        description: this.sanitizeText(item.contentSnippet || item.content || item.summary || ''),
        pubDate: item.pubDate ? new Date(item.pubDate) : undefined,
        author: this.sanitizeText(item.creator || item.author || ''),
        categories: item.categories || [],
        guid: item.guid || item.id,
      };
    });

    return {
      title: this.sanitizeText(rawFeed.title || ''),
      description: this.sanitizeText(rawFeed.description || ''),
      link: rawFeed.link || '',
      items,
    };
  }

  /**
   * Extract original link from Reddit posts
   */
  private extractOriginalLink(item: any): string | null {
    // Check if this is a Reddit post
    const link = item.link || '';
    if (!link.includes('reddit.com')) {
      return null; // Not a Reddit post
    }

    // Try to extract original link from content
    const content = item.content || item.contentSnippet || item.summary || '';
    
    // Look for URLs in the content
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    const urls = content.match(urlRegex);
    
    if (urls && urls.length > 0) {
      // Filter out Reddit URLs and return the first external URL
      const externalUrls = urls.filter((url: string) => 
        !url.includes('reddit.com') && 
        !url.includes('redd.it') &&
        !url.includes('i.redd.it') &&
        !url.includes('v.redd.it')
      );
      
      if (externalUrls.length > 0) {
        return externalUrls[0];
      }
    }

    return null;
  }

  /**
   * Generate a unique ID for an RSS item
   */
  private generateItemId(item: any): string {
    // For Reddit posts, extract the post ID from the link
    if (item.link && item.link.includes('reddit.com')) {
      const redditIdMatch = item.link.match(/\/comments\/([a-zA-Z0-9]+)/);
      if (redditIdMatch) {
        return `reddit_${redditIdMatch[1]}`;
      }
    }

    // Try to use GUID first, then link, then title + pubDate
    if (item.guid) {
      return String(item.guid);
    }

    if (item.link) {
      return String(item.link);
    }

    // Fallback: create hash from title and pubDate
    const title = item.title || 'untitled';
    const pubDate = item.pubDate || new Date().toISOString();
    return `${title}-${pubDate}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  }

  /**
   * Sanitize text content for Telegram
   */
  private sanitizeText(text: string): string {
    if (!text) return '';

    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .trim();
  }

  /**
   * Check if an error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Don't retry on these types of errors
    const nonRetryablePatterns = [
      'not found', // 404 errors
      'unauthorized', // 401 errors
      'forbidden', // 403 errors
      'invalid url',
      'invalid feed',
      'parse error',
      'timeout', // Timeout errors
      'request timed out', // Specific timeout message
    ];

    return nonRetryablePatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Check if an error is a rate limiting error
   */
  private isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('status code 429') || 
           message.includes('too many requests') ||
           message.includes('rate limit');
  }

  /**
   * Get appropriate delay for rate limiting errors
   */
  private getRateLimitDelay(url: string, attempt: number): number {
    const domain = this.extractDomain(url);
    
    // Special handling for Reddit
    if (domain.includes('reddit.com')) {
      // Progressive delays for Reddit: 5s, 15s, 30s
      const redditDelays = [5000, 15000, 30000];
      const delayIndex = Math.min(attempt - 1, redditDelays.length - 1);
      return redditDelays[delayIndex] || 30000; // Fallback to 30s
    }
    
    // Default rate limit delay with exponential backoff
    return Math.min(5000 * 2 ** (attempt - 1), 60000); // Max 1 minute
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if a URL is known to be problematic
   */
  private isProblematicUrl(url: string): boolean {
    const problematicPatterns = [
      'reddit.com.br', // Known problematic domain
      'reddit.com.br/r/', // Specific pattern
    ];

    return problematicPatterns.some((pattern) => url.includes(pattern));
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const rssService = new RSSService();
