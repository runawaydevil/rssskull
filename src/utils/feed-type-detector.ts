import { logger } from './logger/logger.service.js';

export enum FeedType {
  RSS_2_0 = 'rss-2.0',
  ATOM_1_0 = 'atom-1.0',
  JSON_FEED_1_1 = 'json-feed-1.1',
  UNKNOWN = 'unknown',
}

export interface FeedTypeInfo {
  type: FeedType;
  confidence: number; // 0-1, where 1 is certain
  version?: string;
  features: string[];
  issues?: string[];
}

export class FeedTypeDetector {
  /**
   * Detect feed type from content and headers
   * Prefers Atom over RSS when both are detected with similar confidence
   */
  static detectFeedType(content: string, contentType?: string, url?: string): FeedTypeInfo {
    const results: FeedTypeInfo[] = [];

    // Check JSON Feed first (most specific)
    results.push(this.detectJsonFeed(content));
    
    // Check Atom 1.0
    results.push(this.detectAtomFeed(content));
    
    // Check RSS 2.0
    results.push(this.detectRssFeed(content));
    
    // Check content type hints
    if (contentType) {
      results.push(this.detectFromContentType(contentType));
    }
    
    // Check URL hints
    if (url) {
      results.push(this.detectFromUrl(url));
    }

    // Find the best result with Atom preference
    const bestResult = this.selectBestResult(results);

    logger.debug(`Feed type detection for ${url}: ${bestResult.type} (confidence: ${bestResult.confidence})`);
    
    return bestResult;
  }

  /**
   * Select the best result, preferring Atom over RSS when confidence is similar
   */
  private static selectBestResult(results: FeedTypeInfo[]): FeedTypeInfo {
    // Filter out unknown results
    const validResults = results.filter(r => r.type !== FeedType.UNKNOWN);
    
    if (validResults.length === 0) {
      return results[0] || { type: FeedType.UNKNOWN, confidence: 0, features: [] };
    }

    // Find the highest confidence (removed unused variable)
    
    // If we have both Atom and RSS with similar confidence, prefer Atom
    const atomResults = validResults.filter(r => r.type === FeedType.ATOM_1_0);
    const rssResults = validResults.filter(r => r.type === FeedType.RSS_2_0);
    
    // If Atom confidence is within 0.2 of RSS confidence, prefer Atom
    if (atomResults.length > 0 && rssResults.length > 0) {
      const bestAtom = atomResults.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
      const bestRss = rssResults.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
      
      if (bestAtom.confidence >= bestRss.confidence - 0.2) {
        logger.debug(`Preferring Atom (${bestAtom.confidence}) over RSS (${bestRss.confidence}) due to Atom preference policy`);
        return bestAtom;
      }
    }

    // Otherwise, return the result with highest confidence
    return validResults.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }

  /**
   * Detect JSON Feed 1.1
   */
  private static detectJsonFeed(content: string): FeedTypeInfo {
    let confidence = 0;
    const features: string[] = [];
    const issues: string[] = [];

    try {
      // Check if it's valid JSON
      const json = JSON.parse(content);
      
      if (typeof json === 'object' && json !== null) {
        confidence += 0.3;
        features.push('valid-json');

        // Check for JSON Feed specific fields
        if (json.version && json.version.startsWith('https://jsonfeed.org/version/')) {
          confidence += 0.4;
          features.push('json-feed-version');
        }

        if (json.title) {
          confidence += 0.1;
          features.push('has-title');
        }

        if (json.items && Array.isArray(json.items)) {
          confidence += 0.2;
          features.push('has-items-array');
        }

        // Check for required fields
        if (!json.title) {
          issues.push('missing-title');
          confidence -= 0.1;
        }

        if (!json.items || !Array.isArray(json.items)) {
          issues.push('missing-items-array');
          confidence -= 0.2;
        }
      }
    } catch (error) {
      // Not JSON
      confidence = 0;
    }

    return {
      type: confidence > 0.5 ? FeedType.JSON_FEED_1_1 : FeedType.UNKNOWN,
      confidence: Math.max(0, Math.min(1, confidence)),
      version: confidence > 0.5 ? '1.1' : undefined,
      features,
      issues: issues.length > 0 ? issues : undefined,
    };
  }

