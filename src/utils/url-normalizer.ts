/**
 * URL normalization utilities
 */

export class UrlNormalizer {
  /**
   * Normalize URL to a standard format
   * Handles various input formats and converts them to https://domain.com
   */
  static normalizeUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL provided');
    }

    let normalized = url.trim();

    // Remove common prefixes that might cause issues
    // This regex removes: http://, https://, www. (in any combination)
    normalized = normalized.replace(/^(https?:\/\/)?(www\.)?/, '');
    
    // Add https protocol
    normalized = 'https://' + normalized;

    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');

    return normalized;
  }

  /**
   * Check if URL is already normalized
   */
  static isNormalized(url: string): boolean {
    return url.startsWith('https://') && !url.startsWith('https://www.');
  }

  /**
   * Get domain from URL
   */
  static getDomain(url: string): string {
    const normalized = this.normalizeUrl(url);
    try {
      const urlObj = new URL(normalized);
      return urlObj.hostname;
    } catch (error) {
      throw new Error(`Invalid URL format: ${url}`);
    }
  }

  /**
   * Check if two URLs point to the same domain
   */
  static isSameDomain(url1: string, url2: string): boolean {
    try {
      const domain1 = this.getDomain(url1);
      const domain2 = this.getDomain(url2);
      return domain1 === domain2;
    } catch (error) {
      return false;
    }
  }

  /**
   * Examples of URL normalization
   */
  static getNormalizationExamples(): Array<{ input: string; output: string }> {
    return [
      { input: 'pablo.space', output: 'https://pablo.space' },
      { input: 'www.pablo.space', output: 'https://pablo.space' },
      { input: 'http://pablo.space', output: 'https://pablo.space' },
      { input: 'https://pablo.space', output: 'https://pablo.space' },
      { input: 'https://www.pablo.space', output: 'https://pablo.space' },
      { input: 'http://www.pablo.space', output: 'https://pablo.space' },
      { input: 'pablo.space/', output: 'https://pablo.space' },
      { input: 'www.pablo.space/', output: 'https://pablo.space' },
    ];
  }
}
