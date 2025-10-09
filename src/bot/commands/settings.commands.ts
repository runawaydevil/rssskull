import { database } from '../../database/database.service.js';
import { ChatRepository } from '../../database/repositories/chat.repository.js';
import { SettingsService } from '../../services/settings.service.js';
import { TemplateService } from '../../services/template.service.js';
import { logger } from '../../utils/logger/logger.service.js';
import {
  BaseCommandHandler,
  type CommandContext,
  type CommandHandler,
  CommandSchemas,
} from '../handlers/command.handler.js';

/**
 * Settings command handler
 */
export class SettingsCommand extends BaseCommandHandler {
  private settingsService: SettingsService;

  constructor() {
    super();
    const chatRepository = new ChatRepository(database.client);
    this.settingsService = new SettingsService(chatRepository);
  }

  static create(): CommandHandler {
    const instance = new SettingsCommand();
    return {
      name: 'settings',
      aliases: ['configuracoes'],
      description: 'View and manage chat settings',
      schema: CommandSchemas.optionalArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: string[]): Promise<void> {
    try {
      const chatId = ctx.chat?.id?.toString();
      if (!chatId) {
        await ctx.reply(ctx.t('error.internal'));
        return;
      }

      // If no arguments, show current settings
      if (args.length === 0) {
        await this.showSettings(ctx, chatId);
        return;
      }

      const [action, ...params] = args;

      if (!action) {
        await ctx.reply(ctx.t('settings.help'));
        return;
      }

      switch (action.toLowerCase()) {
        case 'language':
        case 'idioma':
          await this.updateLanguage(ctx, chatId, params);
          break;

        case 'interval':
        case 'intervalo':
          await this.updateInterval(ctx, chatId, params);
          break;

        case 'template':
          await this.updateTemplate(ctx, chatId, params);
          break;

        case 'reset':
        case 'resetar':
          await this.resetSettings(ctx, chatId);
          break;

        default:
          await ctx.reply(ctx.t('settings.help'));
          break;
      }
    } catch (error) {
      logger.error('Settings command error', { error, chatId: ctx.chat?.id });
      await ctx.reply(ctx.t('error.internal'));
    }
  }

  private async showSettings(ctx: CommandContext, chatId: string): Promise<void> {
    try {
      const settings = await this.settingsService.getSettings(chatId);

      // Get interval description
      const intervals = this.settingsService.getAvailableIntervals();
      const intervalInfo = intervals.find((i) => i.seconds === settings.checkInterval);
      const intervalDescription = intervalInfo?.description || `${settings.checkInterval}s`;

      // Format language display
      const languageDisplay = settings.language === 'pt' ? 'Português' : 'English';

      // Format filters status
      const filtersStatus = settings.enableFilters
        ? ctx.t('settings.enabled')
        : ctx.t('settings.disabled');

      // Format template display
      const templateDisplay = settings.messageTemplate ?? ctx.t('settings.no_template');

      const message = [
        ctx.t('settings.title'),
        '',
        ctx.t('settings.language', { language: languageDisplay }),
        ctx.t('settings.check_interval', {
          interval: settings.checkInterval.toString(),
          description: intervalDescription,
        }),
        ctx.t('settings.max_feeds', { count: settings.maxFeeds.toString() }),
        ctx.t('settings.filters_enabled', { status: filtersStatus }),
        ctx.t('settings.message_template', { template: templateDisplay }),
        ctx.t('settings.timezone', { timezone: settings.timezone }),
        '',
        ctx.t('settings.help'),
      ].join('\n');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Failed to show settings', { error, chatId });
      await ctx.reply(ctx.t('error.internal'));
    }
  }

  private async updateLanguage(
    ctx: CommandContext,
    chatId: string,
    params: string[]
  ): Promise<void> {
    if (params.length === 0) {
      await ctx.reply(ctx.t('settings.available_languages'));
      return;
    }

    const language = params[0]?.toLowerCase();
    if (!language || (language !== 'en' && language !== 'pt')) {
      await ctx.reply(ctx.t('settings.available_languages'));
      return;
    }

    try {
      await this.settingsService.updateLanguage(chatId, language);
      const languageDisplay = language === 'pt' ? 'Português' : 'English';
      await ctx.reply(ctx.t('settings.language_updated', { language: languageDisplay }));
    } catch (error) {
      logger.error('Failed to update language', { error, chatId, language });
      if (error instanceof Error && error.message.includes('Validation failed')) {
        await ctx.reply(error.message);
      } else {
        await ctx.reply(ctx.t('error.internal'));
      }
    }
  }

  private async updateInterval(
    ctx: CommandContext,
    chatId: string,
    params: string[]
  ): Promise<void> {
    if (params.length === 0) {
      await ctx.reply(ctx.t('settings.available_intervals'));
      return;
    }

    const intervalStr = params[0];
    if (!intervalStr) {
      await ctx.reply(ctx.t('settings.available_intervals'));
      return;
    }

    const interval = Number.parseInt(intervalStr, 10);

    if (Number.isNaN(interval)) {
      await ctx.reply(ctx.t('settings.available_intervals'));
      return;
    }

    try {
      await this.settingsService.updateCheckInterval(chatId, interval);
      await ctx.reply(ctx.t('settings.interval_updated', { interval: interval.toString() }));
    } catch (error) {
      logger.error('Failed to update interval', { error, chatId, interval });
      if (error instanceof Error && error.message.includes('Validation failed')) {
        await ctx.reply(error.message);
      } else {
        await ctx.reply(ctx.t('error.internal'));
      }
    }
  }

  private async updateTemplate(
    ctx: CommandContext,
    chatId: string,
    params: string[]
  ): Promise<void> {
    if (params.length === 0) {
      // Clear template
      try {
        await this.settingsService.updateMessageTemplate(chatId, null);
        await ctx.reply(ctx.t('settings.template_cleared'));
      } catch (error) {
        logger.error('Failed to clear template', { error, chatId });
        await ctx.reply(ctx.t('error.internal'));
      }
      return;
    }

    const template = params.join(' ');

    try {
      // Validate template before updating
      const validationErrors = TemplateService.validateTemplate(template);
      if (validationErrors.length > 0) {
        const errorMessage = validationErrors.map((err) => `❌ ${err.message}`).join('\n');
        await ctx.reply(errorMessage);
        return;
      }

      await this.settingsService.updateMessageTemplate(chatId, template);

      // Show preview of the template
      const preview = TemplateService.previewTemplate(template);
      const message = [
        ctx.t('settings.template_updated'),
        '',
        ctx.t('template.preview_title'),
        ctx.t('template.preview_result', { result: preview }),
      ].join('\n');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Failed to update template', { error, chatId, template });
      if (error instanceof Error && error.message.includes('Validation failed')) {
        await ctx.reply(error.message);
      } else {
        await ctx.reply(ctx.t('error.internal'));
      }
    }
  }

  private async resetSettings(ctx: CommandContext, chatId: string): Promise<void> {
    try {
      await this.settingsService.resetSettings(chatId);
      await ctx.reply(ctx.t('settings.reset'));
    } catch (error) {
      logger.error('Failed to reset settings', { error, chatId });
      await ctx.reply(ctx.t('error.internal'));
    }
  }
}

// FiltersCommand is now implemented in filter.commands.ts
// Re-export it here for backward compatibility
export { FiltersCommand } from './filter.commands.js';
