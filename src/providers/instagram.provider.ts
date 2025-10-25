import { logger } from '../utils/logger/logger.service.js';
import type { SocialBridgeProvider } from './social-provider.interface.js';

/**
 * Instagram provider for RSS-Bridge
 * Handles Instagram user and hashtag feeds
 */
export class InstagramProvider implements SocialBridgeProvider {
  name = 'instagram';
  private readonly bridgeHost: string;
  private readonly healthCheckUsername = 'instagram'; // Default user for health checks

  constructor() {
    // Get RSS-Bridge host from config
    this.bridgeHost = process.env.RSS_BRIDGE_HOST || 'http://rss-bridge:80';
  }

  /**
   * Check if URL is an Instagram URL
   * NOTE: Currently disabled - requires cookies
   */
  canHandle(_inputUrl: string): boolean {
    // Disabled for now - requires session management
    return false;
    
    /* Original implementation:
    try {
      const url = new URL(inputUrl);
      const hostname = url.hostname.toLowerCase();
      
      return hostname === 'instagram.com' || hostname === 'www.instagram.com';
    } catch {
      return false;
    }
    */
  }

  /**
   * Build RSS-Bridge URL for Instagram
   * Supports: users and hashtags
   */
  buildFeedUrl(inputUrl: string): string {
    try {
      const url = new URL(inputUrl);
      const pathname = url.pathname;
      
      // Instagram user: instagram.com/username
      const userMatch = pathname.match(/^\/([a-zA-Z0-9._]+)\/?$/);
      if (userMatch) {
        const username = userMatch[1];
        return `${this.bridgeHost}/?action=display&bridge=Instagram&u=${username}&format=Atom`;
      }
      
      // Instagram hashtag: instagram.com/tags/hashtag
      const hashtagMatch = pathname.match(/^\/tags\/([a-zA-Z0-9_]+)\/?$/);
      if (hashtagMatch) {
        const hashtag = hashtagMatch[1];
        return `${this.bridgeHost}/?action=display&bridge=Instagram&h=${hashtag}&format=Atom`;
      }
      
      // Fallback: try to extract username anyway
      const fallbackMatch = pathname.match(/\/([a-zA-Z0-9._]+)/);
      if (fallbackMatch) {
        const username = fallbackMatch[1];
        logger.warn(`Instagram URL matched as user (fallback): ${username}`);
        return `${this.bridgeHost}/?action=display&bridge=Instagram&u=${username}&format=Atom`;
      }
      
      throw new Error(`Could not parse Instagram URL: ${inputUrl}`);
    } catch (error) {
      logger.error(`Failed to build Instagram feed URL for ${inputUrl}:`, error);
      throw error;
    }
  }

  /**
   * Health check using a known Instagram account
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testUrl = `${this.bridgeHost}/?action=display&bridge=Instagram&u=${this.healthCheckUsername}&format=Atom`;
      
      const response = await fetch(testUrl, {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      
      if (!response.ok) {
        logger.warn(`Instagram bridge health check failed: ${response.status}`);
        return false;
      }
      
      const contentType = response.headers.get('content-type');
      const isFeed = contentType?.includes('xml') || contentType?.includes('atom');
      
      if (!isFeed) {
        logger.warn(`Instagram bridge returned unexpected content type: ${contentType}`);
        return false;
      }
      
      logger.debug('Instagram bridge health check passed');
      return true;
    } catch (error) {
      logger.error('Instagram bridge health check error:', error);
      return false;
    }
  }

  /**
   * Check authentication status for Instagram
   * NOTE: Instagram requires cookies but we're not using it for now
   */
  async authStatus(): Promise<{ ok: boolean; details?: string }> {
    return {
      ok: false,
      details: 'Instagram is disabled - requires cookies/session management',
    };
  }

  /**
   * Get cache TTL for Instagram (1 hour)
   */
  getCacheTTL(): number {
    return 3600000; // 1 hour in milliseconds
  }

  /**
   * Get polling interval for Instagram (12 minutes)
   */
  getPollInterval(): number {
    return 12; // 12 minutes
  }

  /**
   * Get priority for Instagram (high priority = 1)
   */
  getPriority(): number {
    return 1; // High priority for social feeds
  }
}

