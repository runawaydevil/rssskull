import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatisticService } from './statistic.service.js';

// Mock the logger service
vi.mock('../utils/logger/logger.service.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the database service and repository
const mockStatisticRepository = {
  recordAction: vi.fn(),
  getMessagesSentCount: vi.fn(),
  getFeedChecksCount: vi.fn(),
  getDailyStats: vi.fn(),
  getSummaryByChatId: vi.fn(),
  findMany: vi.fn(),
  cleanupOldStatistics: vi.fn(),
};

vi.mock('../database/database.service.js', () => ({
  database: {
    client: {},
  },
}));

vi.mock('../database/repositories/statistic.repository.js', () => ({
  StatisticRepository: vi.fn(() => mockStatisticRepository),
}));

describe('StatisticService', () => {
  let statisticService: StatisticService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    statisticService = new StatisticService();
  });

  describe('recordMessageSent', () => {
    it('should record a message sent action', async () => {
      mockStatisticRepository.recordAction.mockResolvedValue({});

      await statisticService.recordMessageSent('chat123', 'feed456', 2);

      expect(mockStatisticRepository.recordAction).toHaveBeenCalledWith(
        'chat123',
        'message_sent',
        'feed456',
        2
      );
    });

    it('should handle errors gracefully', async () => {
      mockStatisticRepository.recordAction.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(statisticService.recordMessageSent('chat123')).resolves.toBeUndefined();
    });
  });

  describe('recordFeedCheck', () => {
    it('should record a feed check action', async () => {
      mockStatisticRepository.recordAction.mockResolvedValue({});

      await statisticService.recordFeedCheck('chat123', 'feed456');

      expect(mockStatisticRepository.recordAction).toHaveBeenCalledWith(
        'chat123',
        'feed_checked',
        'feed456',
        1
      );
    });
  });

  describe('recordUserAction', () => {
    it('should record a user action', async () => {
      mockStatisticRepository.recordAction.mockResolvedValue({});

      await statisticService.recordUserAction('chat123', 'feed_added', 'feed456');

      expect(mockStatisticRepository.recordAction).toHaveBeenCalledWith(
        'chat123',
        'feed_added',
        'feed456',
        1
      );
    });
  });

  describe('getChatStatistics', () => {
    it('should return comprehensive chat statistics', async () => {
      const mockDailyStats = [
        { date: '2024-01-01', messagesSent: 5, feedsChecked: 10 },
        { date: '2024-01-02', messagesSent: 3, feedsChecked: 8 },
      ];
      const mockSummary = [
        { action: 'message_sent', totalCount: 8, date: new Date() },
        { action: 'feed_checked', totalCount: 18, date: new Date() },
      ];
      const mockUserActions = [
        { chatId: 'chat123', action: 'feed_added', count: 2, date: new Date() },
      ];

      mockStatisticRepository.getMessagesSentCount.mockResolvedValue(8);
      mockStatisticRepository.getFeedChecksCount.mockResolvedValue(18);
      mockStatisticRepository.getDailyStats.mockResolvedValue(mockDailyStats);
      mockStatisticRepository.getSummaryByChatId.mockResolvedValue(mockSummary);
      mockStatisticRepository.findMany.mockResolvedValue(mockUserActions);

      const result = await statisticService.getChatStatistics('chat123', 30);

      expect(result).toEqual({
        totalMessages: 8,
        totalFeedChecks: 18,
        totalUserActions: 2,
        dailyStats: mockDailyStats,
        summary: mockSummary,
        period: 30,
      });
    });

    it('should handle errors by rethrowing them', async () => {
      mockStatisticRepository.getMessagesSentCount.mockRejectedValue(new Error('Database error'));

      await expect(statisticService.getChatStatistics('chat123')).rejects.toThrow('Database error');
    });
  });

  describe('hasStatistics', () => {
    it('should return true when statistics exist', async () => {
      mockStatisticRepository.findMany.mockResolvedValue([{ id: '1' }]);

      const result = await statisticService.hasStatistics('chat123');

      expect(result).toBe(true);
    });

    it('should return false when no statistics exist', async () => {
      mockStatisticRepository.findMany.mockResolvedValue([]);

      const result = await statisticService.hasStatistics('chat123');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockStatisticRepository.findMany.mockRejectedValue(new Error('Database error'));

      const result = await statisticService.hasStatistics('chat123');

      expect(result).toBe(false);
    });
  });

  describe('getDailyStatistics', () => {
    it('should return daily statistics', async () => {
      const mockDailyStats = [{ date: '2024-01-01', messagesSent: 5, feedsChecked: 10 }];
      mockStatisticRepository.getDailyStats.mockResolvedValue(mockDailyStats);

      const result = await statisticService.getDailyStatistics('chat123', 7);

      expect(result).toEqual(mockDailyStats);
      expect(mockStatisticRepository.getDailyStats).toHaveBeenCalledWith('chat123', 7);
    });
  });

  describe('cleanupOldStatistics', () => {
    it('should cleanup old statistics and return count', async () => {
      mockStatisticRepository.cleanupOldStatistics.mockResolvedValue(42);

      const result = await statisticService.cleanupOldStatistics(90);

      expect(result).toBe(42);
      expect(mockStatisticRepository.cleanupOldStatistics).toHaveBeenCalledWith(90);
    });
  });

  describe('getTopFeeds', () => {
    it('should return top performing feeds', async () => {
      const mockStats = [
        { feedId: 'feed1', action: 'message_sent', count: 10, chatId: 'chat123', date: new Date() },
        { feedId: 'feed2', action: 'message_sent', count: 5, chatId: 'chat123', date: new Date() },
        { feedId: 'feed1', action: 'message_sent', count: 3, chatId: 'chat123', date: new Date() },
      ];
      mockStatisticRepository.findMany.mockResolvedValue(mockStats);

      const result = await statisticService.getTopFeeds('chat123', 30, 2);

      expect(result).toEqual([
        { feedId: 'feed1', messageCount: 13 },
        { feedId: 'feed2', messageCount: 5 },
      ]);
    });
  });

  describe('recordBatch', () => {
    it('should record multiple statistics in batch', async () => {
      mockStatisticRepository.recordAction.mockResolvedValue({});

      const records = [
        { chatId: 'chat123', action: 'message_sent', feedId: 'feed1', count: 2 },
        { chatId: 'chat123', action: 'feed_checked', feedId: 'feed2' },
      ];

      await statisticService.recordBatch(records);

      expect(mockStatisticRepository.recordAction).toHaveBeenCalledTimes(2);
      expect(mockStatisticRepository.recordAction).toHaveBeenCalledWith(
        'chat123',
        'message_sent',
        'feed1',
        2
      );
      expect(mockStatisticRepository.recordAction).toHaveBeenCalledWith(
        'chat123',
        'feed_checked',
        'feed2',
        1
      );
    });
  });
});
