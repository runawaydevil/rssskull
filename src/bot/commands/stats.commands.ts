import { database } from '../../database/database.service.js';
import { FeedService } from '../../services/feed.service.js';
import { StatisticService } from '../../services/statistic.service.js';
import { logger } from '../../utils/logger/logger.service.js';
import {
  BaseCommandHandler,
  type CommandContext,
  type CommandHandler,
  CommandSchemas,
} from '../handlers/command.handler.js';

/**
 * Statistics command handler
 */
export class StatsCommand extends BaseCommandHandler {
  private statisticService: StatisticService;
  private feedService: FeedService;

  constructor() {
    super();
    this.statisticService = new StatisticService();
    this.feedService = new FeedService(database.client);
  }

  static create(): CommandHandler {
    const instance = new StatsCommand();
    return {
      name: 'stats',
      aliases: ['estatisticas'],
      description: 'View usage statistics',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    const chatId = ctx.chat?.id?.toString();

    if (!chatId) {
      await ctx.reply(ctx.t('error.internal'));
      return;
    }

    try {
      // Check if there are any statistics for this chat
      const hasStats = await this.statisticService.hasStatistics(chatId);

      if (!hasStats) {
        await ctx.reply(ctx.t('stats.no_data'));
        return;
      }

      // Get comprehensive statistics for the last 30 days
      const stats = await this.statisticService.getChatStatistics(chatId, 30);

      // Format the period text
      const periodText = ctx.t('stats.period_30');

      // Build the response message
      let message = `${ctx.t('stats.title', { period: periodText })}\n\n`;

      // Add summary
      message += `${ctx.t('stats.summary', {
        messages: stats.totalMessages,
        checks: stats.totalFeedChecks,
        actions: stats.totalUserActions,
      })}\n\n`;

      // Add daily activity (last 7 days for brevity)
      const recentDays = stats.dailyStats.slice(-7);
      if (recentDays.length > 0) {
        message += `${ctx.t('stats.daily_title')}\n`;
        for (const day of recentDays) {
          const formattedDate = this.formatDate(day.date, ctx.language);
          message += `${ctx.t('stats.daily_item', {
            date: formattedDate,
            messages: day.messagesSent,
            checks: day.feedsChecked,
          })}\n`;
        }
        message += '\n';
      }

      // Add top feeds
      const topFeeds = await this.statisticService.getTopFeeds(chatId, 30, 5);
      if (topFeeds.length > 0) {
        message += `${ctx.t('stats.top_feeds_title')}\n`;

        // Get feed names for the top feeds
        const feeds = await this.feedService.listFeeds(chatId);
        const feedMap = new Map(feeds.map((feed) => [feed.id, feed.name]));

        for (const topFeed of topFeeds) {
          const feedName = feedMap.get(topFeed.feedId) || topFeed.feedId;
          message += `${ctx.t('stats.top_feed_item', {
            feedId: feedName,
            count: topFeed.messageCount,
          })}\n`;
        }
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });

      // Record this user action
      await this.statisticService.recordUserAction(chatId, 'stats_viewed');
    } catch (error) {
      logger.error('Failed to get statistics', { error, chatId });
      await ctx.reply(ctx.t('stats.error', { error: 'Internal error' }));
    }
  }

  /**
   * Format date for display based on language
   */
  private formatDate(dateStr: string, language: 'en' | 'pt'): string {
    const date = new Date(dateStr);

    if (language === 'pt') {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}
