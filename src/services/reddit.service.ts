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
      
      return (
        (hostname === 'reddit.com' || hostname === 'www.reddit.com') &&
        urlObj.pathname.startsWith('/r/')
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
      const match = urlObj.pathname.match(/^\/r\/([a-zA-Z0-9_]+)/);
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

      // Apply rate limiting
      await rateLimiterService.waitIfNeeded(url.toString());

      // Get realistic browser headers
      const headers = userAgentService.getHeaders(url.toString());
      
      // Add Reddit-specific User-Agent
      headers['User-Agent'] = 'RSSSkullBot/0.2 (+https://github.com/runawaydevil/rssskull)';

      logger.info(`Fetching Reddit JSON: ${url.toString()}`);

      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error(`Reddit API error: ${response.status} - ${errorText}`);
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

      logger.info(`Fetched ${items.length} Reddit posts from r/${subreddit}`);

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

