import type { PrismaClient } from '@prisma/client';
import {
  type CreateFeedInput,
  FeedRepository,
  type FeedWithFilters,
} from '../database/repositories/feed.repository.js';
import { feedQueueService } from '../jobs/index.js';
import { ConverterService } from '../utils/converters/converter.service.js';
import { logger } from '../utils/logger/logger.service.js';
import { isValidUrl } from '../utils/validation.js';
import { FeedDiscovery } from '../utils/feed-discovery.js';
import { providerRegistry } from '../providers/index.js';

export interface AddFeedInput {
  chatId: string;
  name: string;
  url: string;
  rssUrl?: string;
  enabled?: boolean;
}

export interface FeedValidationError {
  field: string;
  message: string;
}

export class FeedService {
  private feedRepository: FeedRepository;
  private converterService: ConverterService;

  constructor(prisma: PrismaClient) {
    this.feedRepository = new FeedRepository(prisma);
    this.converterService = new ConverterService();
  }

  /**
   * Add a new feed with validation and duplicate checking
   */
  async addFeed(input: AddFeedInput): Promise<{
    success: boolean;
    feed?: FeedWithFilters;
    errors?: FeedValidationError[];
    conversionInfo?: { originalUrl: string; rssUrl: string; platform?: string };
  }> {
    // Check for duplicate feed name and URL first
    const existingFeeds = await this.listFeeds(input.chatId);
    const duplicateName = existingFeeds.find(feed => feed.name.toLowerCase() === input.name.toLowerCase());
    const duplicateUrl = existingFeeds.find(feed => feed.url === input.url || feed.rssUrl === input.url);
    
    if (duplicateName) {
      return {
        success: false,
        errors: [{ field: 'name', message: `Já existe um feed com o nome "${input.name}". Use um nome diferente.` }],
      };
    }
    
    if (duplicateUrl) {
      return {
        success: false,
        errors: [{ field: 'url', message: `Já existe um feed com esta URL: "${input.url}". Verifique sua lista de feeds.` }],
      };
    }
    try {
      // Validate input
      const validationErrors = await this.validateFeedInput(input);
      if (validationErrors.length > 0) {
        return { success: false, errors: validationErrors };
      }

      // Determine RSS URL through conversion or direct use
      let rssUrl = input.rssUrl || input.url;
      let conversionInfo: { originalUrl: string; rssUrl: string; platform?: string } | undefined;

      // If no explicit RSS URL provided, try URL conversion and feed discovery
      if (!input.rssUrl) {
        // Check if URL is already in RSS format
        if (this.converterService.isRssUrl(input.url)) {
          rssUrl = input.url;
          logger.info(`URL is already in RSS format: ${input.url}`);
        } else {
          // First try social media provider (Instagram, etc.)
          const bridgeUrl = providerRegistry.buildFeedUrl(input.url);
          if (bridgeUrl) {
            rssUrl = bridgeUrl;
            const provider = providerRegistry.findProvider(input.url);
            conversionInfo = {
              originalUrl: input.url,
              rssUrl: bridgeUrl,
              platform: provider?.name || 'bridge',
            };
            logger.info(`URL converted via bridge provider: ${input.url} -> ${bridgeUrl}`);
          } else {
            // Try traditional URL conversion (for YouTube, etc.)
            const conversionResult = await this.converterService.convertUrl(input.url);

            if (conversionResult.success && conversionResult.rssUrl) {
              rssUrl = conversionResult.rssUrl;
              conversionInfo = {
                originalUrl: input.url,
                rssUrl: conversionResult.rssUrl,
                platform: conversionResult.platform,
              };
              logger.info(
                `URL converted successfully: ${input.url} -> ${rssUrl} (${conversionResult.platform})`
              );
            } else {
              // Conversion failed, try feed discovery
              logger.info(`URL conversion failed, trying feed discovery for: ${input.url}`);
              const discoveryResult = await this.discoverFeeds(input.url);

              if (discoveryResult.success && discoveryResult.feeds.length > 0) {
                // Use the best feed found
                const bestFeed = discoveryResult.feeds[0];
                if (bestFeed) {
                  // Check if the discovered feed URL is already in use
                  const currentFeeds = await this.listFeeds(input.chatId);
                  const duplicateDiscoveredUrl = currentFeeds.find(feed => 
                    feed.url === bestFeed.url || feed.rssUrl === bestFeed.url
                  );
                  
                  if (duplicateDiscoveredUrl) {
                    return {
                      success: false,
                      errors: [{ 
                        field: 'url', 
                        message: `O feed descoberto "${bestFeed.url}" já está sendo usado pelo feed "${duplicateDiscoveredUrl.name}".` 
                      }],
                    };
                  }
                  
                  rssUrl = bestFeed.url;
                  conversionInfo = {
                    originalUrl: input.url,
                    rssUrl: bestFeed.url,
                    platform: `discovered-${bestFeed.source}`,
                  };
                  logger.info(
                    `Feed discovered: ${input.url} -> ${rssUrl} (${bestFeed.type}, confidence: ${bestFeed.confidence})`
                  );
                }
              } else {
                // Both conversion and discovery failed, use original URL as fallback
                logger.warn(
                  `Both URL conversion and feed discovery failed for ${input.url}. Using original URL as RSS.`
                );
                rssUrl = input.url;
              }
            }
          }
        }
      }

      // Determine defaults based on feed type
      const isReddit = rssUrl.includes('reddit.com');
      const isInstagram = input.url.includes('instagram.com');
      
      // Get polling interval from provider if available
      const providerInterval = providerRegistry.getPollInterval(input.url);
      const checkIntervalMinutes = providerInterval || (isReddit ? 6 : 10);
      
      // Determine max age based on feed type
      const maxAgeMinutes = isReddit ? 90 : isInstagram ? 90 : 1440; // Reddit/IG: 90 min, others: 24h
      
      // Create feed
      const feedData: CreateFeedInput = {
        chat: {
          connect: { id: input.chatId },
        },
        name: input.name,
        url: input.url,
        rssUrl: rssUrl,
        enabled: input.enabled ?? true,
        checkIntervalMinutes,
        maxAgeMinutes,
        lastCheck: new Date(),
        failures: 0,
      };

      const feed = await this.feedRepository.create(feedData);
      logger.info(`Feed added successfully: ${feed.name} (${feed.id})`);

      // Schedule recurring feed checks using feed's checkIntervalMinutes
      try {
        const intervalMinutes = feed.checkIntervalMinutes;
        
        await feedQueueService.scheduleRecurringFeedCheck({
          feedId: feed.id,
          chatId: feed.chatId,
          feedUrl: feed.rssUrl,
          lastItemId: feed.lastItemId ?? undefined,
        }, intervalMinutes);

        logger.info(`Scheduled recurring feed check for feed ${feed.id} every ${intervalMinutes} minutes`);
      } catch (error) {
        logger.error(`Failed to schedule feed check for feed ${feed.id}:`, error);
        // Don't fail the entire operation if scheduling fails
      }

      return {
        success: true,
        feed,
        conversionInfo,
      };
    } catch (error) {
      logger.error('Error adding feed:', error);
      return {
        success: false,
        errors: [{ field: 'general', message: 'Failed to add feed due to internal error' }],
      };
    }
  }

