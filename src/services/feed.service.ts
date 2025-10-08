import type { PrismaClient } from '@prisma/client';
import {
  type CreateFeedInput,
  FeedRepository,
  type FeedWithFilters,
} from '../database/repositories/feed.repository.js';
import { ConverterService } from '../utils/converters/converter.service.js';
import { logger } from '../utils/logger/logger.service.js';
import { isValidUrl } from '../utils/validation.js';

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
  async addFeed(
    input: AddFeedInput
  ): Promise<{
    success: boolean;
    feed?: FeedWithFilters;
    errors?: FeedValidationError[];
    conversionInfo?: { originalUrl: string; rssUrl: string; platform?: string };
  }> {
    try {
      // Validate input
      const validationErrors = await this.validateFeedInput(input);
      if (validationErrors.length > 0) {
        return { success: false, errors: validationErrors };
      }

      // Check for duplicates
      const existingFeed = await this.feedRepository.findByChatIdAndName(input.chatId, input.name);
      if (existingFeed) {
        return {
          success: false,
          errors: [{ field: 'name', message: 'Feed with this name already exists in this chat' }],
        };
      }

      // Determine RSS URL through conversion or direct use
      let rssUrl = input.rssUrl || input.url;
      let conversionInfo: { originalUrl: string; rssUrl: string; platform?: string } | undefined;

      // If no explicit RSS URL provided, try URL conversion
      if (!input.rssUrl) {
        // Check if URL is already in RSS format
        if (this.converterService.isRssUrl(input.url)) {
          rssUrl = input.url;
          logger.info(`URL is already in RSS format: ${input.url}`);
        } else {
          // Attempt URL conversion
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
            // Conversion failed, but we can still try to use the original URL as RSS
            logger.warn(
              `URL conversion failed for ${input.url}: ${conversionResult.error}. Using original URL as RSS.`
            );
            rssUrl = input.url;
          }
        }
      }

      // Create feed
      const feedData: CreateFeedInput = {
        chat: {
          connect: { id: input.chatId },
        },
        name: input.name,
        url: input.url,
        rssUrl: rssUrl,
        enabled: input.enabled ?? true,
        lastCheck: new Date(),
        failures: 0,
      };

      const feed = await this.feedRepository.create(feedData);
      logger.info(`Feed added successfully: ${feed.name} (${feed.id})`);

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
      } else {
        return {
          canConvert: false,
          platform,
          error: conversionResult.error || 'Conversion failed',
        };
      }
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
