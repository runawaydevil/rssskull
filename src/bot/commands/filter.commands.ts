import { z } from 'zod';
import { database } from '../../database/database.service.js';
import { FeedService } from '../../services/feed.service.js';
import { FilterService } from '../../services/filter.service.js';
import {
  BaseCommandHandler,
  type CommandContext,
  type CommandHandler,
  CommandSchemas,
} from '../handlers/command.handler.js';

/**
 * Validation schemas for filter commands
 */
const FilterCommandSchemas = {
  // Feed name only
  feedName: z.array(z.string()).length(1),

  // Feed name, filter type, and pattern
  addFilter: z
    .array(z.string())
    .min(3)
    .max(4)
    .refine(
      (args) => {
        const [feedName, type, pattern] = args;

        // Validate feed name
        if (!feedName || feedName.length < 1 || feedName.length > 50) return false;

        // Validate filter type
        if (type !== 'include' && type !== 'exclude') return false;

        // Validate pattern
        if (!pattern || pattern.length < 1 || pattern.length > 500) return false;

        return true;
      },
      {
        message:
          'Invalid filter format. Use: /filter add <feed_name> <include|exclude> <pattern> [regex]',
      }
    ),

  // Feed name and filter ID
  removeFilter: z.array(z.string()).length(2),

  // Filter test arguments
  testFilter: z
    .array(z.string())
    .min(3)
    .max(4)
    .refine(
      (args) => {
        const [type, pattern, sampleText] = args;

        // Validate filter type
        if (type !== 'include' && type !== 'exclude') return false;

        // Validate pattern
        if (!pattern || pattern.length < 1 || pattern.length > 500) return false;

        // Validate sample text
        if (!sampleText || sampleText.length < 1) return false;

        return true;
      },
      {
        message:
          'Invalid test format. Use: /filter test <include|exclude> <pattern> <sample_text> [regex]',
      }
    ),
};

/**
 * Main filters command handler - shows help and manages subcommands
 */
export class FiltersCommand extends BaseCommandHandler {
  private filterService: FilterService;
  private feedService: FeedService;

  constructor() {
    super();
    this.filterService = new FilterService(database.client);
    this.feedService = new FeedService(database.client);
  }

