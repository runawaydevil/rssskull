import type { FeedFilter as PrismaFeedFilter } from '@prisma/client';
import Parser from 'rss-parser';

import { filterService } from '../utils/filters/filter.service.js';
import { logger } from '../utils/logger/logger.service.js';
import { rateLimiterService } from '../utils/rate-limiter.service.js';
import { userAgentService } from '../utils/user-agent.service.js';
import { cacheService } from '../utils/cache.service.js';
import { circuitBreakerService } from '../utils/circuit-breaker.service.js';
import { parseDate } from '../utils/date-parser.js';
import { FeedTypeDetector, FeedType } from '../utils/feed-type-detector.js';
import { JsonFeedParser } from '../utils/json-feed-parser.js';

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
  feedType?: FeedType;
  detectedFeatures?: string[];
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
    const cachedEntry = cacheService.getEntry(url);
    if (cachedEntry) {
      logger.debug(`Using cached RSS feed: ${url} (${cachedEntry.feed.items.length} items)`);
      return {
        success: true,
        feed: cachedEntry.feed,
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

        // Check circuit breaker before making the request
        const domain = this.extractDomain(url);
        if (!(await circuitBreakerService.canExecute(domain))) {
          throw new Error(`Circuit breaker is open for ${domain}`);
        }

        // Apply rate limiting before making the request
        await rateLimiterService.waitIfNeeded(url);

        // Get realistic browser headers with User-Agent rotation
        const browserHeaders = userAgentService.getHeaders(url);
        
        // Add conditional headers if available (get fresh cache entry for this attempt)
        const currentCachedEntry = cacheService.getEntry(url);
        if (currentCachedEntry) {
          if (currentCachedEntry.etag) {
            browserHeaders['If-None-Match'] = currentCachedEntry.etag;
          }
          if (currentCachedEntry.lastModified) {
            browserHeaders['If-Modified-Since'] = currentCachedEntry.lastModified;
          }
        }
        
        // Use fetch API to get response headers for conditional caching
        const response = await fetch(url, {
          headers: browserHeaders,
          signal: AbortSignal.timeout(10000),
        });

        // Check if we got a 304 Not Modified response
        if (response.status === 304) {
          logger.debug(`Received 304 Not Modified for ${url}, using cached feed`);
          if (currentCachedEntry) {
            return {
              success: true,
              feed: currentCachedEntry.feed,
            };
          }
        }

        // Validate response status
        if (!response.ok) {
          // Record failure in circuit breaker
          circuitBreakerService.recordFailure(domain);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Record success in circuit breaker
        circuitBreakerService.recordSuccess(domain);

        // Validate content type (support XML and JSON feeds)
        const contentType = response.headers.get('content-type') || '';
        const isXmlFeed = contentType.includes('application/atom+xml') || 
                         contentType.includes('application/rss+xml') || 
                         contentType.includes('text/xml') ||
                         contentType.includes('application/xml');
        const isJsonFeed = contentType.includes('application/json') ||
                          contentType.includes('application/feed+json');
        
        if (!isXmlFeed && !isJsonFeed) {
          logger.warn(`Unexpected content type for ${url}: ${contentType}`);
          // Don't throw error, let the content detection handle it
        }

        // Extract response headers for conditional caching
        const responseHeaders: { etag?: string; lastModified?: string } = {};
        const etag = response.headers.get('etag');
        const lastModified = response.headers.get('last-modified');
        
        if (etag) {
          responseHeaders.etag = etag;
        }
        if (lastModified) {
          responseHeaders.lastModified = lastModified;
        }

        // Parse the response text with rss-parser
        const responseText = await response.text();
        
        // Check if response is HTML (likely an error page)
        if (responseText.trim().startsWith('<!DOCTYPE html') || 
            responseText.trim().startsWith('<html')) {
          logger.warn(`Received HTML instead of XML feed for ${url}`);
          throw new Error('Received HTML page instead of XML feed. Possible redirect or error page.');
        }

        // Detect feed type and parse accordingly
        const feedTypeInfo = FeedTypeDetector.detectFeedType(responseText, contentType, url);
        
        logger.info(`Detected feed type: ${FeedTypeDetector.getFeedTypeDescription(feedTypeInfo.type)} (confidence: ${feedTypeInfo.confidence}) for ${url}`);
        
        if (feedTypeInfo.features.length > 0) {
          logger.debug(`Feed features: ${feedTypeInfo.features.join(', ')}`);
        }
        
        if (feedTypeInfo.issues && feedTypeInfo.issues.length > 0) {
          logger.warn(`Feed issues: ${feedTypeInfo.issues.join(', ')}`);
        }

        let processedFeed: RSSFeed;

        // Parse based on detected type
        if (feedTypeInfo.type === FeedType.JSON_FEED_1_1) {
          processedFeed = JsonFeedParser.parseJsonFeed(responseText, url);
        } else {
          // Use rss-parser for RSS 2.0 and Atom 1.0
          const domainParser = new Parser({
            timeout: 10000,
            headers: browserHeaders,
          });

          const feed = await domainParser.parseString(responseText);
          processedFeed = this.processFeed(feed);
        }

        // Add feed type information
        processedFeed.feedType = feedTypeInfo.type;
        processedFeed.detectedFeatures = feedTypeInfo.features;
        
        // Cache the successful result with conditional headers
        cacheService.setWithHeaders(url, processedFeed, responseHeaders);

        logger.debug(`Successfully parsed RSS feed: ${url} (${processedFeed.items.length} items)`);

        return {
          success: true,
          feed: processedFeed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Record failure in circuit breaker
        circuitBreakerService.recordFailure(this.extractDomain(url));
        
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
    // Unless forceProcessAll is true, then return items from today only
    if (!lastItemId) {
      logger.info(`No lastItemId for ${url}, forceProcessAll: ${forceProcessAll}, BOT_STARTUP_TIME: ${process.env.BOT_STARTUP_TIME}`);
      
      if (forceProcessAll) {
        // Filter only items from today when force processing
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const todayItems = items.filter(item => {
          if (!item.pubDate) return false;
          return item.pubDate >= startOfDay;
        });
        
        logger.info(`Force processing items from today for ${url}, returning ${todayItems.length} items out of ${items.length} total`);
        return todayItems;
      }
      
      // When no lastItemId, only return items from today to avoid processing old posts after restart
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      logger.info(`No lastItemId for ${url}, filtering items from today onwards (${startOfDay.toISOString()})`);
      
      const todayItems = items.filter(item => {
        if (!item.pubDate) return false;
        const isFromToday = item.pubDate >= startOfDay;
        logger.debug(`Item ${item.id} pubDate: ${item.pubDate?.toISOString()}, from today: ${isFromToday}`);
        return isFromToday;
      });
      
      logger.info(`No last item ID for ${url}, returning ${todayItems.length} items from today onwards out of ${items.length} total`);
      return todayItems;
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
   * Process raw feed data into our standardized format
   * Handles both RSS 2.0 and Atom 1.0 formats
   */
  private processFeed(rawFeed: any): RSSFeed {
    const items: RSSItem[] = (rawFeed.items || []).map((item: any) => {
      // Generate a unique ID for the item
      const id = this.generateItemId(item);

      // Extract original link from Reddit posts
      const originalLink = this.extractOriginalLink(item);

      // Handle Atom 1.0 vs RSS 2.0 date fields
      const pubDate = this.extractItemDate(item);

      // Handle Atom 1.0 vs RSS 2.0 author fields
      const author = this.extractItemAuthor(item);

      // Handle Atom 1.0 vs RSS 2.0 content fields
      const description = this.extractItemContent(item);

      return {
        id,
        title: this.sanitizeText(item.title || 'Untitled'),
        link: originalLink || item.link || '',
        description: description,
        pubDate: pubDate,
        author: author,
        categories: item.categories || [],
        guid: item.guid || item.id,
      };
    });

    return {
      title: this.sanitizeText(rawFeed.title || ''),
      description: this.sanitizeText(rawFeed.description || rawFeed.subtitle || ''),
      link: rawFeed.link || '',
      items,
    };
  }

  /**
   * Extract date from item, handling both Atom 1.0 and RSS 2.0 formats
   */
  private extractItemDate(item: any): Date | undefined {
    // Atom 1.0: <updated> or <published> (ISO 8601)
    // RSS 2.0: <pubDate> (RFC 2822)
    const dateFields = [
      item.isoDate,        // rss-parser normalized field
      item.updated,        // Atom 1.0 <updated>
      item.published,       // Atom 1.0 <published>
      item.pubDate,        // RSS 2.0 <pubDate>
    ];

    for (const dateField of dateFields) {
      if (dateField) {
        const parsedDate = parseDate(dateField);
        if (parsedDate) {
          return parsedDate;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract author from item, handling both Atom 1.0 and RSS 2.0 formats
   */
  private extractItemAuthor(item: any): string {
    // Atom 1.0: <author><name> or <author><email>
    // RSS 2.0: <author> (email format) or <dc:creator>
    if (item.author && typeof item.author === 'object') {
      // Atom 1.0 author object
      return this.sanitizeText(item.author.name || item.author.email || '');
    } else if (item.creator) {
      // RSS 2.0 dc:creator
      return this.sanitizeText(item.creator);
    } else if (item.author) {
      // RSS 2.0 author or Atom 1.0 author as string
      return this.sanitizeText(item.author);
    }

    return '';
  }

  /**
   * Extract content from item, handling both Atom 1.0 and RSS 2.0 formats
   */
  private extractItemContent(item: any): string {
    // Atom 1.0: <content> or <summary>
    // RSS 2.0: <description> or <content:encoded>
    const contentFields = [
      item.content,         // Atom 1.0 <content>
      item.summary,         // Atom 1.0 <summary>
      item.contentSnippet, // rss-parser processed content
      item.description,     // RSS 2.0 <description>
    ];

    for (const contentField of contentFields) {
      if (contentField && typeof contentField === 'string' && contentField.trim()) {
        return this.extractRedditContent({ ...item, content: contentField });
      }
    }

    return '';
  }


  /**
   * Extract enhanced content from Reddit posts
   */
  private extractRedditContent(item: any): string {
    const link = item.link || '';
    
    // If not a Reddit post, use standard extraction
    if (!link.includes('reddit.com')) {
      return this.sanitizeText(item.contentSnippet || item.content || item.summary || '');
    }

    // Extract Reddit-specific content
    const content = item.content || item.contentSnippet || item.summary || '';
    let extractedContent = '';

    // Extract text content (remove HTML tags and decode entities)
    const textContent = content
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#32;/g, ' ') // Space entity
      .replace(/&#160;/g, ' ') // Non-breaking space
      .replace(/&#8217;/g, "'") // Right single quotation mark
      .replace(/&#8216;/g, "'") // Left single quotation mark
      .replace(/&#8220;/g, '"') // Left double quotation mark
      .replace(/&#8221;/g, '"') // Right double quotation mark
      .replace(/&#8211;/g, '–') // En dash
      .replace(/&#8212;/g, '—') // Em dash
      .replace(/&#8230;/g, '…') // Horizontal ellipsis
      .replace(/&hellip;/g, '…') // Horizontal ellipsis
      .replace(/&mdash;/g, '—') // Em dash
      .replace(/&ndash;/g, '–') // En dash
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();

    // Extract images from Reddit content
    const imageRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]*\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s<>"{}|\\^`\[\]]*)?/gi;
    const images = content.match(imageRegex) || [];
    
    // Extract videos from Reddit content
    const videoRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]*\.(?:mp4|webm|mov|avi)(?:\?[^\s<>"{}|\\^`\[\]]*)?/gi;
    const videos = content.match(videoRegex) || [];

    // Build enhanced content
    if (textContent && textContent.length > 10) {
      // Clean up Reddit-specific formatting
      let cleanContent = textContent
        .replace(/submitted by\s+\/u\/\w+\s+\[link\]\s+\[comments\]/gi, '') // Remove Reddit footer
        .replace(/submitted by\s+\/u\/\w+/gi, '') // Remove author info
        .replace(/\[link\]\s*\[comments\]/gi, '') // Remove link/comments
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
      
      if (cleanContent && cleanContent.length > 5) {
        extractedContent += cleanContent;
      }
    }

    // Add images
    if (images.length > 0) {
      if (extractedContent) extractedContent += '\n\n';
      extractedContent += '🖼️ **Imagens:**\n';
      images.slice(0, 3).forEach((img: string) => {
        extractedContent += `• ${img}\n`;
      });
    }

    // Add videos
    if (videos.length > 0) {
      if (extractedContent) extractedContent += '\n\n';
      extractedContent += '🎥 **Vídeos:**\n';
      videos.slice(0, 2).forEach((video: string) => {
        extractedContent += `• ${video}\n`;
      });
    }

    return this.sanitizeText(extractedContent);
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
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
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
