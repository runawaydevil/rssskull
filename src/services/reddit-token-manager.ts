import { logger } from '../utils/logger/logger.service.js';

/**
 * Reddit OAuth Token Manager
 * Manages OAuth tokens for Reddit API using password grant (Script App)
 * Automatically refreshes tokens before expiration
 */
export class RedditTokenManager {
  private state: { accessToken: string; expiresAt: number } | null = null;
  private refreshing = Promise.resolve();

  constructor(
    private clientId: string,
    private clientSecret: string,
    private username: string,
    private password: string,
    private userAgent = 'RSSSkullBot/0.2'
  ) {
    logger.info('RedditTokenManager initialized');
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getToken(): Promise<string> {
    const now = Date.now();
    
    // Refresh if token is expired or will expire within 1 minute
    if (!this.state || now > this.state.expiresAt - 60_000) {
      await (this.refreshing = this.refreshing.then(() => this.refresh(now)));
    }
    
    return this.state!.accessToken;
  }

  /**
   * Refresh the access token
   */
  private async refresh(now: number): Promise<void> {
    try {
      logger.debug('Refreshing Reddit OAuth token');
      
      const body = new URLSearchParams({
        grant_type: 'password',
        username: this.username,
        password: this.password,
      });

      const res = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent
        },
        body
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error(`Reddit OAuth failed: ${res.status} - ${errorText}`);
        throw new Error(`reddit_oauth_failed:${res.status}`);
      }

      const json: any = await res.json();
      const expiresIn = Number(json.expires_in ?? 3600);
      
      this.state = {
        accessToken: json.access_token as string,
        expiresAt: now + (expiresIn * 1000),
      };

      logger.info(`Reddit OAuth token refreshed, expires in ${expiresIn}s`);
    } catch (error) {
      logger.error('Failed to refresh Reddit OAuth token:', error);
      throw error;
    }
  }

  /**
   * Check if token is valid
   */
  isValid(): boolean {
    if (!this.state) return false;
    return Date.now() < this.state.expiresAt;
  }
}

