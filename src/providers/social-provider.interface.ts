/**
 * Interface for social media bridge providers
 * Each provider handles URL conversion and configuration for a specific social platform
 */

export interface SocialBridgeProvider {
  /** Name of the provider/platform */
  name: string;

  /** Check if this provider can handle the given URL */
  canHandle(inputUrl: string): boolean;

  /** Build the RSS-Bridge feed URL from the input URL */
  buildFeedUrl(inputUrl: string): string;

  /** Perform a health check to verify the bridge is working */
  healthCheck(): Promise<boolean>;

  /** Check authentication status (optional, for bridges that require auth) */
  authStatus?(): Promise<{ ok: boolean; details?: string }>;

  /** Get cache TTL in milliseconds for this provider */
  getCacheTTL(): number;

  /** Get polling interval in minutes for this provider */
  getPollInterval(): number;

  /** Get priority level (1 = highest, 3 = lowest) */
  getPriority(): number;
}

