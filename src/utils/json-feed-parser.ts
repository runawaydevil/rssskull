import { logger } from './logger/logger.service.js';
import { parseDate } from './date-parser.js';
import type { RSSItem, RSSFeed } from '../services/rss.service.js';

export interface JsonFeedItem {
  id: string;
  url?: string;
  external_url?: string;
  title?: string;
  content_html?: string;
  content_text?: string;
  summary?: string;
  image?: string;
  banner_image?: string;
  date_published?: string;
  date_modified?: string;
  authors?: Array<{
    name?: string;
    url?: string;
    avatar?: string;
  }>;
  tags?: string[];
  language?: string;
  attachments?: Array<{
    url: string;
    mime_type: string;
    title?: string;
    size_in_bytes?: number;
    duration_in_seconds?: number;
  }>;
}

export interface JsonFeed {
  version: string;
  title: string;
  home_page_url?: string;
  feed_url?: string;
  description?: string;
  user_comment?: string;
  next_url?: string;
  icon?: string;
  favicon?: string;
  authors?: Array<{
    name?: string;
    url?: string;
    avatar?: string;
  }>;
  language?: string;
  expired?: boolean;
  items: JsonFeedItem[];
}

export class JsonFeedParser {
  /**
   * Parse JSON Feed content into our standardized RSS format
   */
  static parseJsonFeed(jsonContent: string, url?: string): RSSFeed {
    try {
      const jsonFeed: JsonFeed = JSON.parse(jsonContent);
      
      // Validate JSON Feed structure
      if (!jsonFeed.version || !jsonFeed.title || !Array.isArray(jsonFeed.items)) {
        throw new Error('Invalid JSON Feed structure');
      }

      logger.debug(`Parsing JSON Feed: ${jsonFeed.title} (${jsonFeed.items.length} items)`);

      // Convert items to our standard format
      const items: RSSItem[] = jsonFeed.items.map((item, index) => 
        this.convertJsonFeedItem(item, index)
      );

      return {
        title: jsonFeed.title,
        description: jsonFeed.description || '',
        link: jsonFeed.home_page_url || jsonFeed.feed_url || url || '',
        items,
      };
    } catch (error) {
      logger.error('Failed to parse JSON Feed:', error);
      throw new Error(`JSON Feed parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert JSON Feed item to our standard RSS item format
   */
  private static convertJsonFeedItem(jsonItem: JsonFeedItem, index: number): RSSItem {
    // Generate unique ID
    const id = jsonItem.id || `json-feed-item-${index}`;

    // Extract link (prefer external_url for external links)
    const link = jsonItem.external_url || jsonItem.url || '';

    // Extract content (prefer HTML, fallback to text)
    const description = this.extractContent(jsonItem);

    // Extract publication date
    const pubDate = this.extractDate(jsonItem);

    // Extract author
    const author = this.extractAuthor(jsonItem);

    // Extract categories/tags
    const categories = jsonItem.tags || [];

    return {
      id,
      title: this.sanitizeText(jsonItem.title || 'Untitled'),
      link,
      description,
      pubDate,
      author,
      categories,
      guid: id,
    };
  }

  /**
   * Extract content from JSON Feed item
   */
  private static extractContent(item: JsonFeedItem): string {
    // Prefer HTML content, fallback to text content, then summary
    const content = item.content_html || item.content_text || item.summary || '';
    
    if (!content) {
      return '';
    }

    // If it's HTML content, strip tags for description
    if (item.content_html) {
      return this.stripHtmlTags(content);
    }

    return this.sanitizeText(content);
  }

  /**
   * Extract publication date from JSON Feed item
   */
  private static extractDate(item: JsonFeedItem): Date | undefined {
    // Prefer date_published, fallback to date_modified
    const dateString = item.date_published || item.date_modified;
    
    if (!dateString) {
      return undefined;
    }

    return parseDate(dateString);
  }

  /**
   * Extract author from JSON Feed item
   */
  private static extractAuthor(item: JsonFeedItem): string {
    if (!item.authors || item.authors.length === 0) {
      return '';
    }

    // Use the first author's name
    const firstAuthor = item.authors[0];
    return this.sanitizeText(firstAuthor?.name || '');
  }

  /**
   * Strip HTML tags from content
   */
  private static stripHtmlTags(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#32;/g, ' ')
      .replace(/&#160;/g, ' ')
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .trim();
  }

  /**
   * Sanitize text content
   */
  private static sanitizeText(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Validate JSON Feed structure
   */
  static validateJsonFeed(jsonContent: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const jsonFeed: JsonFeed = JSON.parse(jsonContent);

      // Check required fields
      if (!jsonFeed.version) {
        errors.push('Missing version field');
      }

      if (!jsonFeed.title) {
        errors.push('Missing title field');
      }

      if (!Array.isArray(jsonFeed.items)) {
        errors.push('Missing or invalid items array');
      }

      // Check items structure
      if (Array.isArray(jsonFeed.items)) {
        jsonFeed.items.forEach((item, index) => {
          if (!item.id) {
            errors.push(`Item ${index} missing id field`);
          }
        });
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }
}
