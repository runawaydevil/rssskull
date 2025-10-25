import { logger } from '../utils/logger/logger.service.js';
import { userAgentService } from '../utils/user-agent.service.js';
import { rateLimiterService } from '../utils/rate-limiter.service.js';
import type { RSSItem, RSSFeed } from './rss.service.js';
import { RedditTokenManager } from './reddit-token-manager.js';
import { RedditAPIProvider } from './reddit-api-provider.js';
import { TokenManagerService } from './token-manager.service.js';
import { PrismaClient } from '@prisma/client';
import { sanitizeUrl } from '../utils/url-sanitizer.js';

export interface RedditPost {
  id: string; // t3_xxxxx format
  title: string;
  url: string;
  permalink: string;
  created_utc: number;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  selftext?: string;
}

export interface RedditJSONResponse {
  data: {
    children: Array<{
      data: RedditPost;
    }>;
    after: string | null;
    before: string | null;
  };
}

export class RedditService {
  private readonly apiBaseUrl = 'https://www.reddit.com';
  private readonly defaultLimit = 25;
  
  // OAuth API provider and circuit breaker
  private apiProvider?: RedditAPIProvider;
  private tokenManager?: TokenManagerService;
  private cbOpenUntil = 0; // Circuit breaker: timestamp when it closes
  private consecutive403Errors = 0; // Track consecutive 403 errors
  
  /**
   * Initialize OAuth API provider if credentials are available
   */
  private initializeAPIProvider(prisma?: PrismaClient): void {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    const username = process.env.REDDIT_USERNAME;
    const password = process.env.REDDIT_PASSWORD;
    
    if (clientId && clientSecret && username && password) {
      try {
        const tokenManager = new RedditTokenManager(clientId, clientSecret, username, password);
        this.apiProvider = new RedditAPIProvider(tokenManager);
        
        // Initialize TokenManagerService if Prisma is available
        if (prisma) {
          this.tokenManager = new TokenManagerService(prisma);
        }
        
        logger.info('Reddit OAuth API provider initialized with Token Manager');
        logger.info(`OAuth Client ID: ${clientId.substring(0, 8)}...`);
      } catch (error) {
        logger.error('Failed to initialize Reddit OAuth API provider:', error);
      }
    } else {
      logger.warn('Reddit OAuth credentials not configured - using JSON fallback only');
      logger.warn('Required: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD');
    }
  }
  
  constructor(prisma?: PrismaClient) {
    this.initializeAPIProvider(prisma);
  }

  /**
   * Check if circuit breaker is open due to 403 errors
   */
  private isCircuitBreakerOpen(): boolean {
    const now = Date.now();
    return now < this.cbOpenUntil;
  }

  /**
   * Handle 403 error and update circuit breaker
   */
  private handle403Error(): void {
    const now = Date.now();
    this.consecutive403Errors++;
    
    // Calculate backoff time: exponential backoff starting at 10 minutes
    const backoffMinutes = Math.min(10 * Math.pow(2, this.consecutive403Errors - 1), 240); // Max 4 hours
    this.cbOpenUntil = now + (backoffMinutes * 60 * 1000);
    
    logger.warn(`Reddit 403 error #${this.consecutive403Errors}. Circuit breaker open for ${backoffMinutes} minutes`);
  }

  /**
   * Reset circuit breaker on successful request
   */
  private resetCircuitBreaker(): void {
    if (this.consecutive403Errors > 0) {
      logger.info(`Reddit circuit breaker reset after ${this.consecutive403Errors} consecutive 403 errors`);
      this.consecutive403Errors = 0;
      this.cbOpenUntil = 0;
    }
  }

