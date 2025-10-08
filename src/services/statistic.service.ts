import { database } from '../database/database.service.js';
import {
  StatisticRepository,
  type StatisticSummary,
} from '../database/repositories/statistic.repository.js';
import { logger } from '../utils/logger/logger.service.js';

export interface DailyStatistic {
  date: string;
  messagesSent: number;
  feedsChecked: number;
}

export interface ChatStatistics {
  totalMessages: number;
  totalFeedChecks: number;
  totalUserActions: number;
  dailyStats: DailyStatistic[];
  summary: StatisticSummary[];
  period: number; // days
}

export class StatisticService {
  private statisticRepository: StatisticRepository;

  constructor() {
    this.statisticRepository = new StatisticRepository(database.client);
  }

  /**
   * Record a message sent action
   */
  async recordMessageSent(chatId: string, feedId?: string, count = 1): Promise<void> {
    try {
      await this.statisticRepository.recordAction(chatId, 'message_sent', feedId, count);
      logger.debug('Recorded message sent statistic', { chatId, feedId, count });
    } catch (error) {
      logger.error('Failed to record message sent statistic', { error, chatId, feedId, count });
    }
  }

  /**
   * Record a feed check action
   */
  async recordFeedCheck(chatId: string, feedId?: string, count = 1): Promise<void> {
    try {
      await this.statisticRepository.recordAction(chatId, 'feed_checked', feedId, count);
      logger.debug('Recorded feed check statistic', { chatId, feedId, count });
    } catch (error) {
      logger.error('Failed to record feed check statistic', { error, chatId, feedId, count });
    }
  }

  /**
   * Record a user action (feed added, removed, etc.)
   */
  async recordUserAction(
    chatId: string,
    action: string,
    feedId?: string,
    count = 1
  ): Promise<void> {
    try {
      await this.statisticRepository.recordAction(chatId, action, feedId, count);
      logger.debug('Recorded user action statistic', { chatId, action, feedId, count });
    } catch (error) {
      logger.error('Failed to record user action statistic', {
        error,
        chatId,
        action,
        feedId,
        count,
      });
    }
  }

  /**
   * Get comprehensive statistics for a chat
   */
  async getChatStatistics(chatId: string, days = 30): Promise<ChatStatistics> {
    try {
      const [totalMessages, totalFeedChecks, dailyStats, summary, userActionStats] =
        await Promise.all([
          this.statisticRepository.getMessagesSentCount(chatId, days),
          this.statisticRepository.getFeedChecksCount(chatId, days),
          this.statisticRepository.getDailyStats(chatId, days),
          this.statisticRepository.getSummaryByChatId(chatId, days),
          this.getUserActionCount(chatId, days),
        ]);

      return {
        totalMessages,
        totalFeedChecks,
        totalUserActions: userActionStats,
        dailyStats,
        summary,
        period: days,
      };
    } catch (error) {
      logger.error('Failed to get chat statistics', { error, chatId, days });
      throw error;
    }
  }

  /**
   * Get user action count (feed_added, feed_removed, etc.)
   */
  private async getUserActionCount(chatId: string, days = 30): Promise<number> {
    const userActions = [
      'feed_added',
      'feed_removed',
      'feed_enabled',
      'feed_disabled',
      'settings_changed',
      'filter_added',
      'filter_removed',
    ];

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.statisticRepository.findMany({
      chatId,
      action: {
        in: userActions,
      },
      date: {
        gte: startDate,
      },
    });

    return stats.reduce((total, stat) => total + stat.count, 0);
  }

  /**
   * Check if there are any statistics for a chat
   */
  async hasStatistics(chatId: string): Promise<boolean> {
    try {
      const stats = await this.statisticRepository.findMany({
        chatId,
      });
      return stats.length > 0;
    } catch (error) {
      logger.error('Failed to check if statistics exist', { error, chatId });
      return false;
    }
  }

  /**
   * Get statistics for the last N days with daily breakdown
   */
  async getDailyStatistics(chatId: string, days = 30): Promise<DailyStatistic[]> {
    try {
      return await this.statisticRepository.getDailyStats(chatId, days);
    } catch (error) {
      logger.error('Failed to get daily statistics', { error, chatId, days });
      throw error;
    }
  }

  /**
   * Clean up old statistics (for maintenance)
   */
  async cleanupOldStatistics(days = 90): Promise<number> {
    try {
      const deletedCount = await this.statisticRepository.cleanupOldStatistics(days);
      logger.info('Cleaned up old statistics', { deletedCount, days });
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old statistics', { error, days });
      throw error;
    }
  }

  /**
   * Get top performing feeds by message count
   */
  async getTopFeeds(
    chatId: string,
    days = 30,
    limit = 5
  ): Promise<Array<{ feedId: string; messageCount: number }>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await this.statisticRepository.findMany({
        chatId,
        action: 'message_sent',
        feedId: {
          not: null,
        },
        date: {
          gte: startDate,
        },
      });

      // Group by feedId and sum counts
      const feedStats = new Map<string, number>();
      stats.forEach((stat) => {
        if (stat.feedId) {
          const current = feedStats.get(stat.feedId) || 0;
          feedStats.set(stat.feedId, current + stat.count);
        }
      });

      // Sort and limit
      return Array.from(feedStats.entries())
        .map(([feedId, messageCount]) => ({ feedId, messageCount }))
        .sort((a, b) => b.messageCount - a.messageCount)
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to get top feeds', { error, chatId, days, limit });
      throw error;
    }
  }

  /**
   * Record multiple statistics in batch
   */
  async recordBatch(
    records: Array<{
      chatId: string;
      action: string;
      feedId?: string;
      count?: number;
    }>
  ): Promise<void> {
    try {
      await Promise.all(
        records.map((record) =>
          this.statisticRepository.recordAction(
            record.chatId,
            record.action,
            record.feedId,
            record.count || 1
          )
        )
      );
      logger.debug('Recorded batch statistics', { count: records.length });
    } catch (error) {
      logger.error('Failed to record batch statistics', { error, count: records.length });
      throw error;
    }
  }
}
