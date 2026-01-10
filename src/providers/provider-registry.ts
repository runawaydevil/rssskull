import { logger } from '../utils/logger/logger.service.js';
// import { InstagramProvider } from './instagram.provider.js'; // Disabled - requires cookies
import type { SocialBridgeProvider } from './social-provider.interface.js';

/**
 * Registry for social media bridge providers
 * Routes URLs to appropriate providers and handles fallback
 */
export class ProviderRegistry {
  private providers: SocialBridgeProvider[] = [];

  constructor() {
    // Register all available providers
    // NOTE: Instagram disabled for now - requires cookies/session management
    // this.registerProvider(new InstagramProvider());
    
    logger.info(`Provider registry initialized with ${this.providers.length} providers (Instagram disabled - requires cookies)`);
  }

  /**
   * Register a new provider
   */
  registerProvider(provider: SocialBridgeProvider): void {
    this.providers.push(provider);
    logger.debug(`Registered provider: ${provider.name}`);
  }

  /**
   * Find a provider that can handle the given URL
   */
  findProvider(url: string): SocialBridgeProvider | null {
    for (const provider of this.providers) {
      if (provider.canHandle(url)) {
        logger.debug(`Found provider ${provider.name} for URL: ${url}`);
        return provider;
      }
    }
    
    logger.debug(`No provider found for URL: ${url}`);
    return null;
  }

  /**
   * Build feed URL using appropriate provider
   * Returns null if no provider can handle the URL
   */
  buildFeedUrl(inputUrl: string): string | null {
    const provider = this.findProvider(inputUrl);
    
    if (!provider) {
      return null;
    }
    
    try {
      const feedUrl = provider.buildFeedUrl(inputUrl);
      logger.info(`Built feed URL for ${provider.name}: ${feedUrl}`);
      return feedUrl;
    } catch (error) {
      logger.error(`Failed to build feed URL for ${provider.name}:`, error);
      return null;
    }
  }

  /**
   * Get cache TTL for a URL based on its provider
   */
  getCacheTTL(url: string): number | null {
    const provider = this.findProvider(url);
    return provider ? provider.getCacheTTL() : null;
  }

  /**
   * Get polling interval for a URL based on its provider
   */
  getPollInterval(url: string): number | null {
    const provider = this.findProvider(url);
    return provider ? provider.getPollInterval() : null;
  }

  /**
   * Get priority for a URL based on its provider
   */
  getPriority(url: string): number | null {
    const provider = this.findProvider(url);
    return provider ? provider.getPriority() : null;
  }

  /**
   * Check if any provider can handle the URL
   */
  canHandle(url: string): boolean {
    return this.findProvider(url) !== null;
  }

  /**
   * Perform health checks on all providers
   */
  async performHealthChecks(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const provider of this.providers) {
      try {
        results[provider.name] = await provider.healthCheck();
      } catch (error) {
        logger.error(`Health check failed for provider ${provider.name}:`, error);
        results[provider.name] = false;
      }
    }
    
    return results;
  }

  /**
   * Get list of all registered providers
   */
  getAllProviders(): SocialBridgeProvider[] {
    return [...this.providers];
  }

  /**
   * Get provider by name
   */
  getProvider(name: string): SocialBridgeProvider | null {
    return this.providers.find(p => p.name === name) || null;
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();

