import { logger } from '../utils/logger/logger.service.js';
import { userAgentService } from '../utils/user-agent.service.js';
import { rateLimiterService } from '../utils/rate-limiter.service.js';
import type { RSSItem, RSSFeed } from './rss.service.js';

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
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

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
        logger.debug(`Reddit rate limit remaining: ${rateLimitRemaining}`);
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

