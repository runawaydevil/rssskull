import type { FeedFilter, Prisma, PrismaClient } from '@prisma/client';
import { AbstractRepository } from './base.repository.js';

export type CreateFilterInput = Omit<Prisma.FeedFilterCreateInput, 'feed'> & {
  feedId: string;
};

export type UpdateFilterInput = Prisma.FeedFilterUpdateInput;

export class FilterRepository extends AbstractRepository<
  FeedFilter,
  CreateFilterInput,
  UpdateFilterInput
> {
  constructor(prisma: PrismaClient) {
    super(prisma);
  }

  async findById(id: string): Promise<FeedFilter | null> {
    return this.prisma.feedFilter.findUnique({
      where: { id },
    });
  }

  async findMany(where?: Prisma.FeedFilterWhereInput): Promise<FeedFilter[]> {
    return this.prisma.feedFilter.findMany({
      where,
    });
  }

  async create(data: CreateFilterInput): Promise<FeedFilter> {
    const { feedId, ...filterData } = data;
    return this.prisma.feedFilter.create({
      data: {
        ...filterData,
        feed: {
          connect: { id: feedId },
        },
      },
    });
  }

  async update(id: string, data: UpdateFilterInput): Promise<FeedFilter> {
    return this.prisma.feedFilter.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.feedFilter.delete({
      where: { id },
    });
  }

  /**
   * Get all filters for a specific feed
   */
  async findByFeedId(feedId: string): Promise<FeedFilter[]> {
    return this.prisma.feedFilter.findMany({
      where: { feedId },
      orderBy: [
        { type: 'asc' }, // Include filters first
        { id: 'asc' }, // Then by creation order
      ],
    });
  }

  /**
   * Count filters for a specific feed
   */
  async countByFeedId(feedId: string): Promise<number> {
    return this.prisma.feedFilter.count({
      where: { feedId },
    });
  }

  /**
   * Get filters by type for a specific feed
   */
  async findByFeedIdAndType(feedId: string, type: 'include' | 'exclude'): Promise<FeedFilter[]> {
    return this.prisma.feedFilter.findMany({
      where: {
        feedId,
        type,
      },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Delete all filters for a specific feed
   */
  async deleteByFeedId(feedId: string): Promise<number> {
    const result = await this.prisma.feedFilter.deleteMany({
      where: { feedId },
    });
    return result.count;
  }

  /**
   * Check if a filter with the same pattern already exists for a feed
   */
  async findDuplicate(feedId: string, type: string, pattern: string): Promise<FeedFilter | null> {
    return this.prisma.feedFilter.findFirst({
      where: {
        feedId,
        type,
        pattern,
      },
    });
  }

  /**
   * Get filter statistics for a feed
   */
  async getFilterStats(feedId: string): Promise<{
    total: number;
    include: number;
    exclude: number;
    regex: number;
  }> {
    const [total, include, exclude, regex] = await Promise.all([
      this.prisma.feedFilter.count({ where: { feedId } }),
      this.prisma.feedFilter.count({ where: { feedId, type: 'include' } }),
      this.prisma.feedFilter.count({ where: { feedId, type: 'exclude' } }),
      this.prisma.feedFilter.count({ where: { feedId, isRegex: true } }),
    ]);

    return { total, include, exclude, regex };
  }
}
