import { logger } from '../utils/logger/logger.service.js';
import { RedditTokenManager } from './reddit-token-manager.js';
import type { RSSItem } from './rss.service.js';

/**
 * Reddit API Provider using OAuth
 * Provides faster, more reliable access to Reddit through official API
 */
export class RedditAPIProvider {
  constructor(
    private tokenManager: RedditTokenManager,
    private userAgent = 'RSSSkullBot/0.2'
  ) {
    logger.info('RedditAPIProvider initialized (OAuth)');
  }

  /**
   * Fetch new posts from a subreddit using OAuth API
   */
  async fetchNew(subreddit: string, after?: string): Promise<RSSItem[]> {
    try {
      const token = await this.tokenManager.getToken();
      const url = new URL(`https://oauth.reddit.com/r/${subreddit}/new`);
      url.searchParams.set('limit', '100');
      
      if (after) {
        url.searchParams.set('after', after);
      }

      logger.debug(`Fetching Reddit OAuth: r/${subreddit}${after ? ` (after: ${after})` : ''}`);

      const res = await fetch(url.toString(), {
        headers: {
          'Authorization': `bearer ${token}`,
          'User-Agent': this.userAgent
        }
      });

      // Handle rate limiting
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') ?? 10);
        logger.warn(`Reddit OAuth rate limited, retry after ${retry}s`);
        throw new Error(`rate_limited:${retry}`);
      }

      // Handle authentication errors
      if (res.status === 401 || res.status === 403) {
        logger.error(`Reddit OAuth auth failed: ${res.status}`);
        throw new Error(`auth_failed:${res.status}`);
      }

      // Handle other errors
      if (!res.ok) {
        logger.error(`Reddit OAuth API failed: ${res.status}`);
        throw new Error(`reddit_api_fail:${res.status}`);
      }

      const json = await res.json();
      
      // Convert Reddit posts to RSS items
      const items: RSSItem[] = json.data.children.map((c: any) => ({
        id: c.data.name, // t3_xxx format
        title: c.data.title,
        link: `https://www.reddit.com${c.data.permalink}`,
        pubDate: new Date(c.data.created_utc * 1000),
        description: c.data.selftext || undefined,
        author: c.data.author,
        categories: [c.data.subreddit],
        guid: c.data.name,
      }));

      logger.info(`Reddit OAuth fetched ${items.length} items from r/${subreddit}`);
      
      return items;
    } catch (error) {
      logger.error(`Reddit OAuth fetch failed for r/${subreddit}:`, error);
      throw error;
    }
  }
}

