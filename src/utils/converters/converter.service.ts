import { isValidUrl } from '../validation.js';
import {
  ConversionError,
  type ConversionResult,
  type URLConverter,
} from './converter.interface.js';
import { RedditConverter } from './reddit.converter.js';
import { YouTubeConverter } from './youtube.converter.js';

/**
 * Service that manages URL conversion using registered converters
 */
export class ConverterService {
  private readonly converters: Map<string, URLConverter> = new Map();

  constructor() {
    // Register default converters
    this.registerConverter(new RedditConverter());
    this.registerConverter(new YouTubeConverter());
  }

  /**
   * Register a new URL converter
   * @param converter The converter to register
   */
  registerConverter(converter: URLConverter): void {
    this.converters.set(converter.platform, converter);
  }

  /**
   * Get a converter by platform name
   * @param platform The platform name
   * @returns The converter or undefined if not found
   */
  getConverter(platform: string): URLConverter | undefined {
    return this.converters.get(platform);
  }

  /**
   * Get all registered converters
   * @returns Array of all registered converters
   */
  getAllConverters(): URLConverter[] {
    return Array.from(this.converters.values());
  }

  /**
   * Detect which platform a URL belongs to
   * @param url The URL to analyze
   * @returns Platform name or null if no converter can handle it
   */
  detectPlatform(url: string): string | null {
    for (const converter of this.converters.values()) {
      if (converter.canHandle(url)) {
        return converter.platform;
      }
    }
    return null;
  }

  /**
   * Convert a URL to RSS format if possible
   * @param url The original URL to convert
   * @returns Promise resolving to conversion result
   */
  async convertUrl(url: string): Promise<ConversionResult> {
    // First, validate the input URL
    if (!isValidUrl(url)) {
      return {
        success: false,
        originalUrl: url,
        error: 'Invalid URL format',
      };
    }

    // Find a converter that can handle this URL
    const converter = this.findConverter(url);
    if (!converter) {
      return {
        success: false,
        originalUrl: url,
        error: 'No converter available for this URL type',
      };
    }

    try {
      // Attempt conversion
      const rssUrl = await converter.convert(url);

      // Validate the converted RSS URL
      const isValid = await converter.validate(rssUrl);
      if (!isValid) {
        return {
          success: false,
          originalUrl: url,
          platform: converter.platform,
          error: 'Converted RSS URL is not accessible or invalid',
        };
      }

      return {
        success: true,
        originalUrl: url,
        rssUrl,
        platform: converter.platform,
      };
    } catch (error) {
      const errorMessage =
        error instanceof ConversionError
          ? error.message
          : `Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`;

      return {
        success: false,
        originalUrl: url,
        platform: converter.platform,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if a URL is already in RSS format
   * @param url The URL to check
   * @returns true if the URL appears to be an RSS feed
   */
  isRssUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname.toLowerCase();
      const searchParams = parsedUrl.searchParams;

      // Check for common RSS indicators
      return (
        pathname.endsWith('.rss') ||
        pathname.endsWith('.xml') ||
        pathname.includes('/rss') ||
        pathname.includes('/feed') ||
        pathname.includes('/feeds') ||
        searchParams.has('feed') ||
        searchParams.get('format') === 'rss'
      );
    } catch {
      return false;
    }
  }

  /**
   * Find a converter that can handle the given URL
   * @param url The URL to find a converter for
   * @returns The converter or undefined if none found
   */
  private findConverter(url: string): URLConverter | undefined {
    for (const converter of this.converters.values()) {
      if (converter.canHandle(url)) {
        return converter;
      }
    }
    return undefined;
  }
}