  /**
   * Detect Atom 1.0 feed
   */
  private static detectAtomFeed(content: string): FeedTypeInfo {
    let confidence = 0;
    const features: string[] = [];
    const issues: string[] = [];

    // Check for Atom namespace
    if (content.includes('xmlns="http://www.w3.org/2005/Atom"')) {
      confidence += 0.4;
      features.push('atom-namespace');
    }

    // Check for Atom root element
    if (content.includes('<feed')) {
      confidence += 0.3;
      features.push('atom-root-element');
    }

    // Check for Atom-specific elements
    if (content.includes('<entry>')) {
      confidence += 0.2;
      features.push('atom-entries');
    }

    if (content.includes('<updated>')) {
      confidence += 0.1;
      features.push('atom-updated-fields');
    }

    // Check for RSS elements (conflicts with Atom)
    if (content.includes('<rss') || content.includes('<channel>')) {
      confidence -= 0.3;
      issues.push('contains-rss-elements');
    }

    return {
      type: confidence > 0.5 ? FeedType.ATOM_1_0 : FeedType.UNKNOWN,
      confidence: Math.max(0, Math.min(1, confidence)),
      version: confidence > 0.5 ? '1.0' : undefined,
      features,
      issues: issues.length > 0 ? issues : undefined,
    };
  }

  /**
   * Detect RSS 2.0 feed
   */
  private static detectRssFeed(content: string): FeedTypeInfo {
    let confidence = 0;
    const features: string[] = [];
    const issues: string[] = [];

    // Check for RSS root element
    if (content.includes('<rss')) {
      confidence += 0.3;
      features.push('rss-root-element');
    }

    // Check for RSS version
    if (content.includes('version="2.0"')) {
      confidence += 0.2;
      features.push('rss-2.0-version');
    }

    // Check for channel element
    if (content.includes('<channel>')) {
      confidence += 0.2;
      features.push('rss-channel');
    }

    // Check for item elements
    if (content.includes('<item>')) {
      confidence += 0.2;
      features.push('rss-items');
    }

    // Check for common RSS fields
    if (content.includes('<title>') && content.includes('<link>')) {
      confidence += 0.1;
      features.push('rss-common-fields');
    }

    // Check for Atom elements (conflicts with RSS)
    if (content.includes('xmlns="http://www.w3.org/2005/Atom"') || content.includes('<feed')) {
      confidence -= 0.3;
      issues.push('contains-atom-elements');
    }

    return {
      type: confidence > 0.5 ? FeedType.RSS_2_0 : FeedType.UNKNOWN,
      confidence: Math.max(0, Math.min(1, confidence)),
      version: confidence > 0.5 ? '2.0' : undefined,
      features,
      issues: issues.length > 0 ? issues : undefined,
    };
  }

  /**
   * Detect feed type from Content-Type header
   */
  private static detectFromContentType(contentType: string): FeedTypeInfo {
    let confidence = 0;
    const features: string[] = [];
    let likelyType = FeedType.UNKNOWN;

    const lowerContentType = contentType.toLowerCase();

    // High confidence MIME types
    if (lowerContentType.includes('application/atom+xml')) {
      confidence = 0.9;
      likelyType = FeedType.ATOM_1_0;
      features.push('atom-mime-type');
    } else if (lowerContentType.includes('application/rss+xml')) {
      confidence = 0.9;
      likelyType = FeedType.RSS_2_0;
      features.push('rss-mime-type');
    } else if (lowerContentType.includes('application/feed+json')) {
      confidence = 0.9;
      likelyType = FeedType.JSON_FEED_1_1;
      features.push('json-feed-mime-type');
    }
    // Medium confidence MIME types
    else if (lowerContentType.includes('application/json')) {
      confidence = 0.6;
      likelyType = FeedType.JSON_FEED_1_1;
      features.push('json-mime-type');
    } else if (lowerContentType.includes('text/xml') || lowerContentType.includes('application/xml')) {
      confidence = 0.4;
      features.push('xml-mime-type');
      // Can't determine specific type from generic XML
    }
    // WordPress and other common patterns
    else if (lowerContentType.includes('text/html')) {
      confidence = 0.1;
      features.push('html-mime-type');
      // Might be a redirect or error page
    }

    return {
      type: likelyType,
      confidence,
      features,
    };
  }

