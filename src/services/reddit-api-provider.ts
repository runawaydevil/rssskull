import { logger } from '../utils/logger/logger.service.js';
import { RedditTokenManager } from './reddit-token-manager.js';
import type { RSSItem } from './rss.service.js';

/**
 * Reddit API Provider using OAuth
 * Provides faster, more reliable access to Reddit through official API
 */
export class RedditAPIProvider {
  constructor(
    private tokenManager: RedditTokenManager
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
          'User-Agent': 'node:com.pablomurad.rssskull:0.5.0 (by /u/rasputinixx)'
        }
      });

      // Verificar Content-Type ANTES de parsear
      const contentType = res.headers.get('content-type') || '';

      // Handle rate limiting
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') ?? 10);
        logger.warn(`Reddit OAuth rate limited, retry after ${retry}s`);
        const err = new Error(`rate_limited:${retry}`);
        (err as any).status = 429;
        throw err;
      }

      // Handle authentication errors - USAR CLONE para ler body
      if (res.status === 401 || res.status === 403) {
        const copy = res.clone();
        let snippet = '';
        try {
          const text = await copy.text();
          snippet = text.substring(0, 600);
        } catch {}
        
        // Sanitize snippet before logging to prevent token leaks
        const { sanitizeString } = await import('../utils/security/sanitizer.js');
        const sanitizedSnippet = sanitizeString(snippet);
        
        logger.error(`Reddit OAuth auth failed: ${res.status} - Content-Type: ${contentType}`);
        logger.error(`Response body snippet: ${sanitizedSnippet}`);
        
        const err = new Error(`auth_failed:${res.status}`);
        (err as any).status = res.status;
        throw err;
      }

      // Handle other errors
      if (!res.ok) {
        const copy = res.clone();
        let snippet = '';
        try {
          const text = await copy.text();
          snippet = text.substring(0, 400);
        } catch {}
        
        // Sanitize snippet before logging
        const { sanitizeString } = await import('../utils/security/sanitizer.js');
        const sanitizedSnippet = sanitizeString(snippet);
        
        logger.error(`Reddit OAuth API failed: ${res.status} - Content-Type: ${contentType}`);
        logger.error(`Response body snippet: ${sanitizedSnippet}`);
        
        const err = new Error(`reddit_api_fail:${res.status}`);
        (err as any).status = res.status;
        throw err;
      }

      // Validar que é JSON antes de parsear
      if (!/application\/json/i.test(contentType)) {
        const copy = res.clone();
        let snippet = '';
        try { snippet = (await copy.text()).substring(0, 400); } catch {}
        
        // Sanitize snippet before logging
        const { sanitizeString } = await import('../utils/security/sanitizer.js');
        const sanitizedSnippet = sanitizeString(snippet);
        
        logger.error(`Reddit OAuth returned non-JSON: ${contentType}`);
        logger.error(`Response body snippet: ${sanitizedSnippet}`);
        
        const err = new Error(`unexpected_content_type:${contentType}`);
        (err as any).status = 502;
        throw err;
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

