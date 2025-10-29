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
import { classifySource } from '../utils/source-classifier.js';
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
        errors: [{ field: 'name', message: `A feed with the name "${input.name}" already exists. Use a different name.` }],
      };
    }
    
    if (duplicateUrl) {
      return {
        success: false,
        errors: [{ field: 'url', message: `A feed with this URL already exists: "${input.url}". Check your feed list.` }],
      };
    }

    // Check global feed limit (100 feeds across all chats)
    const totalFeedsCount = await this.feedRepository.countAll();
    if (totalFeedsCount >= 100) {
      return {
        success: false,
        errors: [{ 
          field: 'limit', 
          message: `System limit reached: ${totalFeedsCount}/100 feeds. Please remove unused feeds before adding new ones.` 
        }],
      };
    }

    try {
      // Validate input
      const validationErrors = await this.validateFeedInput(input);
      if (validationErrors.length > 0) {
        return { success: false, errors: validationErrors };
      }

      // Classify source type (Reddit, RSS, etc.)
      const sourceType = classifySource(input.url);
      
      // Determine RSS URL through conversion or direct use
      let rssUrl = input.rssUrl || input.url;
      let conversionInfo: { originalUrl: string; rssUrl: string; platform?: string } | undefined;

      // If no explicit RSS URL provided, try URL conversion and feed discovery
      if (!input.rssUrl) {
        // For Reddit URLs, always use the URL as-is (our parser will handle it)
        if (sourceType === 'reddit') {
          rssUrl = input.url;
          logger.info(`Reddit URL detected: ${input.url}`);
          conversionInfo = {
            originalUrl: input.url,
            rssUrl: input.url,
            platform: 'reddit',
          };
        } else if (this.converterService.isRssUrl(input.url)) {
          // Check if URL is already in RSS format
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
                // Both conversion and discovery failed
                logger.warn(
                  `Both URL conversion and feed discovery failed for ${input.url}. Attempting to use original URL.`
                );
                return {
                  success: false,
                  errors: [{ 
                    field: 'url', 
                    message: `😤 Feed not found. Unable to discover or convert feed from "${input.url}". Please verify the URL has an RSS/Atom feed.` 
                  }],
                };
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

      logger.info(`Starting transactional removal of feed: ${name} (${feed.id})`);

      // Use database transaction to ensure atomicity
      await this.feedRepository['prisma'].$transaction(async (tx: any) => {
        // Step 1: Remove recurring feed check job from queue first
        logger.info(`Removing recurring job for feed ${feed.id}`);
        const jobRemoved = await feedQueueService.removeRecurringFeedCheck(feed.id);
        
        if (!jobRemoved) {
          logger.error(`Failed to remove recurring job for feed ${feed.id}, aborting transaction`);
          throw new Error(`Failed to remove recurring job for feed ${feed.id}. Feed deletion aborted to prevent orphaned jobs.`);
        }

        // Step 2: Verify job removal was successful
        const jobVerified = await feedQueueService.verifyJobRemoval(feed.id);
        if (!jobVerified) {
          logger.error(`Job removal verification failed for feed ${feed.id}, aborting transaction`);
          throw new Error(`Job removal verification failed for feed ${feed.id}. Feed deletion aborted.`);
        }

        // Step 3: Delete feed record from database
        logger.info(`Deleting feed record for ${feed.id}`);
        await tx.feed.delete({
          where: { id: feed.id }
        });

        logger.info(`✅ Successfully completed transactional removal of feed: ${name} (${feed.id})`);
      });

      logger.info(`Feed removed successfully: ${name} (${feed.id})`);
      return { success: true, message: 'Feed removed successfully' };

    } catch (error) {
      logger.error(`Error removing feed ${name}:`, error);
      
      // Provide specific error messages based on the failure type
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (errorMessage.includes('Failed to remove recurring job')) {
        return { 
          success: false, 
          message: 'Failed to remove feed: Could not clean up scheduled jobs. Please try again or contact support.' 
        };
      }
      
      if (errorMessage.includes('Job removal verification failed')) {
        return { 
          success: false, 
          message: 'Failed to remove feed: Job cleanup verification failed. Please try again.' 
        };
      }

      return { 
        success: false, 
        message: 'Failed to remove feed due to internal error. Please try again.' 
      };
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
