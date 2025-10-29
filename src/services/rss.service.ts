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
import { redditService } from './reddit.service.js';

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
    logger.info('RSS Service initialized');
  }

  /**
   * Fetch and parse an RSS feed with retry logic, rate limiting, and caching
   */
  async fetchFeed(url: string): Promise<ParseResult> {
    // Check if this is a Reddit URL - if so, always use Reddit service (never RSS)
    if (redditService.isRedditUrl(url)) {
      logger.info(`🔄 Detected Reddit URL: ${url}, using Reddit service`);
      const redditResult = await redditService.fetchFeed(url);
      
      // If Reddit service returns a feed, use it
      if (redditResult.success && redditResult.feed) {
        logger.info(`✅ Reddit service provided feed for ${url}`);
        return redditResult;
      }
      
      // Reddit service failed - return error (don't fall back to RSS for Reddit)
      logger.error(`Reddit service failed for ${url}`);
      return {
        success: false,
        error: redditResult.error || 'Failed to fetch Reddit feed',
      };
    }
    
    // Try alternative URLs first if the original might have issues
    const alternativeUrls = this.getAlternativeUrls(url);
    const urlsToTry = [url, ...alternativeUrls];
    
    for (const tryUrl of urlsToTry) {
      const result = await this.fetchFeedFromUrl(tryUrl);
      if (result.success) {
        return result;
      }
      // If this URL failed but it's not the original, log it but continue
      if (tryUrl !== url) {
        // Try alternative URL silently
      }
    }
    
    // If all URLs failed, return the last error
    return await this.fetchFeedFromUrl(url);
  }

  /**
   * Fetch feed from a specific URL
   */
  private async fetchFeedFromUrl(url: string): Promise<ParseResult> {
    // Check cache first
    const cachedEntry = cacheService.getEntry(url);
    if (cachedEntry) {
      // Using cached feed
      return {
        success: true,
        feed: cachedEntry.feed,
      };
    }

    // Check if URL is known to be problematic
    // BUT: Only skip if it's NOT a Reddit URL that should be handled by RedditService
    // This prevents blocking legitimate Reddit URLs before they can be properly routed
    if (this.isProblematicUrl(url) && !redditService.isRedditUrl(url)) {
      logger.warn(`Skipping problematic URL: ${url}`);
      return {
        success: false,
        error: 'URL is known to be problematic and has been skipped',
      };
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Fetching RSS feed

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
        
        // Use fetch API with connection pooling
        const response = await fetch(url, {
          headers: browserHeaders,
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        // Check if we got a 304 Not Modified response
        if (response.status === 304) {
          // Received 304 Not Modified, using cached feed
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
          
          // 🔥 LOG ESPECÍFICO PARA BLOQUEIOS DO REDDIT
          if (url.includes('reddit.com') && response.status === 403) {
            logger.error(`🚫 REDDIT BLOCKED - Chat: ${url} | Status: ${response.status} | Possible bot detection`);
          }
          
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
        // Feed features detected
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

        // Successfully parsed RSS feed

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
            // Waiting due to rate limiting
            await this.sleep(rateLimitDelay);
          }
        } else {
          logger.warn(`RSS fetch attempt ${attempt} failed for ${url}:`, lastError.message);
          
          // Don't retry on certain errors
          if (this.isNonRetryableError(lastError)) {
            // Only record failure in circuit breaker for non-retryable errors
            circuitBreakerService.recordFailure(this.extractDomain(url));
            break;
          }

          // Wait before retrying (exponential backoff)
          if (attempt < this.maxRetries) {
            const delay = Math.min(this.baseDelay * 2 ** (attempt - 1), this.maxDelay);
            // Waiting before retry
            await this.sleep(delay);
          }
        }
      }
    }

    const errorMessage = lastError?.message || 'Unknown error occurred';
    logger.error(
      `Failed to fetch RSS feed after ${this.maxRetries} attempts: ${url} - ${errorMessage}`
    );

    // Only record failure in circuit breaker after all retries failed
    // and it's not a non-retryable error (which was already recorded)
    if (!this.isNonRetryableError(lastError!)) {
      circuitBreakerService.recordFailure(this.extractDomain(url));
    }

    return {
      success: false,
      error: errorMessage,
    };
  }

  /**
   * Get new items from a feed based on the last known item ID
   */
  async getNewItems(url: string, lastItemId?: string): Promise<{items: RSSItem[], totalItemsCount: number, lastItemIdToSave?: string, firstItemId?: string}> {
    const result = await this.fetchFeed(url);

    if (!result.success || !result.feed) {
      return { items: [], totalItemsCount: 0 };
    }

    // Use items in their natural order from the feed (not forced date sorting)
    // Feeds already come ordered from the server (most recent first)
    const items = result.feed.items;
    const totalItemsCount = items.length;
    const firstItemId = items.length > 0 ? items[0]?.id : undefined;

    // If no last item ID, this is the first time processing this feed
    // DON'T process anything - just return empty to mark that we've started monitoring
    if (!lastItemId) {
      logger.info(`No lastItemId for ${url} - First time processing, returning empty (will not process old items)`);
      
      // Return empty array - don't process any old items
      // But save the first item as lastItemId reference for future checks
      logger.info(`Setting first item as reference: ${firstItemId}`);
      
      return { items: [], totalItemsCount, lastItemIdToSave: firstItemId, firstItemId };
    }

    // Find the index of the last known item
    const lastItemIndex = items.findIndex((item) => item.id === lastItemId);

    // 🔍 DEBUG: Log first few items to understand the issue
    logger.info(`🔍 DEBUG: Feed ${url} - Looking for lastItemId: ${lastItemId}`);
    logger.info(`🔍 DEBUG: First 3 items in feed: ${items.slice(0, 3).map(item => item.id).join(', ')}`);
    logger.info(`🔍 DEBUG: First 3 items dates: ${items.slice(0, 3).map(item => item.pubDate?.toISOString() || 'no date').join(', ')}`);

    if (lastItemIndex === -1) {
      // Last item not found, might be too old or feed changed
      // Check if there are newer items by comparing timestamps
      logger.warn(`Last item ID ${lastItemId} not found in feed ${url}`);
      
      // For Reddit, use more intelligent strategy
      if (url.includes('reddit.com')) {
        logger.info(`🔍 REDDIT DEBUG: lastItemId not found, using intelligent fallback for ${url}`);
        
        // Try to find items with timestamps newer than a reasonable threshold
        // For Reddit, assume items older than 1 hour are not "new"
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentItems = items.filter(item => {
          if (!item.pubDate) return false;
          return item.pubDate > oneHourAgo;
        });
        
        if (recentItems.length > 0) {
          logger.info(`🔍 REDDIT DEBUG: Found ${recentItems.length} items from last hour, returning those`);
          return { items: recentItems, totalItemsCount, firstItemId };
        }
        
        // If no recent items, return only the 3 most recent to avoid spam
        const safeItems = items.slice(0, Math.min(3, items.length));
        logger.info(`🔍 REDDIT DEBUG: No recent items, returning ${safeItems.length} most recent items`);
        return { items: safeItems, totalItemsCount, firstItemId };
      }
      
      // For non-Reddit feeds, use original logic
      const potentiallyNewItems = items.filter(() => {
        // If we can't find the exact ID, assume items at the top are newer
        // This handles cases where feeds change item IDs or remove old items
        return true; // For now, return all items to be safe
      });
      
      // Return only the most recent items to avoid spam
      const safeItems = potentiallyNewItems.slice(0, Math.min(5, potentiallyNewItems.length));
      
      logger.info(`🔍 DEBUG: Feed ${url} - lastItemId not found, returning ${safeItems.length} most recent items`);
      logger.info(`🔍 DEBUG: Returning items: ${safeItems.map(item => item.id).join(', ')}`);
      
      return { items: safeItems, totalItemsCount, firstItemId };
    }

    // Return only new items (items before the last known item in the array)
    const newItems = items.slice(0, lastItemIndex);
    logger.info(`🔍 DEBUG: Found ${newItems.length} new items in feed ${url} (lastItemIndex: ${lastItemIndex})`);
    logger.info(`🔍 DEBUG: New items IDs: ${newItems.map(item => item.id).join(', ')}`);

    // If lastItemIndex is 0, it means the lastItemId is still the most recent item
    // No new items to return, but always update to current first item
    if (lastItemIndex === 0) {
      logger.info(`🔍 DEBUG: Feed ${url} - lastItemId found at position 0`);
      
      // If the first item in the feed is DIFFERENT from lastItemId, it's a new item!
      // This handles cases where Reddit returns a different post at the top
      const firstItem = items[0];
      if (firstItem && firstItem.id !== lastItemId) {
        logger.info(`🔍 REDDIT DEBUG: First item changed! Old lastItemId: ${lastItemId}, New first item: ${firstItem.id}`);
        logger.info(`🔍 REDDIT DEBUG: Returning only the new top item: ${firstItem.id}`);
        return { items: [firstItem], totalItemsCount, firstItemId };
      }
      
      // Check for staleness - warn if first post is very old
      if (firstItem && firstItem.pubDate) {
        const itemAge = Date.now() - firstItem.pubDate.getTime();
        const oneHourMs = 60 * 60 * 1000;
        
        if (itemAge > oneHourMs && firstItem.id === lastItemId) {
          logger.warn(`⚠️ STALENESS: First post in ${url} is ${Math.round(itemAge / 60000)} minutes old and no new items detected`);
          logger.warn(`⚠️ This may indicate Reddit JSON API cache issues - consider using OAuth API`);
        }
      }
      
      // For Reddit, check if there are items with newer timestamps (fallback logic)
      // This handles edge cases where posts have same timestamp
      if (url.includes('reddit.com')) {
        // Find the lastItemId in the feed to get its timestamp
        const lastItem = items.find(item => item.id === lastItemId);
        const lastItemDate = lastItem?.pubDate;
        if (lastItemDate) {
          logger.info(`🔍 REDDIT DEBUG: Checking for posts newer than ${lastItemDate.toISOString()}`);
          
          // Find items with timestamp >= lastItemId (include items with same timestamp)
          // This catches posts that were created after the lastItemId was saved
          const newerItems = items.filter(item => {
            if (!item.pubDate) return false;
            // Include items that are >= lastItemDate (catch same-timestamp posts)
            return item.pubDate >= lastItemDate;
          });
          
          if (newerItems.length > 0) {
            logger.info(`🔍 REDDIT DEBUG: Found ${newerItems.length} posts >= lastItemId timestamp`);
            logger.info(`🔍 REDDIT DEBUG: newerItems IDs: ${newerItems.map(i => i.id).join(', ')}`);
            // Return items that are NOT the lastItemId (exclude the known item itself)
            const trulyNewItems = newerItems.filter(item => item.id !== lastItemId);
            
            logger.info(`🔍 REDDIT DEBUG: After filtering lastItemId (${lastItemId}): ${trulyNewItems.length} truly new items`);
            if (trulyNewItems.length > 0) {
              logger.info(`🔍 REDDIT DEBUG: Returning ${trulyNewItems.length} truly new posts (excluding known item)`);
              return { items: trulyNewItems, totalItemsCount, firstItemId };
            } else {
              logger.info(`🔍 REDDIT DEBUG: All newer items were filtered out (they were the lastItemId itself)`);
            }
          }
        }
      }
      
      logger.info(`🔍 DEBUG: Feed ${url} - No new items, lastItemId still at top`);
      return { items: [], totalItemsCount, firstItemId };
    }

    return { items: newItems, totalItemsCount, firstItemId };
  }

  /**
   * Get new items from a feed and apply filters
   */
  async getNewItemsWithFilters(
    url: string,
    filters: PrismaFeedFilter[],
    lastItemId?: string
  ): Promise<RSSItem[]> {
    const result = await this.getNewItems(url, lastItemId);
    const newItems = result.items;

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

    // Applying filters to new items
    const filteredItems = filterService.applyFilters(newItems, filterObjects);

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
    // For Reddit posts, extract the post ID from the link with multiple patterns
    if (item.link && item.link.includes('reddit.com')) {
      // Try multiple patterns for Reddit post IDs
      const patterns = [
        /\/comments\/([a-zA-Z0-9]+)/, // Standard pattern: /comments/abc123
        /\/r\/\w+\/comments\/([a-zA-Z0-9]+)/, // With subreddit: /r/programming/comments/abc123
        /\/user\/\w+\/comments\/([a-zA-Z0-9]+)/, // User posts: /user/username/comments/abc123
        /\/u\/\w+\/comments\/([a-zA-Z0-9]+)/, // Short user: /u/username/comments/abc123
      ];
      
      for (const pattern of patterns) {
        const match = item.link.match(pattern);
        if (match) {
          // Normalize Reddit IDs to lowercase for consistency
          return `reddit_${match[1].toLowerCase()}`;
        }
      }
      
      // If no pattern matches, try to extract from GUID
      if (item.guid) {
        // Reddit GUIDs often contain the post ID
        const guidMatch = item.guid.match(/([a-zA-Z0-9]+)$/);
        if (guidMatch) {
          return `reddit_guid_${guidMatch[1].toLowerCase()}`;
        }
        return `reddit_guid_${item.guid.toLowerCase()}`;
      }
      
      // Fallback: use link hash for Reddit
      return `reddit_link_${this.hashString(item.link)}`;
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
   * Simple hash function for generating consistent IDs
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
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
      // Removido 'timeout' - agora tratamos timeouts como retryable
      // Removido 'request timed out' - agora tratamos timeouts como retryable
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
    
    // Special handling for Reddit - much more conservative delays
    if (domain.includes('reddit.com')) {
      // Progressive delays for Reddit: 30s, 60s, 120s (much more conservative)
      const redditDelays = [30000, 60000, 120000];
      const delayIndex = Math.min(attempt - 1, redditDelays.length - 1);
      return redditDelays[delayIndex] || 120000; // Fallback to 2 minutes
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
   * Note: reddit.com.br is a different domain (not official Reddit)
   * URLs with this domain are blocked as they're not the official Reddit service
   */
  private isProblematicUrl(url: string): boolean {
    const problematicPatterns = [
      'reddit.com.br', // Known problematic domain (not official Reddit)
      'reddit.com.br/r/', // Specific pattern
    ];

    return problematicPatterns.some((pattern) => url.includes(pattern));
  }

  /**
   * Generate alternative URLs to try if the original fails
   */
  private getAlternativeUrls(originalUrl: string): string[] {
    const alternatives: string[] = [];
    
    try {
      const url = new URL(originalUrl);
      const hostname = url.hostname.toLowerCase();
      
      // For domains without www, try with www
      if (!hostname.startsWith('www.')) {
        const wwwUrl = new URL(originalUrl);
        wwwUrl.hostname = `www.${hostname}`;
        alternatives.push(wwwUrl.toString());
      }
      
      // For domains with www, try without www
      if (hostname.startsWith('www.')) {
        const noWwwUrl = new URL(originalUrl);
        noWwwUrl.hostname = hostname.substring(4);
        alternatives.push(noWwwUrl.toString());
      }
      
      // For Blogger feeds, try common variations
      if (hostname.includes('blogspot.com') || hostname.includes('blogger.com')) {
        // Try /feeds/posts/default if not already present
        if (!originalUrl.includes('/feeds/posts/default')) {
          const feedUrl = new URL(originalUrl);
          feedUrl.pathname = '/feeds/posts/default';
          alternatives.push(feedUrl.toString());
        }
        
        // Try /feeds/posts/default?alt=rss
        const rssUrl = new URL(originalUrl);
        rssUrl.pathname = '/feeds/posts/default';
        rssUrl.searchParams.set('alt', 'rss');
        alternatives.push(rssUrl.toString());
      }
      
      // For WordPress sites, try common feed URLs
      if (hostname.includes('wordpress.com') || hostname.includes('wp.com')) {
        const wpFeedUrl = new URL(originalUrl);
        wpFeedUrl.pathname = '/feed/';
        alternatives.push(wpFeedUrl.toString());
      }
      
    } catch (error) {
      // If URL parsing fails, don't add alternatives
      // Failed to parse URL for alternatives
    }
    
    return alternatives;
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