  /**
   * Detect feed type from URL patterns using common conventions
   */
  private static detectFromUrl(url: string): FeedTypeInfo {
    let confidence = 0;
    const features: string[] = [];
    let likelyType = FeedType.UNKNOWN;

    const lowerUrl = url.toLowerCase();

    // High confidence patterns (specific extensions)
    if (lowerUrl.endsWith('.rss') || lowerUrl.endsWith('.rss.xml')) {
      confidence = 0.8;
      features.push('rss-extension');
    } else if (lowerUrl.endsWith('.atom') || lowerUrl.endsWith('.atom.xml')) {
      confidence = 0.8;
      features.push('atom-extension');
    } else if (lowerUrl.endsWith('.json')) {
      confidence = 0.7;
      features.push('json-extension');
    }
    // Medium confidence patterns (path-based)
    else if (lowerUrl.includes('/rss.xml') || lowerUrl.includes('?feed=rss2')) {
      confidence = 0.6;
      features.push('rss-path-pattern');
    } else if (lowerUrl.includes('/atom.xml') || lowerUrl.includes('?feed=atom')) {
      confidence = 0.6;
      features.push('atom-path-pattern');
    }
    // Lower confidence patterns (generic paths)
    else if (lowerUrl.includes('/rss') && !lowerUrl.includes('/feed/')) {
      confidence = 0.4;
      features.push('rss-generic-path');
    } else if (lowerUrl.includes('/atom') && !lowerUrl.includes('/feed/')) {
      confidence = 0.4;
      features.push('atom-generic-path');
    } else if (lowerUrl.includes('/feed/rss')) {
      confidence = 0.5;
      features.push('rss-feed-path');
    } else if (lowerUrl.includes('/feed/atom')) {
      confidence = 0.5;
      features.push('atom-feed-path');
    }
    // WordPress-specific patterns
    else if (lowerUrl.endsWith('/feed/') || lowerUrl.endsWith('/feed')) {
      confidence = 0.7;
      likelyType = FeedType.ATOM_1_0; // WordPress default is Atom
      features.push('wordpress-default-feed');
    } else if (lowerUrl.includes('/comments/feed/') || lowerUrl.includes('/comments/feed')) {
      confidence = 0.6;
      likelyType = FeedType.ATOM_1_0; // WordPress comments feed is usually Atom
      features.push('wordpress-comments-feed');
    }
    // Generic feed paths (non-WordPress) - prefer Atom
    else if (lowerUrl.includes('/feed') && !lowerUrl.includes('/feed/')) {
      confidence = 0.3;
      likelyType = FeedType.ATOM_1_0; // Prefer Atom for generic /feed paths
      features.push('generic-feed-path-atom-preference');
    }

    // Determine likely type based on confidence (if not already set by WordPress patterns)
    if (likelyType === FeedType.UNKNOWN && confidence >= 0.6) {
      if (features.some(f => f.includes('rss'))) {
        likelyType = FeedType.RSS_2_0;
      } else if (features.some(f => f.includes('atom'))) {
        likelyType = FeedType.ATOM_1_0;
      } else if (features.some(f => f.includes('json'))) {
        likelyType = FeedType.JSON_FEED_1_1;
      }
    }

    return {
      type: likelyType,
      confidence,
      features,
    };
  }

