import { ConversionError, type URLConverter } from './converter.interface.js';

/**
 * Converter for Reddit URLs to RSS feeds
 * Supports:
 * - Subreddit URLs: reddit.com/r/subreddit -> reddit.com/r/subreddit.rss
 * - User URLs: reddit.com/u/username -> reddit.com/u/username.rss
 * - Both old.reddit.com and www.reddit.com variants
 */
export class RedditConverter implements URLConverter {
  readonly platform = 'reddit';

  private readonly REDDIT_DOMAINS = [
    'reddit.com',
    'www.reddit.com',
    'old.reddit.com',
    'new.reddit.com',
  ];

  private readonly SUBREDDIT_PATTERN =
    /^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)\/?(?:\?.*)?$/;
  private readonly USER_PATTERN =
    /^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/u(?:ser)?\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;

  canHandle(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      // Check if it's a Reddit domain
      if (!this.REDDIT_DOMAINS.includes(hostname)) {
        return false;
      }

      // Check if it matches subreddit or user pattern
      return this.SUBREDDIT_PATTERN.test(url) || this.USER_PATTERN.test(url);
    } catch {
      return false;
    }
  }

  async convert(url: string): Promise<string> {
    if (!this.canHandle(url)) {
      throw new ConversionError(
        'URL is not a valid Reddit subreddit or user URL',
        url,
        this.platform
      );
    }

    try {
      // Check for subreddit pattern
      const subredditMatch = url.match(this.SUBREDDIT_PATTERN);
      if (subredditMatch) {
        const subredditName = subredditMatch[1];
        return `https://www.reddit.com/r/${subredditName}.rss`;
      }

      // Check for user pattern
      const userMatch = url.match(this.USER_PATTERN);
      if (userMatch) {
        const username = userMatch[1];
        return `https://www.reddit.com/u/${username}.rss`;
      }

      throw new ConversionError('URL does not match expected Reddit patterns', url, this.platform);
    } catch (error) {
      if (error instanceof ConversionError) {
        throw error;
      }
      throw new ConversionError(
        `Failed to convert Reddit URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        url,
        this.platform,
        error instanceof Error ? error : undefined
      );
    }
  }

  async validate(rssUrl: string): Promise<boolean> {
    try {
      const response = await fetch(rssUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'RSS-Skull-Bot/2.0 (RSS Feed Validator)',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      // Reddit RSS feeds should return 200 and have content-type indicating XML/RSS
      if (!response.ok) {
        return false;
      }

      const contentType = response.headers.get('content-type');
      return contentType?.includes('xml') || contentType?.includes('rss') || false;
    } catch {
      // If validation fails (network error, timeout, etc.), assume invalid
      return false;
    }
  }

  /**
   * Extract subreddit name from a Reddit URL
   * @param url Reddit URL
   * @returns Subreddit name or null if not a subreddit URL
   */
  extractSubredditName(url: string): string | null {
    const match = url.match(this.SUBREDDIT_PATTERN);
    return match?.[1] ?? null;
  }

  /**
   * Extract username from a Reddit user URL
   * @param url Reddit user URL
   * @returns Username or null if not a user URL
   */
  extractUsername(url: string): string | null {
    const match = url.match(this.USER_PATTERN);
    return match?.[1] ?? null;
  }
}
