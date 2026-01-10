/**
 * Interface for URL converters that transform platform-specific URLs to RSS feeds
 */
export interface URLConverter {
  /**
   * The name of the platform this converter handles (e.g., 'reddit', 'youtube')
   */
  readonly platform: string;

  /**
   * Check if this converter can handle the given URL
   * @param url The URL to check
   * @returns true if this converter can handle the URL
   */
  canHandle(url: string): boolean;

  /**
   * Convert the URL to an RSS feed URL
   * @param url The original URL to convert
   * @returns Promise resolving to the RSS feed URL
   * @throws ConversionError if conversion fails
   */
  convert(url: string): Promise<string>;

  /**
   * Validate that the converted URL is accessible and returns valid RSS
   * @param rssUrl The RSS URL to validate
   * @returns Promise resolving to true if valid
   */
  validate(rssUrl: string): Promise<boolean>;
}

/**
 * Error thrown when URL conversion fails
 */
export class ConversionError extends Error {
  constructor(
    message: string,
    public readonly originalUrl: string,
    public readonly platform: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ConversionError';
  }
}

/**
 * Result of URL conversion attempt
 */
export interface ConversionResult {
  success: boolean;
  originalUrl: string;
  rssUrl?: string;
  platform?: string;
  error?: string;
}