  static create(): CommandHandler {
    const instance = new FiltersCommand();
    return {
      name: 'filters',
      aliases: ['filtros'],
      description: 'Manage feed filters',
      schema: CommandSchemas.optionalArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: string[]): Promise<void> {
    if (args.length === 0) {
      // Show help
      await this.showHelp(ctx);
      return;
    }

    const [subcommand, ...subArgs] = args;

    switch (subcommand?.toLowerCase()) {
      case 'list':
      case 'listar':
        await this.listFilters(ctx, subArgs);
        break;
      case 'add':
      case 'adicionar':
        await this.addFilter(ctx, subArgs);
        break;
      case 'remove':
      case 'remover':
        await this.removeFilter(ctx, subArgs);
        break;
      case 'clear':
      case 'limpar':
        await this.clearFilters(ctx, subArgs);
        break;
      case 'test':
      case 'testar':
        await this.testFilter(ctx, subArgs);
        break;
      case 'stats':
      case 'estatisticas':
        await this.showStats(ctx, subArgs);
        break;
      default:
        await ctx.reply(ctx.t('filter.unknown_command', { command: subcommand || 'unknown' }));
        await this.showHelp(ctx);
    }
  }

  private async showHelp(ctx: CommandContext): Promise<void> {
    const helpText = ctx.t('filter.help', {
      prefix: ctx.isPrivate ? '/' : '/filters',
    });
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  }

  private async listFilters(ctx: CommandContext, args: string[]): Promise<void> {
    // Validate arguments
    const validation = FilterCommandSchemas.feedName.safeParse(args);
    if (!validation.success) {
      await ctx.reply(ctx.t('filter.list_usage'));
      return;
    }

    const [feedName] = validation.data;
    if (!feedName) {
      await ctx.reply(ctx.t('filter.list_usage'));
      return;
    }

    // Find the feed
    const feeds = await this.feedService.listFeeds(ctx.chatIdString);
    const feed = feeds.find((f) => f.name.toLowerCase() === feedName.toLowerCase());

    if (!feed) {
      await ctx.reply(ctx.t('feed.not_found', { name: feedName }));
      return;
    }

    // Get filters
    const result = await this.filterService.listFilters(feed.id);

    if (!result.success) {
      await ctx.reply(ctx.t('error.internal'));
      return;
    }

    if (result.filters.length === 0) {
      await ctx.reply(ctx.t('filter.list_empty', { feedName }));
      return;
    }

    // Format filter list
    const filterList = result.filters
      .map((filter, index) => {
        const typeIcon = filter.type === 'include' ? '✅' : '❌';
        const regexIcon = filter.isRegex ? '🔤' : '📝';
        return ctx.t('filter.list_item', {
          index: (index + 1).toString(),
          typeIcon,
          regexIcon,
          type: filter.type,
          pattern: filter.pattern,
          id: filter.id.slice(-8), // Show last 8 chars of ID
        });
      })
      .join('\n');

    const statsText = ctx.t('filter.stats', {
      total: result.stats.totalFilters.toString(),
      include: result.stats.includeFilters.toString(),
      exclude: result.stats.excludeFilters.toString(),
      regex: result.stats.regexFilters.toString(),
    });

    const message = `${ctx.t('filter.list_title', { feedName })}\n\n${filterList}\n\n${statsText}`;
    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  private async addFilter(ctx: CommandContext, args: string[]): Promise<void> {
    // Validate arguments
    const validation = FilterCommandSchemas.addFilter.safeParse(args);
    if (!validation.success) {
      await ctx.reply(ctx.t('filter.add_usage'));
      return;
    }

    const [feedName, type, pattern, regexFlag] = validation.data;
    if (!feedName || !type || !pattern) {
      await ctx.reply(ctx.t('filter.add_usage'));
      return;
    }

    const isRegex = regexFlag === 'regex' || regexFlag === 'true';

    // Find the feed
    const feeds = await this.feedService.listFeeds(ctx.chatIdString);
    const feed = feeds.find((f) => f.name.toLowerCase() === feedName.toLowerCase());

    if (!feed) {
      await ctx.reply(ctx.t('feed.not_found', { name: feedName }));
      return;
    }

    // Check if can add more filters
    const canAdd = await this.filterService.canAddFilter(feed.id);
    if (!canAdd.canAdd) {
      await ctx.reply(
        ctx.t('filter.limit_exceeded', {
          current: canAdd.currentCount.toString(),
          max: canAdd.maxAllowed.toString(),
        })
      );
      return;
    }

    await ctx.reply(ctx.t('status.processing'));

    // Add the filter
    const result = await this.filterService.addFilter({
      feedId: feed.id,
      type: type as 'include' | 'exclude',
      pattern,
      isRegex,
    });

    if (result.success) {
      await ctx.reply(
        ctx.t('filter.added', {
          type,
          pattern,
          feedName,
          isRegex: isRegex ? ctx.t('filter.regex_yes') : ctx.t('filter.regex_no'),
        })
      );
    } else {
      if (result.message.includes('already exists')) {
        await ctx.reply(ctx.t('filter.already_exists', { pattern, feedName }));
      } else if (result.message.includes('Invalid regex')) {
        await ctx.reply(ctx.t('filter.invalid_regex', { pattern }));
      } else if (result.message.includes('limit')) {
        await ctx.reply(
          ctx.t('filter.limit_exceeded', {
            current: canAdd.currentCount.toString(),
            max: canAdd.maxAllowed.toString(),
          })
        );
      } else {
        await ctx.reply(ctx.t('filter.add_error', { error: result.message }));
      }
    }
  }

  private async removeFilter(ctx: CommandContext, args: string[]): Promise<void> {
    // Validate arguments
    const validation = FilterCommandSchemas.removeFilter.safeParse(args);
    if (!validation.success) {
      await ctx.reply(ctx.t('filter.remove_usage'));
      return;
    }

    const [feedName, filterIdOrIndex] = validation.data;
    if (!feedName || !filterIdOrIndex) {
      await ctx.reply(ctx.t('filter.remove_usage'));
      return;
    }

    // Find the feed
    const feeds = await this.feedService.listFeeds(ctx.chatIdString);
    const feed = feeds.find((f) => f.name.toLowerCase() === feedName.toLowerCase());

    if (!feed) {
      await ctx.reply(ctx.t('feed.not_found', { name: feedName }));
      return;
    }

    // Get filters to find the one to remove
    const listResult = await this.filterService.listFilters(feed.id);
    if (!listResult.success) {
      await ctx.reply(ctx.t('error.internal'));
      return;
    }

    let filterId: string;

    // Check if it's an index (number) or ID
    const index = Number.parseInt(filterIdOrIndex);
    if (!isNaN(index) && index > 0 && index <= listResult.filters.length) {
      // It's a valid index
      filterId = listResult.filters[index - 1]?.id || '';
      if (!filterId) {
        await ctx.reply(ctx.t('filter.not_found', { id: filterIdOrIndex }));
        return;
      }
    } else {
      // Try to find by partial ID match
      const matchingFilter = listResult.filters.find(
        (f) => f.id.endsWith(filterIdOrIndex) || f.id === filterIdOrIndex
      );
      if (!matchingFilter) {
        await ctx.reply(ctx.t('filter.not_found', { id: filterIdOrIndex }));
        return;
      }
      filterId = matchingFilter.id;
    }

    // Remove the filter
    const result = await this.filterService.removeFilter(filterId, feed.id);

    if (result.success) {
      await ctx.reply(ctx.t('filter.removed', { feedName }));
    } else {
      await ctx.reply(ctx.t('filter.remove_error', { error: result.message }));
    }
  }

  private async clearFilters(ctx: CommandContext, args: string[]): Promise<void> {
    // Validate arguments
    const validation = FilterCommandSchemas.feedName.safeParse(args);
    if (!validation.success) {
      await ctx.reply(ctx.t('filter.clear_usage'));
      return;
    }

    const [feedName] = validation.data;
    if (!feedName) {
      await ctx.reply(ctx.t('filter.clear_usage'));
      return;
    }

    // Find the feed
    const feeds = await this.feedService.listFeeds(ctx.chatIdString);
    const feed = feeds.find((f) => f.name.toLowerCase() === feedName.toLowerCase());

    if (!feed) {
      await ctx.reply(ctx.t('feed.not_found', { name: feedName }));
      return;
    }

    // Clear all filters
    const result = await this.filterService.clearFilters(feed.id);

    if (result.success) {
      await ctx.reply(ctx.t('filter.cleared', { feedName, message: result.message }));
    } else {
      await ctx.reply(ctx.t('filter.clear_error', { error: result.message }));
    }
  }

  private async testFilter(ctx: CommandContext, args: string[]): Promise<void> {
    // Validate arguments
    const validation = FilterCommandSchemas.testFilter.safeParse(args);
    if (!validation.success) {
      await ctx.reply(ctx.t('filter.test_usage'));
      return;
    }

    const [type, pattern, sampleText, regexFlag] = validation.data;
    if (!type || !pattern || !sampleText) {
      await ctx.reply(ctx.t('filter.test_usage'));
      return;
    }

    const isRegex = regexFlag === 'regex' || regexFlag === 'true';

    // Test the filter
    const result = await this.filterService.testFilter(
      type as 'include' | 'exclude',
      pattern,
      isRegex,
      sampleText
    );

    if (result.success) {
      const matchIcon = result.matches ? '✅' : '❌';
      await ctx.reply(
        ctx.t('filter.test_result', {
          matchIcon,
          type,
          pattern,
          sampleText,
          result: result.message,
          isRegex: isRegex ? ctx.t('filter.regex_yes') : ctx.t('filter.regex_no'),
        })
      );
    } else {
      await ctx.reply(ctx.t('filter.test_error', { error: result.error || result.message }));
    }
  }

  private async showStats(ctx: CommandContext, args: string[]): Promise<void> {
    // Validate arguments
    const validation = FilterCommandSchemas.feedName.safeParse(args);
    if (!validation.success) {
      await ctx.reply(ctx.t('filter.stats_usage'));
      return;
    }

    const [feedName] = validation.data;
    if (!feedName) {
      await ctx.reply(ctx.t('filter.stats_usage'));
      return;
    }

    // Find the feed
    const feeds = await this.feedService.listFeeds(ctx.chatIdString);
    const feed = feeds.find((f) => f.name.toLowerCase() === feedName.toLowerCase());

    if (!feed) {
      await ctx.reply(ctx.t('feed.not_found', { name: feedName }));
      return;
    }

    // Get filter stats
    const result = await this.filterService.getFilterStats(feed.id);

    if (result.success && result.stats) {
      const statsText = ctx.t('filter.detailed_stats', {
        feedName,
        total: result.stats.totalFilters.toString(),
        include: result.stats.includeFilters.toString(),
        exclude: result.stats.excludeFilters.toString(),
        regex: result.stats.regexFilters.toString(),
        remaining: result.stats.remainingSlots.toString(),
        max: result.stats.maxFilters.toString(),
      });

      await ctx.reply(statsText, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(ctx.t('filter.stats_error', { error: result.message || 'Unknown error' }));
    }
  }
}
