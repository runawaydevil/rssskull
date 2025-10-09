import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../handlers/command.handler.js';
import { StatsCommand } from './stats.commands.js';

// Mock the services
const mockStatisticService = {
  hasStatistics: vi.fn(),
  getChatStatistics: vi.fn(),
  getTopFeeds: vi.fn(),
  recordUserAction: vi.fn(),
};

const mockFeedService = {
  listFeeds: vi.fn(),
};

vi.mock('../../services/statistic.service.js', () => ({
  StatisticService: vi.fn(() => mockStatisticService),
}));

vi.mock('../../services/feed.service.js', () => ({
  FeedService: vi.fn(() => mockFeedService),
}));

vi.mock('../../database/database.service.js', () => ({
  database: {
    client: {},
  },
}));

vi.mock('../../utils/logger/logger.service.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('StatsCommand', () => {
  let statsCommand: StatsCommand;
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();

    statsCommand = new StatsCommand();

    mockContext = {
      chat: { id: 12345 },
      reply: vi.fn(),
      t: vi.fn((key: string, params?: any) => {
        // Simple mock translation function
        if (key === 'stats.no_data') return 'No statistics available';
        if (key === 'stats.title') return `Statistics (${params?.period})`;
        if (key === 'stats.summary')
          return `Messages: ${params?.messages}, Checks: ${params?.checks}, Actions: ${params?.actions}`;
        if (key === 'stats.daily_title') return 'Daily Activity:';
        if (key === 'stats.daily_item')
          return `${params?.date}: ${params?.messages} messages, ${params?.checks} checks`;
        if (key === 'stats.top_feeds_title') return 'Top Feeds:';
        if (key === 'stats.top_feed_item') return `${params?.feedId}: ${params?.count} messages`;
        if (key === 'stats.period_30') return '30 days';
        if (key === 'stats.error') return `Error: ${params?.error}`;
        return key;
      }),
      language: 'en' as const,
    } as any;
  });

  describe('execute', () => {
    it('should show no data message when no statistics exist', async () => {
      mockStatisticService.hasStatistics.mockResolvedValue(false);

      await statsCommand.execute(mockContext);

      expect(mockStatisticService.hasStatistics).toHaveBeenCalledWith('12345');
      expect(mockContext.reply).toHaveBeenCalledWith('No statistics available');
    });

    it('should display comprehensive statistics when data exists', async () => {
      const mockStats = {
        totalMessages: 50,
        totalFeedChecks: 100,
        totalUserActions: 10,
        dailyStats: [
          { date: '2024-01-01', messagesSent: 5, feedsChecked: 10 },
          { date: '2024-01-02', messagesSent: 3, feedsChecked: 8 },
        ],
        summary: [],
        period: 30,
      };

      const mockTopFeeds = [
        { feedId: 'feed1', messageCount: 25 },
        { feedId: 'feed2', messageCount: 15 },
      ];

      const mockFeeds = [
        { id: 'feed1', name: 'Tech News' },
        { id: 'feed2', name: 'World News' },
      ];

      mockStatisticService.hasStatistics.mockResolvedValue(true);
      mockStatisticService.getChatStatistics.mockResolvedValue(mockStats);
      mockStatisticService.getTopFeeds.mockResolvedValue(mockTopFeeds);
      mockFeedService.listFeeds.mockResolvedValue(mockFeeds);

      await statsCommand.execute(mockContext);

      expect(mockStatisticService.hasStatistics).toHaveBeenCalledWith('12345');
      expect(mockStatisticService.getChatStatistics).toHaveBeenCalledWith('12345', 30);
      expect(mockStatisticService.getTopFeeds).toHaveBeenCalledWith('12345', 30, 5);
      expect(mockFeedService.listFeeds).toHaveBeenCalledWith('12345');

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Statistics (30 days)'),
        { parse_mode: 'Markdown' }
      );

      expect(mockStatisticService.recordUserAction).toHaveBeenCalledWith('12345', 'stats_viewed');
    });

    it('should handle errors gracefully', async () => {
      mockStatisticService.hasStatistics.mockRejectedValue(new Error('Database error'));

      await statsCommand.execute(mockContext);

      expect(mockContext.reply).toHaveBeenCalledWith('Error: Internal error');
    });

    it('should handle missing chat ID', async () => {
      const contextWithoutChat = {
        ...mockContext,
        chat: undefined,
      };

      await statsCommand.execute(contextWithoutChat as any);

      expect(mockContext.reply).toHaveBeenCalledWith(mockContext.t('error.internal'));
    });

    it('should format dates correctly for English', () => {
      const formattedDate = statsCommand.formatDate('2024-01-15', 'en');
      expect(formattedDate).toMatch(/Jan \d{1,2}/);
    });

    it('should format dates correctly for Portuguese', () => {
      const formattedDate = statsCommand.formatDate('2024-01-15', 'pt');
      expect(formattedDate).toMatch(/\d{2}\/\d{2}/);
    });
  });

  describe('create', () => {
    it('should create a command handler with correct configuration', () => {
      const handler = StatsCommand.create();

      expect(handler.name).toBe('stats');
      expect(handler.aliases).toEqual(['estatisticas']);
      expect(handler.description).toBe('View usage statistics');
      expect(handler.handler).toBeDefined();
    });
  });
});