  /**
   * Check if URL is a Reddit subreddit
   */
  isRedditUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Detect Reddit URLs (with or without .rss/.json extension)
      return (
        (hostname === 'reddit.com' || hostname === 'www.reddit.com') &&
        (urlObj.pathname.startsWith('/r/') || urlObj.pathname.includes('/r/'))
      );
    } catch {
      return false;
    }
  }

  /**
   * Extract subreddit name from URL
   */
  extractSubreddit(url: string): string | null {
    try {
      const urlObj = new URL(url);
      // Match /r/subreddit with optional /rss or /json
      const match = urlObj.pathname.match(/\/r\/([a-zA-Z0-9_]+)/);
      return match ? match[1] ?? null : null;
    } catch {
      return null;
    }
  }

  /**
   * Extract after cursor from URL
   */
  extractAfter(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const after = urlObj.searchParams.get('after');
      return after;
    } catch {
      return null;
    }
  }


  /**
   * Fetch new posts from Reddit (OAuth API with fallback to public JSON)
   * @deprecated Use fetchFeed() instead - this method is kept for backward compatibility
   */
  async fetchNew(subreddit: string, _after?: string): Promise<RSSItem[]> {
    logger.warn(`fetchNew() is deprecated, use fetchFeed() instead for r/${subreddit}`);
    
    // Delegate to the new fetchFeed method
    const result = await this.fetchFeed(`${this.apiBaseUrl}/r/${subreddit}/.rss`);
    
    if (result.success && result.feed) {
      return result.feed.items;
    }
    
    throw new Error(result.error || 'Failed to fetch Reddit data');
  }

  /**
   * Fetch new posts from Reddit JSON API
   */
  async fetchSubreddit(subreddit: string, after?: string): Promise<{
    success: boolean;
    feed?: RSSFeed;
    items?: RSSItem[];
    after?: string | null;
    error?: string;
  }> {
    // Check circuit breaker first
    if (this.isCircuitBreakerOpen()) {
      const remainingMinutes = Math.ceil((this.cbOpenUntil - Date.now()) / (60 * 1000));
      logger.warn(`Reddit circuit breaker is open. Skipping r/${subreddit} for ${remainingMinutes} more minutes`);
      return {
        success: false,
        error: `Circuit breaker open due to 403 errors. Try again in ${remainingMinutes} minutes`,
      };
    }

    try {
      const url = new URL(`${this.apiBaseUrl}/r/${subreddit}/new.json`);
      url.searchParams.set('limit', this.defaultLimit.toString());
      
      if (after) {
        url.searchParams.set('after', after);
      }

      // Apply rate limiting with jitter (no extra delay needed)
      await rateLimiterService.waitIfNeeded(url.toString());

      // Get realistic browser headers (User-Agent rotation handled automatically)
      const headers = userAgentService.getHeaders(url.toString());
      
      // Use headers that mimic a real browser making a JSON request
      headers['Accept'] = 'application/json, text/javascript, */*; q=0.01';
      headers['Accept-Language'] = 'en-US,en;q=0.9,pt;q=0.8';
      headers['Accept-Encoding'] = 'gzip, deflate, br';
      headers['Referer'] = `https://www.reddit.com/r/${subreddit}/`;
      headers['Origin'] = 'https://www.reddit.com';
      headers['DNT'] = '1';
      headers['Connection'] = 'keep-alive';
      headers['Upgrade-Insecure-Requests'] = '1';
      headers['Cache-Control'] = 'no-cache';
      headers['Pragma'] = 'no-cache';
      
      // Remove suspicious headers that might indicate automation
      delete headers['Sec-Fetch-Dest'];
      delete headers['Sec-Fetch-Mode'];
      delete headers['Sec-Fetch-Site'];

      logger.info(`Fetching Reddit JSON: ${url.toString()}`);

      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      // Check for rate limiting headers
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');
      
      if (rateLimitRemaining) {
        const remaining = parseInt(rateLimitRemaining, 10);
        logger.debug(`Reddit rate limit remaining: ${remaining} for r/${subreddit}`);
        
        // Log warning if rate limit is getting low
        if (remaining < 3) {
          logger.warn(`⚠️ Reddit rate limit getting low: ${remaining} requests remaining for r/${subreddit}`);
        }
      }
      
      if (rateLimitReset) {
        logger.debug(`Reddit rate limit resets at: ${rateLimitReset}`);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        
        // Handle 403 Forbidden - trigger circuit breaker
        if (response.status === 403) {
          this.handle403Error();
          logger.error(`Reddit API 403 error: ${errorText.substring(0, 200)}`);
          return {
            success: false,
            error: `Reddit API 403 Forbidden: ${errorText.substring(0, 100)}`,
          };
        }
        
        // Handle 429 Too Many Requests
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000; // Default 60s
          logger.warn(`Reddit rate limit hit. Waiting ${waitTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        logger.error(`Reddit API error: ${response.status} - ${errorText.substring(0, 200)}`);
        return {
          success: false,
          error: `Reddit API returned ${response.status}: ${errorText.substring(0, 100)}`,
        };
      }

      const json: RedditJSONResponse = await response.json();
      
      if (!json.data || !json.data.children) {
        return {
          success: false,
          error: 'Invalid Reddit JSON response structure',
        };
      }

      // Convert Reddit posts to RSS items
      const items = this.convertPostsToRSSItems(json.data.children.map(child => child.data));

      // Reset circuit breaker on successful request
      this.resetCircuitBreaker();

      const feed: RSSFeed = {
        title: `r/${subreddit}`,
        link: `${this.apiBaseUrl}/r/${subreddit}`,
        items,
      };

      logger.info(`✅ Fetched ${items.length} Reddit posts from r/${subreddit} via JSON API`);

      return {
        success: true,
        feed,
        items,
        after: json.data.after,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch Reddit JSON for r/${subreddit}:`, error);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Convert Reddit posts to RSS items
   */
  private convertPostsToRSSItems(posts: RedditPost[]): RSSItem[] {
    return posts.map(post => {
      // Use Reddit's internal ID (t3_xxxxx) as item ID
      const itemId = `reddit_${post.id}`;
      
      // Convert timestamp to Date
      const pubDate = new Date(post.created_utc * 1000);
      
      // Generate full URL for permalink
      const link = post.url.startsWith('http') 
        ? post.url 
        : `${this.apiBaseUrl}${post.permalink}`;

      // Create description from selftext or post info
      let description = '';
      if (post.selftext) {
        description = post.selftext.substring(0, 500); // Limit description length
      } else {
        description = `Score: ${post.score} | Comments: ${post.num_comments}`;
      }

      return {
        id: itemId,
        title: post.title,
        link,
        description,
        pubDate,
        author: post.author,
        guid: itemId,
        categories: [post.subreddit],
      };
    });
  }

  /**
   * Fetch feed from Reddit URL with intelligent fallback
   * Primary: OAuth API, Fallback: JSON public API
   */
  async fetchFeed(url: string): Promise<{
    success: boolean;
    feed?: RSSFeed;
    error?: string;
  }> {
    // Sanitize URL first
    const sanitizedUrl = sanitizeUrl(url);
    if (!sanitizedUrl) {
      logger.warn('Invalid Reddit URL provided, skipping');
      return { success: false, error: 'Invalid URL' };
    }

    // Check if this is actually a Reddit URL
    if (!this.isRedditUrl(sanitizedUrl)) {
      return { success: false, error: 'Not a Reddit URL' };
    }

    // Extract subreddit name
    const subreddit = this.extractSubreddit(sanitizedUrl);
    if (!subreddit) {
      return { success: false, error: 'Could not extract subreddit from URL' };
    }

    // Check circuit breaker (using normalized origin)
    if (this.isCircuitBreakerOpen()) {
      const remainingMinutes = Math.ceil((this.cbOpenUntil - Date.now()) / (60 * 1000));
      logger.warn(`Reddit circuit breaker is open. Skipping r/${subreddit} for ${remainingMinutes} more minutes`);
      return {
        success: false,
        error: `Circuit breaker open due to 403 errors. Try again in ${remainingMinutes} minutes`,
      };
    }

    // Try OAuth API first if available and enabled
    const useRedditAPI = process.env.USE_REDDIT_API === 'true';
    if (useRedditAPI && this.apiProvider && this.tokenManager) {
      try {
        // Get valid token from Token Manager
        const accessToken = await this.tokenManager.getValidToken('reddit');
        
        if (accessToken) {
          logger.info(`🔄 Using Reddit OAuth API for r/${subreddit} with Token Manager`);
          const items = await this.apiProvider.fetchNew(subreddit);
          
          // Reset circuit breaker on successful OAuth request
          this.resetCircuitBreaker();
          
          const feed: RSSFeed = {
            title: `r/${subreddit}`,
            link: `${this.apiBaseUrl}/r/${subreddit}`,
            items,
          };

          logger.info(`✅ Fetched ${items.length} Reddit posts from r/${subreddit} via OAuth API`);
          
          return { success: true, feed };
        } else {
          logger.warn(`No valid OAuth token available for r/${subreddit}, falling back to JSON API`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Handle 403 errors by opening circuit breaker
        if (errorMessage.includes('auth_failed:403') || errorMessage.includes('auth_failed:401')) {
          this.handle403Error();
          logger.error(`Reddit OAuth authentication failed: ${errorMessage}`);
        } else {
          logger.warn(`Reddit OAuth API failed for r/${subreddit}, falling back to JSON API: ${errorMessage}`);
        }
      }
    }

    // Fallback to JSON API (always available)
    const useJsonFallback = process.env.USE_REDDIT_JSON_FALLBACK !== 'false';
    if (useJsonFallback) {
      logger.info(`🔄 Using Reddit JSON API for r/${subreddit}`);
      const result = await this.fetchSubreddit(subreddit);
      
      if (result.success && result.feed) {
        return { success: true, feed: result.feed };
      }
      
      return { success: false, error: result.error || 'Failed to fetch Reddit feed' };
    }

    return { success: false, error: 'Both OAuth and JSON APIs are disabled' };
  }
}

// Singleton instance
export const redditService = new RedditService();

