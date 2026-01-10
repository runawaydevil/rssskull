import { getFeedConfigForDomain } from '../config/feed.config.js';
import { logger } from './logger/logger.service.js';

export interface FeedIntervalConfig {
  intervalMinutes: number;
  description: string;
}

export interface DomainIntervalConfig {
  [domain: string]: FeedIntervalConfig;
}

export class FeedIntervalService {

  /**
   * Get the appropriate check interval for a feed URL
   */
  getIntervalForUrl(url: string): number {
    const feedConfig = getFeedConfigForDomain(url);
    const intervalMinutes = feedConfig.checkIntervalMinutes;
    
    logger.debug(`Feed interval for ${url}: ${intervalMinutes} minutes (${feedConfig.description})`);
    return intervalMinutes;
  }

  /**
   * Get configuration for a specific domain
   */
  getConfigForDomain(url: string): FeedIntervalConfig {
    const feedConfig = getFeedConfigForDomain(url);
    return {
      intervalMinutes: feedConfig.checkIntervalMinutes,
      description: feedConfig.description,
    };
  }



  /**
   * Get statistics about configured intervals
   */
  getStats(): Record<string, any> {
    // This would need to be implemented based on actual usage
    return {
      message: 'Feed interval statistics - see feed.config.ts for current configurations',
    };
  }

  /**
   * Check if a domain is considered high-frequency (needs longer intervals)
   */
  isHighFrequencyDomain(url: string): boolean {
    const feedConfig = getFeedConfigForDomain(url);
    
    // Consider domains with intervals >= 10 minutes as high-frequency
    return feedConfig.checkIntervalMinutes >= 10;
  }

  /**
   * Get recommended interval based on feed characteristics
   */
  getRecommendedInterval(url: string, feedType?: 'news' | 'blog' | 'social' | 'releases'): number {
    const baseInterval = this.getIntervalForUrl(url);
    
    // Adjust based on feed type
    switch (feedType) {
      case 'news':
        return Math.max(baseInterval, 3); // News feeds should be checked more frequently
      case 'blog':
        return Math.max(baseInterval, 15); // Blog feeds can be checked less frequently
      case 'social':
        return Math.max(baseInterval, 5); // Social feeds need regular checking
      case 'releases':
        return Math.max(baseInterval, 30); // Release feeds change infrequently
      default:
        return baseInterval;
    }
  }
}

// Singleton instance
export const feedIntervalService = new FeedIntervalService();