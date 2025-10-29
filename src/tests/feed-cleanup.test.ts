import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedService } from '../services/feed.service.js';
import { FeedQueueService } from '../jobs/feed-queue.service.js';
import { PrismaClient } from '@prisma/client';

// Mock dependencies
vi.mock('../jobs/feed-queue.service.js');
vi.mock('../utils/logger/logger.service.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('Feed Cleanup Functionality', () => {
  let feedService: FeedService;
  let mockPrisma: any;
  let mockFeedQueueService: any;

  beforeEach(() => {
    // Mock Prisma client
    mockPrisma = {
      $transaction: vi.fn(),
      feed: {
        findUnique: vi.fn(),
        delete: vi.fn(),
      }
    };

    // Mock FeedQueueService
    mockFeedQueueService = {
      removeRecurringFeedCheck: vi.fn(),
      verifyJobRemoval: vi.fn(),
      forceRemoveOrphanedJob: vi.fn(),
    };

    feedService = new FeedService(mockPrisma as PrismaClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('FeedService.removeFeed', () => {
    it('should successfully remove feed and job in transaction', async () => {
      // Arrange
      const mockFeed = { id: 'feed-123', name: 'Test Feed', chatId: 'chat-123' };
      
      mockPrisma.feed.findUnique = vi.fn().mockResolvedValue(mockFeed);
      mockFeedQueueService.removeRecurringFeedCheck = vi.fn().mockResolvedValue(true);
      mockFeedQueueService.verifyJobRemoval = vi.fn().mockResolvedValue(true);
      
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        return await callback({
          feed: {
            delete: vi.fn().mockResolvedValue(mockFeed)
          }
        });
      });

      // Mock the feedQueueService import
      vi.doMock('../jobs/index.js', () => ({
        feedQueueService: mockFeedQueueService
      }));

      // Act
      const result = await feedService.removeFeed('chat-123', 'Test Feed');

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe('Feed removed successfully');
      expect(mockFeedQueueService.removeRecurringFeedCheck).toHaveBeenCalledWith('feed-123');
      expect(mockFeedQueueService.verifyJobRemoval).toHaveBeenCalledWith('feed-123');
    });

    it('should rollback transaction if job removal fails', async () => {
      // Arrange
      const mockFeed = { id: 'feed-123', name: 'Test Feed', chatId: 'chat-123' };
      
      mockPrisma.feed.findUnique = vi.fn().mockResolvedValue(mockFeed);
      mockFeedQueueService.removeRecurringFeedCheck = vi.fn().mockResolvedValue(false);
      
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

      // Mock the feedQueueService import
      vi.doMock('../jobs/index.js', () => ({
        feedQueueService: mockFeedQueueService
      }));

      // Act
      const result = await feedService.removeFeed('chat-123', 'Test Feed');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not clean up scheduled jobs');
      expect(mockFeedQueueService.removeRecurringFeedCheck).toHaveBeenCalledWith('feed-123');
    });

    it('should rollback transaction if job verification fails', async () => {
      // Arrange
      const mockFeed = { id: 'feed-123', name: 'Test Feed', chatId: 'chat-123' };
      
      mockPrisma.feed.findUnique = vi.fn().mockResolvedValue(mockFeed);
      mockFeedQueueService.removeRecurringFeedCheck = vi.fn().mockResolvedValue(true);
      mockFeedQueueService.verifyJobRemoval = vi.fn().mockResolvedValue(false);
      
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

      // Mock the feedQueueService import
      vi.doMock('../jobs/index.js', () => ({
        feedQueueService: mockFeedQueueService
      }));

      // Act
      const result = await feedService.removeFeed('chat-123', 'Test Feed');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Job cleanup verification failed');
      expect(mockFeedQueueService.verifyJobRemoval).toHaveBeenCalledWith('feed-123');
    });

    it('should return error if feed not found', async () => {
      // Arrange
      mockPrisma.feed.findUnique = vi.fn().mockResolvedValue(null);

      // Act
      const result = await feedService.removeFeed('chat-123', 'Nonexistent Feed');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Feed not found');
      expect(mockFeedQueueService.removeRecurringFeedCheck).not.toHaveBeenCalled();
    });
  });

  describe('FeedQueueService job verification', () => {
    let feedQueueService: FeedQueueService;
    let mockQueue: any;

    beforeEach(() => {
      mockQueue = {
        getJob: vi.fn(),
        getRepeatableJobs: vi.fn(),
        removeRepeatableByKey: vi.fn(),
        getJobs: vi.fn(),
      };

      // Create a real instance but mock its dependencies
      feedQueueService = new FeedQueueService();
      (feedQueueService as any).feedCheckQueue = mockQueue;
    });

    it('should verify job removal successfully', async () => {
      // Arrange
      mockQueue.getJob = vi.fn().mockResolvedValue(null);
      mockQueue.getRepeatableJobs = vi.fn().mockResolvedValue([]);

      // Act
      const result = await feedQueueService.verifyJobRemoval('feed-123');

      // Assert
      expect(result).toBe(true);
      expect(mockQueue.getJob).toHaveBeenCalledWith('recurring-feed-feed-123');
    });

    it('should detect job still exists', async () => {
      // Arrange
      const mockJob = { id: 'recurring-feed-feed-123' };
      mockQueue.getJob = vi.fn().mockResolvedValue(mockJob);

      // Act
      const result = await feedQueueService.verifyJobRemoval('feed-123');

      // Assert
      expect(result).toBe(false);
      expect(mockQueue.getJob).toHaveBeenCalledWith('recurring-feed-feed-123');
    });

    it('should detect repeatable job still exists', async () => {
      // Arrange
      mockQueue.getJob = vi.fn().mockResolvedValue(null);
      mockQueue.getRepeatableJobs = vi.fn().mockResolvedValue([
        { id: 'recurring-feed-feed-123', key: 'some-key' }
      ]);

      // Act
      const result = await feedQueueService.verifyJobRemoval('feed-123');

      // Assert
      expect(result).toBe(false);
    });

    it('should force remove orphaned job using multiple methods', async () => {
      // Arrange
      const mockJob = { id: 'recurring-feed-feed-123', remove: vi.fn() };
      mockQueue.getJob = vi.fn().mockResolvedValue(mockJob);
      mockQueue.getRepeatableJobs = vi.fn().mockResolvedValue([
        { id: 'recurring-feed-feed-123', key: 'some-key' }
      ]);
      mockQueue.getJobs = vi.fn().mockResolvedValue([
        { data: { feedId: 'feed-123' }, remove: vi.fn() }
      ]);

      // Mock successful verification after cleanup
      const verifyJobRemovalSpy = vi.spyOn(feedQueueService, 'verifyJobRemoval')
        .mockResolvedValue(true);

      // Act
      const result = await feedQueueService.forceRemoveOrphanedJob('feed-123');

      // Assert
      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith('some-key');
      expect(verifyJobRemovalSpy).toHaveBeenCalledWith('feed-123');
    });
  });
});