  /**
   * List feeds for a specific chat
   */
  async listFeeds(chatId: string): Promise<FeedWithFilters[]> {
    try {
      return await this.feedRepository.findByChatId(chatId);
    } catch (error) {
      logger.error('Error listing feeds:', error);
      return [];
    }
  }

  /**
   * Remove a feed by name from a specific chat
   */
  async removeFeed(chatId: string, name: string): Promise<{ success: boolean; message: string }> {
    try {
      const feed = await this.feedRepository.findByChatIdAndName(chatId, name);
      if (!feed) {
        return { success: false, message: 'Feed not found' };
      }

      // Remove recurring feed check job from queue
      try {
        await feedQueueService.removeRecurringFeedCheck(feed.id);
        logger.info(`Removed recurring job for feed ${feed.id}`);
      } catch (error) {
        logger.warn(`Failed to remove recurring job for feed ${feed.id}:`, error);
        // Don't fail the entire operation if job removal fails
      }

      await this.feedRepository.delete(feed.id);
      logger.info(`Feed removed successfully: ${name} (${feed.id})`);

      return { success: true, message: 'Feed removed successfully' };
    } catch (error) {
      logger.error('Error removing feed:', error);
      return { success: false, message: 'Failed to remove feed due to internal error' };
    }
  }

  /**
   * Enable a feed
   */
  async enableFeed(
    chatId: string,
    name: string
  ): Promise<{ success: boolean; message: string; feed?: FeedWithFilters }> {
    try {
      const feed = await this.feedRepository.findByChatIdAndName(chatId, name);
      if (!feed) {
        return { success: false, message: 'Feed not found' };
      }

      if (feed.enabled) {
        return { success: false, message: 'Feed is already enabled' };
      }

      const updatedFeed = await this.feedRepository.toggleEnabled(feed.id, true);
      logger.info(`Feed enabled successfully: ${name} (${feed.id})`);

      return { success: true, message: 'Feed enabled successfully', feed: updatedFeed };
    } catch (error) {
      logger.error('Error enabling feed:', error);
      return { success: false, message: 'Failed to enable feed due to internal error' };
    }
  }

