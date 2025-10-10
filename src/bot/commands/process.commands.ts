import { database } from '../../database/database.service.js';
import { feedQueueService } from '../../jobs/index.js';
import {
  BaseCommandHandler,
  type CommandContext,
  type CommandHandler,
  CommandSchemas,
} from '../handlers/command.handler.js';
import { logger } from '../../utils/logger/logger.service.js';

/**
 * Secret command to process feeds immediately
 * This command is not listed in help and is for admin/debug purposes
 */
export class ProcessFeedsCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new ProcessFeedsCommand();
    return {
      name: 'processar',
      aliases: ['process'],
      description: 'Process all feeds immediately (secret command)',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    try {
      await ctx.reply(ctx.t('status.processing') || '🔄 Processing feeds...');

      // Get all enabled feeds for this chat
      const feeds = await database.client.feed.findMany({
        where: {
          chatId: ctx.chatIdString,
          enabled: true,
        },
        include: {
          filters: true,
        },
      });

      if (feeds.length === 0) {
        await ctx.reply(ctx.t('feed.no_feeds') || '❌ No feeds found for this chat.');
        return;
      }

      let processedCount = 0;
      let errorCount = 0;

      // Process each feed immediately
      for (const feed of feeds) {
        try {
          logger.info(`Processing feed immediately: ${feed.name} (${feed.id})`);
          
          // Schedule immediate feed check (no delay)
          await feedQueueService.scheduleFeedCheck({
            feedId: feed.id,
            chatId: feed.chatId,
            feedUrl: feed.rssUrl,
            lastItemId: feed.lastItemId ?? undefined,
            failureCount: 0,
          }, 0); // 0 delay = immediate processing

          processedCount++;
        } catch (error) {
          errorCount++;
          logger.error(`Failed to process feed ${feed.name}:`, error);
        }
      }

      // Send result message
      let resultMessage = `✅ **Feed Processing Complete**\n\n`;
      resultMessage += `📊 **Results:**\n`;
      resultMessage += `• Feeds processed: ${processedCount}\n`;
      resultMessage += `• Errors: ${errorCount}\n`;
      resultMessage += `• Total feeds: ${feeds.length}\n\n`;
      
      if (processedCount > 0) {
        resultMessage += `🔄 Feeds are being checked now. New items will be sent shortly.`;
      } else {
        resultMessage += `❌ No feeds could be processed.`;
      }

      await ctx.reply(resultMessage, { parse_mode: 'Markdown' });

      logger.info(`Manual feed processing completed for chat ${ctx.chatIdString}: ${processedCount}/${feeds.length} feeds processed`);
    } catch (error) {
      logger.error('Failed to process feeds manually:', error);
      await ctx.reply(ctx.t('error.internal') || '❌ Failed to process feeds. Please try again later.');
    }
  }
}

/**
 * Secret command to process a specific feed immediately
 */
export class ProcessFeedCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new ProcessFeedCommand();
    return {
      name: 'processarfeed',
      aliases: ['processfeed'],
      description: 'Process specific feed immediately (secret command)',
      schema: CommandSchemas.singleString,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: [string]): Promise<void> {
    const [feedName] = args;

    try {
      await ctx.reply(ctx.t('status.processing') || '🔄 Processing feed...');

      // Find the specific feed
      const feed = await database.client.feed.findFirst({
        where: {
          chatId: ctx.chatIdString,
          name: feedName,
          enabled: true,
        },
        include: {
          filters: true,
        },
      });

      if (!feed) {
        await ctx.reply(ctx.t('feed.not_found', { name: feedName }) || `❌ Feed "${feedName}" not found.`);
        return;
      }

      logger.info(`Processing specific feed immediately: ${feed.name} (${feed.id})`);

      // Schedule immediate feed check
      await feedQueueService.scheduleFeedCheck({
        feedId: feed.id,
        chatId: feed.chatId,
        feedUrl: feed.rssUrl,
        lastItemId: feed.lastItemId ?? undefined,
        failureCount: 0,
      }, 0); // 0 delay = immediate processing

      await ctx.reply(
        `✅ **Feed Processing Started**\n\n` +
        `📰 **Feed:** ${feed.name}\n` +
        `🔗 **URL:** ${feed.rssUrl}\n` +
        `🔄 **Status:** Processing now...\n\n` +
        `New items will be sent shortly if available.`,
        { parse_mode: 'Markdown' }
      );

      logger.info(`Manual feed processing started for feed ${feed.name} in chat ${ctx.chatIdString}`);
    } catch (error) {
      logger.error(`Failed to process feed ${feedName}:`, error);
      await ctx.reply(ctx.t('error.internal') || '❌ Failed to process feed. Please try again later.');
    }
  }
}
