import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedService } from '../services/feed.service.js';
import { FeedQueueService } from '../jobs/feed-queue.service.js';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Mock Redis for testing
vi.mock('ioredis');

describe('Feed Cleanup Integration Tests', () => {
  let feedService: FeedService;
  let feedQueueService: FeedQueueService;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    // Mock Redis
    mockRedis = {
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      eval: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
      quit: vi.fn(),
      on: vi.fn(),
    };
    (Redis as any).mockImplementation(() => mockRedis);

    // Mock Prisma with transaction support
    mockPrisma = {
      $transaction: vi.fn(),
      feed: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
      }
    };

    feedService = new FeedService(mockPrisma as PrismaClient);
    feedQueueService = new FeedQueueService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-End Feed Deletion', () => {
    it('should successfully delete feed and clean up all associated jobs', async () => {
      // Arrange
      const mockFeed = { 
        id: 'feed-123', 
        name: 'Test Feed', 
        chatId: 'chat-123',
        url: 'https://example.com/feed'
      };

      // Mock database operations
      mockPrisma.feed.findUnique = vi.fn().mockResolvedValue(mockFeed);
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        return await callback({
          feed: {
            delete: vi.fn().mockResolvedValue(mockFeed)
          }
        });
      });

      // Mock queue operations
      const mockQueue = {
        getJob: vi.fn().mockResolvedValue(null), // Job doesn't exist after removal
        getRepeatableJobs: vi.fn().mockResolvedValue([]), // No repeatable jobs after removal
        removeRepeatableByKey: vi.fn(),
        getJobs: vi.fn().mockResolvedValue([]),
      };
      (feedQueueService as any).feedCheckQueue = mockQueue;

      // Act
      const result = await feedService.removeFeed('chat-123', 'Test Feed');

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe('Feed removed successfully');
      
      // Verify transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      
      // Verify job verification was performed
      expect(mockQueue.getJob).toHaveBeenCalledWith('recurring-feed-feed-123');
      expect(mockQueue.getRepeatableJobs).toHaveBeenCalled();
    });

    it('should handle Redis connection failure during job removal', async () => {
      // Arrange
      const mockFeed = { 
        id: 'feed-123', 
        name: 'Test Feed', 
        chatId: 'chat-123' 
      };

      mockPrisma.feed.findUnique = vi.fn().mockResolvedValue(mockFeed);
      
      // Mock Redis connection failure
      const mockQueue = {
        getJob: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
        getRepeatableJobs: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
      };
      (feedQueueService as any).feedCheckQueue = mockQueue;

      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        try {
          return await callback({
            feed: {
              delete: vi.fn()
            }
          });
        } catch (error) {
          throw error;
        }
      });

      // Act
      const result = await feedService.removeFeed('chat-123', 'Test Feed');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not clean up scheduled jobs');
    });

    it('should rollback database transaction if job cleanup fails', async () => {
      // Arrange
      const mockFeed = { 
        id: 'feed-123', 
        name: 'Test Feed', 
        chatId: 'chat-123' 
      };

      mockPrisma.feed.findUnique = vi.fn().mockResolvedValue(mockFeed);
      
      // Mock job removal failure
      const mockQueue = {
        getJob: vi.fn().mockResolvedValue({ id: 'recurring-feed-feed-123' }), // Job still exists
        getRepeatableJobs: vi.fn().mockResolvedValue([
          { id: 'recurring-feed-feed-123', key: 'some-key' }
        ]),
        removeRepeatableByKey: vi.fn().mockRejectedValue(new Error('Failed to remove')),
        getJobs: vi.fn().mockResolvedValue([]),
      };
      (feedQueueService as any).feedCheckQueue = mockQueue;

      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        try {
          return await callback({
            feed: {
              delete: vi.fn()
            }
          });
        } catch (error) {
          throw error;
        }
      });

      // Act
      const result = await feedService.removeFeed('chat-123', 'Test Feed');

      // Assert
      expect(result.success).toBe(false);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      
      // Verify that the transaction would have been rolled back
      expect(result.message).toContain('Job cleanup verification failed');
    });
  });

  describe('Orphaned Job Cleanup During Startup', () => {
    it('should clean up orphaned jobs when system starts', async () => {
      // Arrange
      const existingFeeds = [
        { id: 'feed-active-1', name: 'Active Feed 1' },
        { id: 'feed-active-2', name: 'Active Feed 2' }
      ];

      const orphanedJobs = [
        { id: 'recurring-feed-feed-active-1', key: 'key-1' }, // Valid job
        { id: 'recurring-feed-feed-deleted-1', key: 'key-2' }, // Orphaned job
        { id: 'recurring-feed-feed-deleted-2', key: 'key-3' }, // Orphaned job
      ];

      mockPrisma.feed.findMany = vi.fn().mockResolvedValue(existingFeeds);

      const mockQueue = {
        getRepeatableJobs: vi.fn().mockResolvedValue(orphanedJobs),
        removeRepeatableByKey: vi.fn(),
        getJob: vi.fn().mockResolvedValue(null),
      };
      (feedQueueService as any).feedCheckQueue = mockQueue;

      // Act
      await (feedQueueService as any).cleanupOrphanedJobs();

      // Assert
      expect(mockPrisma.feed.findMany).toHaveBeenCalled();
      expect(mockQueue.getRepeatableJobs).toHaveBeenCalled();
      
      // Should remove 2 orphaned jobs but keep 1 valid job
      expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledTimes(2);
      expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith('key-2');
      expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith('key-3');
    });

    it('should handle database connection failure during cleanup', async () => {
      // Arrange
      mockPrisma.feed.findMany = vi.fn().mockRejectedValue(new Error('Database connection failed'));

      const mockQueue = {
        getRepeatableJobs: vi.fn().mockResolvedValue([]),
      };
      (feedQueueService as any).feedCheckQueue = mockQueue;

      // Act & Assert - Should not throw error
      await expect((feedQueueService as any).cleanupOrphanedJobs()).resolves.not.toThrow();
    });
  });

  describe('Feed Processor Orphaned Job Handling', () => {
    it('should handle orphaned job detection in processor', async () => {
      // This would test the feed processor's handling of orphaned jobs
      // when it encounters a job for a non-existent feed
      
      // Arrange
      mockPrisma.feed.findUnique = vi.fn().mockResolvedValue(null);

      const mockQueue = {
        getJob: vi.fn().mockResolvedValue(null),
        getRepeatableJobs: vi.fn().mockResolvedValue([]),
        removeRepeatableByKey: vi.fn(),
        getJobs: vi.fn().mockResolvedValue([]),
      };
      (feedQueueService as any).feedCheckQueue = mockQueue;

      // Act
      const cleanupResult = await feedQueueService.forceRemoveOrphanedJob('non-existent-feed');

      // Assert
      expect(cleanupResult).toBe(true); // Should successfully clean up
      expect(mockQueue.getJob).toHaveBeenCalledWith('recurring-feed-non-existent-feed');
    });
  });

  describe('Monitoring and Metrics', () => {
    it('should provide accurate cleanup metrics', async () => {
      // Arrange
      const existingFeeds = [
        { id: 'feed-1' },
        { id: 'feed-2' }
      ];

      const allJobs = [
        { id: 'recurring-feed-feed-1', key: 'key-1' }, // Valid
        { id: 'recurring-feed-feed-2', key: 'key-2' }, // Valid
        { id: 'recurring-feed-orphaned-1', key: 'key-3' }, // Orphaned
        { id: 'recurring-feed-orphaned-2', key: 'key-4' }, // Orphaned
      ];

      mockPrisma.feed.findMany = vi.fn().mockResolvedValue(existingFeeds);

      const mockQueue = {
        getRepeatableJobs: vi.fn().mockResolvedValue(allJobs),
      };
      (feedQueueService as any).feedCheckQueue = mockQueue;

      // Act
      const metrics = await feedQueueService.getCleanupMetrics();

      // Assert
      expect(metrics.totalRecurringJobs).toBe(4);
      expect(metrics.orphanedJobsDetected).toBe(2);
      expect(metrics.lastCleanupTime).toBeInstanceOf(Date);
    });
  });
});