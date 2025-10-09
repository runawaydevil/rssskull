import type { ChatSettings } from '@prisma/client';
import type { ChatRepository } from '../database/repositories/chat.repository.js';
import { logger } from '../utils/logger/logger.service.js';
import { TemplateService } from './template.service.js';

export interface SettingsUpdateInput {
  language?: 'en' | 'pt';
  checkInterval?: number;
  maxFeeds?: number;
  enableFilters?: boolean;
  messageTemplate?: string | null;
  timezone?: string;
}

export interface SettingsValidationError {
  field: string;
  message: string;
}

export class SettingsService {
  constructor(private chatRepository: ChatRepository) {}

  /**
   * Get chat settings, creating default settings if they don't exist
   */
  async getSettings(chatId: string): Promise<ChatSettings> {
    try {
      const chat = await this.chatRepository.findByIdWithSettings(chatId);

      if (!chat) {
        // Create chat with default settings if it doesn't exist
        await this.chatRepository.createWithSettings({
          id: chatId,
          type: 'private', // Default type, should be updated based on actual chat type
        });
        // Create default settings for the new chat
        return await this.chatRepository.updateSettings(chatId, {
          language: 'en',
          checkInterval: 120, // 2 minutes max
          maxFeeds: 50,
          enableFilters: true,
          timezone: 'UTC',
        });
      }

      if (!chat.settings) {
        // Create default settings for existing chat
        return await this.chatRepository.updateSettings(chatId, {
          language: 'en',
          checkInterval: 120, // 2 minutes max
          maxFeeds: 50,
          enableFilters: true,
          timezone: 'UTC',
        });
      }

      return chat.settings;
    } catch (error) {
      logger.error('Failed to get chat settings', { chatId, error });
      throw new Error('Failed to retrieve chat settings');
    }
  }

  /**
   * Update chat settings with validation
   */
  async updateSettings(chatId: string, updates: SettingsUpdateInput): Promise<ChatSettings> {
    try {
      // Validate the updates
      const validationErrors = this.validateSettings(updates);
      if (validationErrors.length > 0) {
        throw new Error(
          `Validation failed: ${validationErrors.map((e) => `${e.field}: ${e.message}`).join(', ')}`
        );
      }

      // Ensure chat exists
      await this.getSettings(chatId);

      // Update settings
      const updatedSettings = await this.chatRepository.updateSettings(chatId, updates);

      logger.info('Chat settings updated', { chatId, updates });
      return updatedSettings;
    } catch (error) {
      logger.error('Failed to update chat settings', { chatId, updates, error });
      throw error;
    }
  }

  /**
   * Update language setting
   */
  async updateLanguage(chatId: string, language: 'en' | 'pt'): Promise<ChatSettings> {
    return this.updateSettings(chatId, { language });
  }

  /**
   * Update check interval setting
   */
  async updateCheckInterval(chatId: string, intervalSeconds: number): Promise<ChatSettings> {
    return this.updateSettings(chatId, { checkInterval: intervalSeconds });
  }

  /**
   * Update message template setting
   */
  async updateMessageTemplate(chatId: string, template: string | null): Promise<ChatSettings> {
    return this.updateSettings(chatId, { messageTemplate: template });
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings(chatId: string): Promise<ChatSettings> {
    return this.updateSettings(chatId, {
      language: 'en',
      checkInterval: 120, // 2 minutes max
      maxFeeds: 50,
      enableFilters: true,
      messageTemplate: null,
      timezone: 'UTC',
    });
  }

  /**
   * Validate settings input
   */
  private validateSettings(settings: SettingsUpdateInput): SettingsValidationError[] {
    const errors: SettingsValidationError[] = [];

    // Validate language
    if (settings.language !== undefined) {
      if (!['en', 'pt'].includes(settings.language)) {
        errors.push({
          field: 'language',
          message: 'Language must be either "en" or "pt"',
        });
      }
    }

    // Validate check interval
    if (settings.checkInterval !== undefined) {
      if (
        !Number.isInteger(settings.checkInterval) ||
        settings.checkInterval < 90 ||
        settings.checkInterval > 900
      ) {
        errors.push({
          field: 'checkInterval',
          message: 'Check interval must be between 90 and 900 seconds (1.5-15 minutes)',
        });
      }
    }

    // Validate max feeds
    if (settings.maxFeeds !== undefined) {
      if (
        !Number.isInteger(settings.maxFeeds) ||
        settings.maxFeeds < 1 ||
        settings.maxFeeds > 100
      ) {
        errors.push({
          field: 'maxFeeds',
          message: 'Max feeds must be between 1 and 100',
        });
      }
    }

    // Validate message template
    if (settings.messageTemplate !== undefined && settings.messageTemplate !== null) {
      if (typeof settings.messageTemplate !== 'string') {
        errors.push({
          field: 'messageTemplate',
          message: 'Message template must be a string',
        });
      } else {
        // Use TemplateService for validation
        const templateErrors = TemplateService.validateTemplate(settings.messageTemplate);
        errors.push(
          ...templateErrors.map((err) => ({
            field: 'messageTemplate',
            message: err.message,
          }))
        );
      }
    }

    // Validate timezone
    if (settings.timezone !== undefined) {
      try {
        // Test if timezone is valid by creating a date with it
        Intl.DateTimeFormat(undefined, { timeZone: settings.timezone });
      } catch {
        errors.push({
          field: 'timezone',
          message: 'Invalid timezone identifier',
        });
      }
    }

    return errors;
  }

  /**
   * Get available languages
   */
  getAvailableLanguages(): Array<{ code: 'en' | 'pt'; name: string }> {
    return [
      { code: 'en', name: 'English' },
      { code: 'pt', name: 'Português' },
    ];
  }

  /**
   * Get available check intervals with descriptions
   */
  getAvailableIntervals(): Array<{ seconds: number; description: string }> {
    return [
      { seconds: 60, description: '1 minute' },
      { seconds: 300, description: '5 minutes (default)' },
      { seconds: 600, description: '10 minutes' },
      { seconds: 900, description: '15 minutes' },
      { seconds: 1800, description: '30 minutes' },
      { seconds: 3600, description: '1 hour' },
    ];
  }
}
