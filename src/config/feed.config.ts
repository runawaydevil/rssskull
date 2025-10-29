/**
 * Feed configuration settings
 * Centralized configuration for feed checking intervals, rate limiting, and domain-specific settings
 */

export interface FeedDomainConfig {
  // Rate limiting settings
  rateLimit: {
    maxRequests: number;
    windowMs: number;
    minDelayMs: number;
    adaptiveEnabled?: boolean;  // Enable adaptive throttling
    successThreshold?: number;   // Success rate threshold for adjustment
    failurePenalty?: number;     // Penalty multiplier for failures
    successReward?: number;     // Reward multiplier for successes
  };
  // Feed checking interval
  checkIntervalMinutes: number;
  // Description for logging
  description: string;
  // Special handling flags
  flags?: {
    requiresUserAgent?: boolean;
    requiresReferrer?: boolean;
    requiresCookies?: boolean;
    isHighVolume?: boolean;
  };
}

export const FEED_DOMAIN_CONFIGS: Record<string, FeedDomainConfig> = {
  // Reddit - Optimized rate limiting for reliable polling
  'reddit.com': {
    rateLimit: {
      maxRequests: 10, // 10 requests per 10 minutes (increased for better coverage)
      windowMs: 600000, // 10 minutes
      minDelayMs: 300000, // 5 minutes minimum between requests per feed (reduced from 9 to allow more frequent checks)
      adaptiveEnabled: true,
      successThreshold: 0.9,
      failurePenalty: 1.2,   // 20% penalty (reduced from 50%)
      successReward: 0.95,   // 95% reward (faster recovery)
    },
    checkIntervalMinutes: 10, // Check every 10 minutes with jitter
    description: 'Reddit feeds (optimized rate limiting for reliable polling)',
    flags: {
      requiresUserAgent: true,
      isHighVolume: true,
    },
  },

  // YouTube - Moderate rate limiting
  'youtube.com': {
    rateLimit: {
      maxRequests: 20,
      windowMs: 60000,
      minDelayMs: 2000,
    },
    checkIntervalMinutes: 10,
    description: 'YouTube feeds',
    flags: {
      requiresUserAgent: true,
    },
  },

  // Twitter/X - Moderate rate limiting
  'twitter.com': {
    rateLimit: {
      maxRequests: 30,
      windowMs: 60000,
      minDelayMs: 1500,
    },
    checkIntervalMinutes: 5,
    description: 'Twitter feeds',
  },

  'x.com': {
    rateLimit: {
      maxRequests: 30,
      windowMs: 60000,
      minDelayMs: 1500,
    },
    checkIntervalMinutes: 5,
    description: 'X (Twitter) feeds',
  },

  // GitHub - Conservative for releases
  'github.com': {
    rateLimit: {
      maxRequests: 40,
      windowMs: 60000,
      minDelayMs: 1000,
    },
    checkIntervalMinutes: 30, // Releases don't change often
    description: 'GitHub feeds',
  },

  // Medium - Moderate
  'medium.com': {
    rateLimit: {
      maxRequests: 25,
      windowMs: 60000,
      minDelayMs: 1500,
    },
    checkIntervalMinutes: 15,
    description: 'Medium feeds',
  },

  // Dev.to - Moderate
  'dev.to': {
    rateLimit: {
      maxRequests: 30,
      windowMs: 60000,
      minDelayMs: 1000,
    },
    checkIntervalMinutes: 10,
    description: 'Dev.to feeds',
  },

  // Hacker News - Frequent updates
  'hnrss.org': {
    rateLimit: {
      maxRequests: 40,
      windowMs: 60000,
      minDelayMs: 1000,
    },
    checkIntervalMinutes: 5,
    description: 'Hacker News feeds',
  },

  // TechCrunch and similar news sites
  'techcrunch.com': {
    rateLimit: {
      maxRequests: 30,
      windowMs: 60000,
      minDelayMs: 1000,
    },
    checkIntervalMinutes: 5,
    description: 'TechCrunch feeds',
  },

  'feeds.feedburner.com': {
    rateLimit: {
      maxRequests: 40,
      windowMs: 60000,
      minDelayMs: 1000,
    },
    checkIntervalMinutes: 5,
    description: 'FeedBurner feeds',
  },

  // Default configuration for unknown domains
  default: {
    rateLimit: {
      maxRequests: 50,
      windowMs: 60000,
      minDelayMs: 500,
    },
    checkIntervalMinutes: 5,
    description: 'Default configuration',
  },
};

/**
 * Get configuration for a specific domain
 */
export function getFeedConfigForDomain(url: string): FeedDomainConfig {
  const domain = extractDomain(url);
  
  // Check for exact match first
  const exactMatch = FEED_DOMAIN_CONFIGS[domain];
  if (exactMatch) {
    return exactMatch;
  }

  // Check for partial matches
  for (const [configDomain, config] of Object.entries(FEED_DOMAIN_CONFIGS)) {
    if (configDomain !== 'default' && domain.includes(configDomain)) {
      return config;
    }
  }

  // Special cases
  if (url.includes('hacker-news') || url.includes('ycombinator')) {
    const hnConfig = FEED_DOMAIN_CONFIGS['hnrss.org'];
    if (hnConfig) {
      return hnConfig;
    }
  }

  // Return default
  const defaultConfig = FEED_DOMAIN_CONFIGS.default;
  if (!defaultConfig) {
    // Fallback if default is somehow missing
    return {
      rateLimit: {
        maxRequests: 50,
        windowMs: 60000,
        minDelayMs: 500,
      },
      checkIntervalMinutes: 5,
      description: 'Fallback default configuration',
    };
  }
  
  return defaultConfig;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
}

/**
 * Get all configured domains
 */
export function getAllFeedDomains(): string[] {
  return Object.keys(FEED_DOMAIN_CONFIGS).filter(domain => domain !== 'default');
}

/**
 * Check if a domain requires special handling
 */
export function requiresSpecialHandling(url: string): boolean {
  const config = getFeedConfigForDomain(url);
  return !!(config.flags?.requiresUserAgent || 
           config.flags?.requiresReferrer || 
           config.flags?.requiresCookies ||
           config.flags?.isHighVolume);
}

/**
 * Get recommended headers for a domain
 */
export function getRecommendedHeaders(url: string): Record<string, string> {
  const config = getFeedConfigForDomain(url);
  const headers: Record<string, string> = {
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
  };

  if (config.flags?.requiresUserAgent) {
    headers['User-Agent'] = 'RSS-Skull-Bot/0.01 (+https://github.com/runawaydevil/rssskull)';
  }

  if (config.flags?.requiresReferrer) {
    headers['Referer'] = extractDomain(url);
  }

  return headers;
}