import { database } from '../../database/database.service.js';
import { FeedService } from '../../services/feed.service.js';
import {
  BaseCommandHandler,
  type CommandContext,
  type CommandHandler,
  CommandSchemas,
} from '../handlers/command.handler.js';

/**
 * Add feed command handler
 */
export class AddFeedCommand extends BaseCommandHandler {
  private feedService: FeedService;

  constructor() {
    super();
    this.feedService = new FeedService(database.client);
  }

  static create(): CommandHandler {
    const instance = new AddFeedCommand();
    return {
      name: 'add',
      aliases: ['adicionar'],
      description: 'Add a new RSS feed',
      schema: CommandSchemas.nameAndUrl,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: [string, string]): Promise<void> {
    const [name, url] = args;

    // Auto-fix Reddit URLs by adding .rss if missing
    const fixedUrl = this.fixRedditUrl(url);

    await ctx.reply(ctx.t('status.processing'));

    const result = await this.feedService.addFeed({
      chatId: ctx.chatIdString,
      name,
      url: fixedUrl,
    });

    if (result.success) {
      await ctx.reply(ctx.t('feed.added', { name }));
    } else {
      if (result.errors) {
        for (const error of result.errors) {
          if (error.field === 'name' && error.message.includes('already exists')) {
            await ctx.reply(ctx.t('feed.already_exists', { name }));
          } else {
            await ctx.reply(
              ctx.t('feed.validation_error', { field: error.field, message: error.message })
            );
          }
        }
      } else {
        await ctx.reply(ctx.t('error.internal'));
      }
    }
  }

  /**
   * Fix Reddit URLs by adding .rss if missing
   */
  private fixRedditUrl(url: string): string {
    // Check if it's a Reddit URL
    if (url.includes('reddit.com/r/')) {
      // Remove trailing slash if present
      const cleanUrl = url.replace(/\/$/, '');
      
      // Check if it already ends with .rss
      if (!cleanUrl.endsWith('.rss')) {
        return `${cleanUrl}.rss`;
      }
    }
    
    return url;
  }
}

/**
 * List feeds command handler
 */
export class ListFeedsCommand extends BaseCommandHandler {
  private feedService: FeedService;

  constructor() {
    super();
    this.feedService = new FeedService(database.client);
  }

  static create(): CommandHandler {
    const instance = new ListFeedsCommand();
    return {
      name: 'list',
      aliases: ['listar'],
      description: 'List all RSS feeds',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    const feeds = await this.feedService.listFeeds(ctx.chatIdString);

    if (feeds.length === 0) {
      await ctx.reply(ctx.t('feed.list_empty'));
      return;
    }

    const feedList = feeds
      .map((feed) => {
        const status = feed.enabled ? '✅' : '❌';
        return ctx.t('feed.list_item', {
          status,
          name: feed.name,
          url: feed.url,
        });
      })
      .join('\n');

    const message = `${ctx.t('feed.list_title', { count: feeds.length })}\n\n${feedList}`;
    await ctx.reply(message, { parse_mode: 'Markdown' });
  }
}

/**
 * Remove feed command handler
 */
export class RemoveFeedCommand extends BaseCommandHandler {
  private feedService: FeedService;

  constructor() {
    super();
    this.feedService = new FeedService(database.client);
  }

  static create(): CommandHandler {
    const instance = new RemoveFeedCommand();
    return {
      name: 'remove',
      aliases: ['remover'],
      description: 'Remove an RSS feed',
      schema: CommandSchemas.singleString,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: [string]): Promise<void> {
    const [name] = args;

    const result = await this.feedService.removeFeed(ctx.chatIdString, name);

    if (result.success) {
      await ctx.reply(ctx.t('feed.removed', { name }));
    } else {
      if (result.message === 'Feed not found') {
        await ctx.reply(ctx.t('feed.not_found', { name }));
      } else {
        await ctx.reply(ctx.t('error.internal'));
      }
    }
  }
}

/**
 * Enable feed command handler
 */
export class EnableFeedCommand extends BaseCommandHandler {
  private feedService: FeedService;

  constructor() {
    super();
    this.feedService = new FeedService(database.client);
  }

  static create(): CommandHandler {
    const instance = new EnableFeedCommand();
    return {
      name: 'enable',
      aliases: ['habilitar'],
      description: 'Enable an RSS feed',
      schema: CommandSchemas.singleString,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: [string]): Promise<void> {
    const [name] = args;

    const result = await this.feedService.enableFeed(ctx.chatIdString, name);

    if (result.success) {
      await ctx.reply(ctx.t('feed.enabled', { name }));
    } else {
      if (result.message === 'Feed not found') {
        await ctx.reply(ctx.t('feed.not_found', { name }));
      } else if (result.message === 'Feed is already enabled') {
        await ctx.reply(ctx.t('feed.already_enabled', { name }));
      } else {
        await ctx.reply(ctx.t('error.internal'));
      }
    }
  }
}

/**
 * Disable feed command handler
 */
export class DisableFeedCommand extends BaseCommandHandler {
  private feedService: FeedService;

  constructor() {
    super();
    this.feedService = new FeedService(database.client);
  }

  static create(): CommandHandler {
    const instance = new DisableFeedCommand();
    return {
      name: 'disable',
      aliases: ['desabilitar'],
      description: 'Disable an RSS feed',
      schema: CommandSchemas.singleString,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: [string]): Promise<void> {
    const [name] = args;

    const result = await this.feedService.disableFeed(ctx.chatIdString, name);

    if (result.success) {
      await ctx.reply(ctx.t('feed.disabled', { name }));
    } else {
      if (result.message === 'Feed not found') {
        await ctx.reply(ctx.t('feed.not_found', { name }));
      } else if (result.message === 'Feed is already disabled') {
        await ctx.reply(ctx.t('feed.already_disabled', { name }));
      } else {
        await ctx.reply(ctx.t('error.internal'));
      }
    }
  }
}