  /**
   * Get human-readable description of feed type
   */
  static getFeedTypeDescription(type: FeedType): string {
    switch (type) {
      case FeedType.RSS_2_0:
        return 'RSS 2.0 (Really Simple Syndication)';
      case FeedType.ATOM_1_0:
        return 'Atom 1.0 (Atom Syndication Format)';
      case FeedType.JSON_FEED_1_1:
        return 'JSON Feed 1.1 (JSON-based syndication)';
      case FeedType.UNKNOWN:
        return 'Unknown/Unsupported format';
      default:
        return 'Unknown format';
    }
  }

  /**
   * Check if feed type is supported
   */
  static isSupported(type: FeedType): boolean {
    return type !== FeedType.UNKNOWN;
  }

  /**
   * Get recommended parser for feed type
   */
  static getRecommendedParser(type: FeedType): string {
    switch (type) {
      case FeedType.RSS_2_0:
      case FeedType.ATOM_1_0:
        return 'rss-parser';
      case FeedType.JSON_FEED_1_1:
        return 'json-feed-parser';
      case FeedType.UNKNOWN:
        return 'generic-xml-parser';
      default:
        return 'unknown';
    }
  }

  /**
   * Get common URL patterns for each feed type
   */
  static getCommonUrlPatterns(): Record<FeedType, string[]> {
    return {
      [FeedType.RSS_2_0]: [
        'https://site.com/rss',
        'https://site.com/rss.xml',
        'https://site.com/?feed=rss2', // WordPress explicit RSS
        'https://site.com/feed/rss',
      ],
      [FeedType.ATOM_1_0]: [
        'https://site.com/atom.xml',
        'https://site.com/?feed=atom', // WordPress explicit Atom
        'https://site.com/feed/atom',
        'https://site.com/feed/', // WordPress default (Atom)
        'https://site.com/comments/feed/', // WordPress comments feed
      ],
      [FeedType.JSON_FEED_1_1]: [
        'https://site.com/feed.json',
        'https://site.com/feed/index.json',
      ],
      [FeedType.UNKNOWN]: [
        'https://site.com/feeds',
        'https://site.com/syndication',
      ],
    };
  }

  /**
   * Get common MIME types for each feed type
   */
  static getCommonMimeTypes(): Record<FeedType, string[]> {
    return {
      [FeedType.RSS_2_0]: [
        'application/rss+xml',
        'text/xml',
        'application/xml',
      ],
      [FeedType.ATOM_1_0]: [
        'application/atom+xml',
        'text/xml',
        'application/xml',
      ],
      [FeedType.JSON_FEED_1_1]: [
        'application/feed+json',
        'application/json',
      ],
      [FeedType.UNKNOWN]: [
        'text/html',
        'text/plain',
      ],
    };
  }

  /**
   * Detect if URL appears to be from a WordPress site
   */
  static isWordPressUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    
    // WordPress-specific patterns
    return lowerUrl.includes('?feed=') || 
           lowerUrl.includes('/feed/') || 
           lowerUrl.includes('/comments/feed/') ||
           lowerUrl.includes('/wp-content/') ||
           lowerUrl.includes('/wp-json/');
  }

  /**
   * Get WordPress-specific feed recommendations
   */
  static getWordPressFeedRecommendations(): {
    default: string;
    alternatives: string[];
    description: string;
  } {
    return {
      default: '/feed/',
      alternatives: [
        '/?feed=atom',
        '/?feed=rss2',
        '/comments/feed/',
      ],
      description: 'WordPress sites typically use /feed/ for Atom (default), /?feed=rss2 for RSS 2.0, and /?feed=atom for explicit Atom',
    };
  }

  /**
   * Get feed format preference policy
   */
  static getFormatPreferencePolicy(): {
    priority: FeedType[];
    description: string;
  } {
    return {
      priority: [
        FeedType.JSON_FEED_1_1,  // Most modern
        FeedType.ATOM_1_0,       // Preferred over RSS
        FeedType.RSS_2_0,        // Fallback
        FeedType.UNKNOWN,        // Last resort
      ],
      description: 'Atom is preferred over RSS when both formats are available with similar confidence levels',
    };
  }
}