  /**
   * Disable a feed
   */
  async disableFeed(
    chatId: string,
    name: string
  ): Promise<{ success: boolean; message: string; feed?: FeedWithFilters }> {
    try {
      const feed = await this.feedRepository.findByChatIdAndName(chatId, name);
      if (!feed) {
        return { success: false, message: 'Feed not found' };
      }

      if (!feed.enabled) {
        return { success: false, message: 'Feed is already disabled' };
      }

      const updatedFeed = await this.feedRepository.toggleEnabled(feed.id, false);
      logger.info(`Feed disabled successfully: ${name} (${feed.id})`);

      return { success: true, message: 'Feed disabled successfully', feed: updatedFeed };
    } catch (error) {
      logger.error('Error disabling feed:', error);
      return { success: false, message: 'Failed to disable feed due to internal error' };
    }
  }

  /**
   * Get feed count for a chat
   */
  async getFeedCount(chatId: string): Promise<number> {
    try {
      return await this.feedRepository.countByChatId(chatId);
    } catch (error) {
      logger.error('Error getting feed count:', error);
      return 0;
    }
  }

  /**
   * Get the converter service instance for external use
   */
  getConverterService(): ConverterService {
    return this.converterService;
  }

  /**
   * Discover available feeds from a website URL
   */
  async discoverFeeds(websiteUrl: string): Promise<{
    success: boolean;
    feeds: Array<{
      url: string;
      type: string;
      title?: string;
      confidence: number;
      source: string;
    }>;
    errors: string[];
  }> {
    try {
      logger.info(`Starting feed discovery for website: ${websiteUrl}`);

      const discoveryResult = await FeedDiscovery.discoverFeeds(websiteUrl);

      if (!discoveryResult.success) {
        return {
          success: false,
          feeds: [],
          errors: discoveryResult.errors,
        };
      }

      // Convert to our format
      const feeds = discoveryResult.feeds.map(feed => ({
        url: feed.url,
        type: feed.type,
        title: feed.title,
        confidence: feed.confidence,
        source: feed.source,
      }));

      logger.info(`Feed discovery completed: found ${feeds.length} feeds for ${websiteUrl}`);

      return {
        success: true,
        feeds,
        errors: discoveryResult.errors,
      };
    } catch (error) {
      logger.error('Error during feed discovery:', error);
      return {
        success: false,
        feeds: [],
        errors: [error instanceof Error ? error.message : 'Unknown error during discovery'],
      };
    }
  }


  /**
   * Check if a URL can be converted and preview the conversion
   */
  async previewUrlConversion(
    url: string
  ): Promise<{ canConvert: boolean; platform?: string; rssUrl?: string; error?: string }> {
    try {
      if (!isValidUrl(url)) {
        return { canConvert: false, error: 'Invalid URL format' };
      }

      if (this.converterService.isRssUrl(url)) {
        return { canConvert: false, error: 'URL is already in RSS format' };
      }

      const platform = this.converterService.detectPlatform(url);
      if (!platform) {
        return { canConvert: false, error: 'No converter available for this URL type' };
      }

      const conversionResult = await this.converterService.convertUrl(url);

      if (conversionResult.success && conversionResult.rssUrl) {
        return {
          canConvert: true,
          platform: conversionResult.platform,
          rssUrl: conversionResult.rssUrl,
        };
      }
      return {
        canConvert: false,
        platform,
        error: conversionResult.error || 'Conversion failed',
      };
    } catch (error) {
      logger.error('Error previewing URL conversion:', error);
      return {
        canConvert: false,
        error: 'Failed to preview conversion due to internal error',
      };
    }
  }

  /**
   * Validate feed input data
   */
  private async validateFeedInput(input: AddFeedInput): Promise<FeedValidationError[]> {
    const errors: FeedValidationError[] = [];

    // Validate name
    if (!input.name || input.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Feed name is required' });
    } else if (input.name.length > 100) {
      errors.push({ field: 'name', message: 'Feed name must be less than 100 characters' });
    }

    // Validate URL
    if (!input.url || input.url.trim().length === 0) {
      errors.push({ field: 'url', message: 'Feed URL is required' });
    } else if (!isValidUrl(input.url)) {
      errors.push({ field: 'url', message: 'Invalid URL format' });
    }

    // Validate chatId
    if (!input.chatId || input.chatId.trim().length === 0) {
      errors.push({ field: 'chatId', message: 'Chat ID is required' });
    }

    return errors;
  }
}
