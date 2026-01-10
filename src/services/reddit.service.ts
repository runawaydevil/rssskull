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
        // Removed Client ID logging - even partial exposure is a security risk
      } catch (error) {
        logger.error('Failed to initialize Reddit OAuth API provider:', error);
      }
    } else {
      logger.warn('Reddit OAuth credentials not configured - using JSON fallback only');
      // Removed specific environment variable names from log to prevent information disclosure
      logger.warn('Reddit OAuth credentials are required for API access');
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
      
      // Exclude known fake/problematic domains (reddit.com.br is not official Reddit)
      if (hostname.includes('reddit.com.br')) {
        return false;
      }
      
      // Detect official Reddit URLs (with or without www, with or without .rss/.json extension)
      // Accept: reddit.com, www.reddit.com, oauth.reddit.com (for API)
      const isOfficialReddit = 
        hostname === 'reddit.com' || 
        hostname === 'www.reddit.com' ||
        hostname === 'oauth.reddit.com' ||
        hostname.endsWith('.reddit.com'); // subdomains like old.reddit.com
      
      // Must have /r/subreddit in path
      const hasSubreddit = urlObj.pathname.startsWith('/r/') || urlObj.pathname.includes('/r/');
      
      return isOfficialReddit && hasSubreddit;
    } catch {
      return false;
    }
  }

  /**
   * Extract subreddit name from URL
   * Handles various formats: /r/subreddit, r/subreddit, reddit.com/r/subreddit, etc.
   */
  extractSubreddit(url: string): string | null {
    try {
      // Try URL object first (most reliable)
      try {
        const urlObj = new URL(url);
        // Match /r/subreddit with optional trailing path or query
        const match = urlObj.pathname.match(/\/r\/([a-zA-Z0-9_]+)/);
        if (match && match[1]) {
          return match[1];
        }
      } catch {
        // URL parsing failed, try regex fallback
      }
      
      // Fallback: regex match for reddit.com/r/subreddit pattern
      const regexMatch = url.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)/i);
      if (regexMatch && regexMatch[1]) {
        return regexMatch[1];
      }
      
      // Fallback: match /r/subreddit at start or anywhere
      const rMatch = url.match(/\/r\/([a-zA-Z0-9_]+)/);
      if (rMatch && rMatch[1]) {
        return rMatch[1];
      }
      
      return null;
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
      
      // User-Agent no formato recomendado pelo Reddit
      headers['User-Agent'] = 'node:com.pablomurad.rssskull:0.5.0 (by /u/rasputinixx)';
      headers['Accept'] = 'application/json';
      headers['Accept-Language'] = 'en-US,en;q=0.9,pt;q=0.8';
      headers['Accept-Encoding'] = 'gzip, deflate, br';

      // Remover headers que podem causar bloqueio
      delete headers['Referer'];
      delete headers['Origin'];
      delete headers['DNT'];
      delete headers['Connection'];
      delete headers['Upgrade-Insecure-Requests'];
      delete headers['Cache-Control'];
      delete headers['Pragma'];
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
        // USAR CLONE para não consumir o body original
        const errorCopy = response.clone();
        let errorText = '';
        try {
          errorText = await errorCopy.text();
        } catch {
          errorText = 'Unknown error';
        }
        
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
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
          logger.warn(`Reddit rate limit hit. Waiting ${waitTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        logger.error(`Reddit API error: ${response.status} - ${errorText.substring(0, 200)}`);
        return {
          success: false,
          error: `Reddit API returned ${response.status}: ${errorText.substring(0, 100)}`,
        };
      }

      // Validar Content-Type ANTES de parsear JSON
      const contentType = response.headers.get('content-type') || '';
      if (!/application\/json/i.test(contentType)) {
        const copy = response.clone();
        let snippet = '';
        try { snippet = (await copy.text()).substring(0, 400); } catch {}
        
        logger.error(`Reddit returned non-JSON content: ${contentType}`);
        logger.error(`Body snippet: ${snippet}`);
        
        return {
          success: false,
          error: `Reddit returned ${contentType} instead of JSON`,
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

      // Create description from selftext or detect media
      let description = '';
      if (post.selftext && post.selftext.trim()) {
        description = post.selftext.substring(0, 500); // Limit description length
      } else {
        // Check if post contains media
        const isImage = post.url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        const isVideo = post.url.match(/\.(mp4|webm|gifv)$/i) || post.url.includes('v.redd.it') || post.url.includes('youtube.com') || post.url.includes('youtu.be');
        
        if (isImage) {
          description = '🖼️ Image';
        } else if (isVideo) {
          description = '🎥 Video';
        } else if (post.url !== `${this.apiBaseUrl}${post.permalink}`) {
          // External link
          description = '🔗 Link';
        }
      }

      // Always append the original Reddit post link
      const redditPostLink = `${this.apiBaseUrl}${post.permalink}`;
      if (description) {
        description += `\n\n💬 [Reddit Discussion](${redditPostLink})`;
      } else {
        description = `💬 [Reddit Discussion](${redditPostLink})`;
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
      logger.error(`Failed to extract subreddit from URL: ${sanitizedUrl}`);
      return { success: false, error: 'Could not extract subreddit from URL' };
    }
    
    logger.debug(`Extracted subreddit: r/${subreddit} from URL: ${sanitizedUrl}`);

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
        
        // Handle 403/401 errors - may indicate private subreddit or auth issues
        if (errorMessage.includes('auth_failed:403') || errorMessage.includes('auth_failed:401')) {
          logger.warn(`Reddit OAuth auth failed (${errorMessage}) for r/${subreddit} - may be private subreddit or auth issue`);
          
          // For 403 on subreddit (private/restricted), try JSON fallback first before opening circuit breaker
          // Only open CB if JSON fallback also fails
          const useJsonFallback = process.env.USE_REDDIT_JSON_FALLBACK !== 'false';
          if (useJsonFallback && !this.isCircuitBreakerOpen()) {
            logger.info(`Attempting JSON API fallback for r/${subreddit} after OAuth 403`);
            // Will try fallback below, don't return error yet
          } else {
            // CB already open or JSON disabled - handle 403 error
            this.handle403Error();
            const remainingMinutes = Math.ceil((this.cbOpenUntil - Date.now()) / (60 * 1000));
            return {
              success: false,
              error: `OAuth failed: Subreddit may be private/restricted. Circuit breaker: ${remainingMinutes} minutes`,
            };
          }
        } else {
          logger.warn(`Reddit OAuth API failed for r/${subreddit}, falling back to JSON API: ${errorMessage}`);
        }
      }
    }

    // Fallback to JSON API (always available) - BUT check CB first
    const useJsonFallback = process.env.USE_REDDIT_JSON_FALLBACK !== 'false';
    if (useJsonFallback) {
      // Check if CB is open before trying fallback (unless we're here because of 403 on private subreddit)
      if (this.isCircuitBreakerOpen()) {
        const remainingMinutes = Math.ceil((this.cbOpenUntil - Date.now()) / (60 * 1000));
        logger.warn(`Circuit breaker is open, skipping JSON fallback for r/${subreddit}. Remaining: ${remainingMinutes} minutes`);
        return {
          success: false,
          error: `Circuit breaker open. Try again in ${remainingMinutes} minutes`,
        };
      }
      
      logger.info(`🔄 Using Reddit JSON API fallback for r/${subreddit}`);
      const result = await this.fetchSubreddit(subreddit);
      
      if (result.success && result.feed) {
        // NEW: If JSON API succeeds but feed seems stale, try OAuth as fallback
        const firstPost = result.feed.items[0];
        
        // Check if OAuth fallback should be attempted
        const shouldTryOAuth = this.apiProvider && 
                               this.tokenManager && 
                               firstPost?.pubDate &&
                               (Date.now() - firstPost.pubDate.getTime()) > (60 * 60 * 1000); // 1 hour

        if (shouldTryOAuth && firstPost.pubDate) {
          const ageMinutes = Math.round((Date.now() - firstPost.pubDate.getTime()) / 60000);
          logger.warn(`⚠️ JSON API returned stale data (>${ageMinutes} min old)`);
          logger.info(`🔄 Attempting OAuth API fallback for fresher data...`);
          
          try {
            const accessToken = await this.tokenManager!.getValidToken('reddit');
            if (accessToken) {
              const oauthItems = await this.apiProvider!.fetchNew(subreddit);
              
              if (oauthItems.length > 0) {
                const oauthFirstPost = oauthItems[0];
                logger.info(`✅ OAuth returned ${oauthItems.length} posts (vs ${result.feed.items.length} from JSON)`);
                
                // Use OAuth data if it has newer posts
                if (oauthFirstPost?.pubDate && oauthFirstPost.pubDate > firstPost.pubDate) {
                  logger.info(`✅ OAuth has newer data (${oauthFirstPost.pubDate.toISOString()} vs ${firstPost.pubDate.toISOString()}), using OAuth feed`);
                  return { 
                    success: true, 
                    feed: {
                      title: `r/${subreddit}`,
                      link: `${this.apiBaseUrl}/r/${subreddit}`,
                      items: oauthItems,
                    }
                  };
                } else if (oauthFirstPost?.pubDate && oauthFirstPost.pubDate.getTime() === firstPost.pubDate.getTime()) {
                  logger.info(`⚠️ OAuth returned same timestamp, keeping JSON data`);
                }
              }
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            logger.warn(`OAuth fallback failed, using JSON data: ${errorMsg}`);
          }
        }
        
        return { success: true, feed: result.feed };
      }
      
      // If JSON fallback also failed, check if subreddit might be private
      logger.warn(`Both OAuth and JSON API failed for r/${subreddit}`);
      return { 
        success: false, 
        error: result.error || `Failed to fetch Reddit feed. Subreddit r/${subreddit} may be private or restricted.` 
      };
    }

    logger.error(`Both OAuth and JSON APIs are disabled for r/${subreddit}`);
    return { success: false, error: 'Both OAuth and JSON APIs are disabled. Enable at least one method.' };
  }
}

// Singleton instance
export const redditService = new RedditService();

