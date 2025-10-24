import type { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger/logger.service.js';

export class DedupeService {
  private readonly ttlDays = 7;
  private readonly ttlMs = this.ttlDays * 24 * 60 * 60 * 1000;

  constructor(private prisma: PrismaClient) {}

  /**
   * Check if an item has already been seen
   */
  async has(itemId: string): Promise<boolean> {
    try {
      const item = await this.prisma.itemDedupe.findFirst({
        where: {
          itemId,
          expiresAt: {
            gt: new Date(), // Only check non-expired items
          },
        },
      });

      return !!item;
    } catch (error) {
      logger.error(`Failed to check dedupe for item ${itemId}:`, error);
      return false; // On error, don't block processing
    }
  }

  /**
   * Mark an item as seen
   */
  async add(itemId: string, feedId?: string): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.ttlMs);

      await this.prisma.itemDedupe.create({
        data: {
          itemId,
          feedId,
          seenAt: now,
          expiresAt,
        },
      });

      logger.debug(`Marked item ${itemId} as seen (expires: ${expiresAt.toISOString()})`);
    } catch (error) {
      logger.error(`Failed to add dedupe for item ${itemId}:`, error);
      // Don't throw - dedupe is best-effort
    }
  }

  /**
   * Add multiple items at once (batch insert)
   */
  async addBatch(items: Array<{ itemId: string; feedId?: string }>): Promise<void> {
    if (items.length === 0) return;

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.ttlMs);

      const dedupeData = items.map(item => ({
        itemId: item.itemId,
        feedId: item.feedId ?? null,
        seenAt: now,
        expiresAt,
      }));
      
      await this.prisma.itemDedupe.createMany({
        data: dedupeData,
      });

      logger.debug(`Marked ${items.length} items as seen`);
    } catch (error) {
      logger.error(`Failed to add batch dedupe:`, error);
      // Don't throw - dedupe is best-effort
    }
  }

  /**
   * Clean up expired items (should be called periodically)
   */
  async cleanup(): Promise<number> {
    try {
      const now = new Date();
      
      const result = await this.prisma.itemDedupe.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} expired dedupe entries`);
      }

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup dedupe entries:', error);
      return 0;
    }
  }

  /**
   * Get statistics about dedupe entries
   */
  async getStats(): Promise<{
    total: number;
    expired: number;
    active: number;
  }> {
    try {
      const now = new Date();
      
      const [total, expired] = await Promise.all([
        this.prisma.itemDedupe.count(),
        this.prisma.itemDedupe.count({
          where: {
            expiresAt: {
              lt: now,
            },
          },
        }),
      ]);

      return {
        total,
        expired,
        active: total - expired,
      };
    } catch (error) {
      logger.error('Failed to get dedupe stats:', error);
      return { total: 0, expired: 0, active: 0 };
    }
  }
}

// Factory function to create instance with database
export function createDedupeService(prisma: PrismaClient): DedupeService {
  return new DedupeService(prisma);
}

