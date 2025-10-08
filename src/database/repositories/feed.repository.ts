import type { Feed, FeedFilter, Prisma, PrismaClient } from '@prisma/client';
import { AbstractRepository } from './base.repository.js';

export type FeedWithFilters = Feed & {
  filters: FeedFilter[];
};

export type CreateFeedInput = Prisma.FeedCreateInput;
export type UpdateFeedInput = Prisma.FeedUpdateInput;

export class FeedRepository extends AbstractRepository<
  FeedWithFilters,
  CreateFeedInput,
  UpdateFeedInput
> {
  constructor(prisma: PrismaClient) {
    super(prisma);
  }

  async findById(id: string): Promise<FeedWithFilters | null> {
    return this.prisma.feed.findUnique({
      where: { id },
      include: {
        filters: true,
      },
    });
  }

  async findMany(where?: Prisma.FeedWhereInput): Promise<FeedWithFilters[]> {
    return this.prisma.feed.findMany({
      where,
      include: {
        filters: true,
      },
    });
  }

  async create(data: CreateFeedInput): Promise<FeedWithFilters> {
    return this.prisma.feed.create({
      data,
      include: {
        filters: true,
      },
    });
  }

  async update(id: string, data: UpdateFeedInput): Promise<FeedWithFilters> {
    return this.prisma.feed.update({
      where: { id },
      data,
      include: {
        filters: true,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.feed.delete({
      where: { id },
    });
  }

  async findByChatId(chatId: string): Promise<FeedWithFilters[]> {
    return this.prisma.feed.findMany({
      where: { chatId },
      include: {
        filters: true,
      },
    });
  }

  async findByChatIdAndName(chatId: string, name: string): Promise<FeedWithFilters | null> {
    return this.prisma.feed.findUnique({
      where: {
        chatId_name: {
          chatId,
          name,
        },
      },
      include: {
        filters: true,
      },
    });
  }

  async findEnabledFeeds(): Promise<FeedWithFilters[]> {
    return this.prisma.feed.findMany({
      where: { enabled: true },
      include: {
        filters: true,
      },
    });
  }

  async updateLastCheck(id: string, lastItemId?: string): Promise<FeedWithFilters> {
    return this.prisma.feed.update({
      where: { id },
      data: {
        lastCheck: new Date(),
        lastItemId,
        failures: 0, // Reset failures on successful check
      },
      include: {
        filters: true,
      },
    });
  }

  async incrementFailures(id: string): Promise<FeedWithFilters> {
    return this.prisma.feed.update({
      where: { id },
      data: {
        failures: {
          increment: 1,
        },
      },
      include: {
        filters: true,
      },
    });
  }

  async toggleEnabled(id: string, enabled: boolean): Promise<FeedWithFilters> {
    return this.prisma.feed.update({
      where: { id },
      data: { enabled },
      include: {
        filters: true,
      },
    });
  }

  async countByChatId(chatId: string): Promise<number> {
    return this.prisma.feed.count({
      where: { chatId },
    });
  }

  async addFilter(feedId: string, filterData: Prisma.FeedFilterCreateInput): Promise<FeedFilter> {
    return this.prisma.feedFilter.create({
      data: {
        ...filterData,
        feed: {
          connect: { id: feedId },
        },
      },
    });
  }

  async removeFilter(filterId: string): Promise<void> {
    await this.prisma.feedFilter.delete({
      where: { id: filterId },
    });
  }

  async getFilters(feedId: string): Promise<FeedFilter[]> {
    return this.prisma.feedFilter.findMany({
      where: { feedId },
    });
  }
}
