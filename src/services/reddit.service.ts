import { logger } from '../utils/logger/logger.service.js';
import { userAgentService } from '../utils/user-agent.service.js';
import { rateLimiterService } from '../utils/rate-limiter.service.js';
import type { RSSItem, RSSFeed } from './rss.service.js';
import { RedditTokenManager } from './reddit-token-manager.js';
import { RedditAPIProvider } from './reddit-api-provider.js';

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
  private cbOpenUntil = 0; // Circuit breaker: timestamp when it closes
  
  /**
   * Initialize OAuth API provider if credentials are available
   */
  private initializeAPIProvider(): void {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    const username = process.env.REDDIT_USERNAME;
    const password = process.env.REDDIT_PASSWORD;
    
    if (clientId && clientSecret && username && password) {
      try {
        const tokenManager = new RedditTokenManager(clientId, clientSecret, username, password);
        this.apiProvider = new RedditAPIProvider(tokenManager);
        logger.info('Reddit OAuth API provider initialized');
      } catch (error) {
        logger.error('Failed to initialize Reddit OAuth API provider:', error);
      }
    } else {
      logger.info('Reddit OAuth credentials not configured, using public JSON API only');
    }
  }
  
  constructor() {
    this.initializeAPIProvider();
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
   * Fetch new posts from Reddit using public JSON API (fallback)
   */
  private async fetchPublicJSON(subreddit: string, after?: string): Promise<RSSItem[]> {
    const url = new URL(`${this.apiBaseUrl}/r/${subreddit}/new.json`);
    url.searchParams.set('limit', '100');
    
    if (after) {
      url.searchParams.set('after', after);
    }

    // Apply rate limiting with extra delay for Reddit
    await rateLimiterService.waitIfNeeded(url.toString());
    
    // Additional delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 3000));

    const headers = userAgentService.getHeaders(url.toString());
    headers['Accept'] = 'application/json, text/javascript, */*; q=0.01';
    headers['Accept-Language'] = 'en-US,en;q=0.9';
    headers['Referer'] = `https://www.reddit.com/r/${subreddit}/`;

    logger.debug(`Fetching Reddit public JSON: r/${subreddit}${after ? ` (after: ${after})` : ''}`);

    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (response.status === 429) {
      const retry = Number(response.headers.get('retry-after') ?? 10);
      logger.warn(`Reddit public JSON rate limited, retry after ${retry}s`);
      throw new Error(`rate_limited:${retry}`);
    }

    if (!response.ok) {
      logger.error(`Reddit public JSON API failed: ${response.status}`);
      throw new Error(`reddit_public_fail:${response.status}`);
    }

    const json: RedditJSONResponse = await response.json();
    
    return json.data.children.map((c: any) => ({
      id: c.data.name,
      title: c.data.title,
      link: `https://www.reddit.com${c.data.permalink}`,
      pubDate: new Date(c.data.created_utc * 1000),
      description: c.data.selftext || undefined,
      author: c.data.author,
      guid: c.data.name,
      categories: [c.data.subreddit],
    }));
  }

  /**
   * Fetch new posts from Reddit (OAuth API with fallback to public JSON)
   */
  async fetchNew(subreddit: string, after?: string): Promise<RSSItem[]> {
    const now = Date.now();
    const useAPI = process.env.USE_REDDIT_API === 'true' && now >= this.cbOpenUntil;

    try {
      // Try OAuth API if enabled and circuit breaker is closed
      if (useAPI && this.apiProvider) {
        const items = await this.apiProvider.fetchNew(subreddit, after);
        // Success - close circuit breaker
        this.cbOpenUntil = 0;
        logger.info(`Reddit OAuth API success for r/${subreddit}`);
        return items;
      }
      
      // Fallback to public JSON (or if API is disabled)
      logger.debug(`Using Reddit public JSON for r/${subreddit}`);
      return await this.fetchPublicJSON(subreddit, after);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      
      // Auth failures - open circuit breaker
      if (msg.startsWith('auth_failed') || msg.startsWith('reddit_oauth_failed')) {
        this.cbOpenUntil = now + 10 * 60_000; // Open for 10 minutes
        logger.warn(`Reddit OAuth auth failed, opening circuit breaker for 10 minutes`);
        
        if (process.env.USE_REDDIT_JSON_FALLBACK === 'true') {
          logger.info(`Falling back to public JSON for r/${subreddit}`);
          return await this.fetchPublicJSON(subreddit, after);
        }
      }
      
      // Rate limiting - propagate for scheduler to handle
      if (msg.startsWith('rate_limited')) {
        throw err;
      }
      
      throw err;
    }
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
    try {
      const url = new URL(`${this.apiBaseUrl}/r/${subreddit}/new.json`);
      url.searchParams.set('limit', this.defaultLimit.toString());
      
      if (after) {
        url.searchParams.set('after', after);
      }

      // Apply rate limiting with extra delay for Reddit
      await rateLimiterService.waitIfNeeded(url.toString());
      
      // Additional delay to avoid rate limiting (Reddit has strict limits)
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay for better safety

      // Get realistic browser headers (User-Agent rotation handled automatically)
      const headers = userAgentService.getHeaders(url.toString());
      
      // Use Accept header that looks like a browser JSON request
      headers['Accept'] = 'application/json, text/javascript, */*; q=0.01';
      headers['Accept-Language'] = 'en-US,en;q=0.9';
      headers['Accept-Encoding'] = 'gzip, deflate, br';
      headers['Referer'] = `https://www.reddit.com/r/${subreddit}/`;
      headers['Origin'] = 'https://www.reddit.com';
      headers['DNT'] = '1';
      headers['Connection'] = 'keep-alive';
      headers['Sec-Fetch-Dest'] = 'empty';
      headers['Sec-Fetch-Mode'] = 'cors';
      headers['Sec-Fetch-Site'] = 'same-origin';

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
   * Fetch feed from Reddit URL
   */
  async fetchFeed(url: string): Promise<{
    success: boolean;
    feed?: RSSFeed;
    error?: string;
  }> {
    if (!this.isRedditUrl(url)) {
      return {
        success: false,
        error: 'Not a Reddit URL',
      };
    }

    const subreddit = this.extractSubreddit(url);
    if (!subreddit) {
      return {
        success: false,
        error: 'Could not extract subreddit from URL',
      };
    }

    const result = await this.fetchSubreddit(subreddit);
    
    if (!result.success || !result.feed) {
      return {
        success: false,
        error: result.error || 'Failed to fetch Reddit feed',
      };
    }

    return {
      success: true,
      feed: result.feed,
    };
  }
}

// Singleton instance
export const redditService = new RedditService();

