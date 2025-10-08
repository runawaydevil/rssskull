import type { Prisma, PrismaClient, Statistic } from '@prisma/client';
import { AbstractRepository } from './base.repository.js';

export type CreateStatisticInput = Prisma.StatisticCreateInput;
export type UpdateStatisticInput = Prisma.StatisticUpdateInput;

export interface StatisticSummary {
  action: string;
  totalCount: number;
  date: Date;
}

export class StatisticRepository extends AbstractRepository<
  Statistic,
  CreateStatisticInput,
  UpdateStatisticInput
> {
  constructor(prisma: PrismaClient) {
    super(prisma);
  }

  async findById(id: string): Promise<Statistic | null> {
    return this.prisma.statistic.findUnique({
      where: { id },
    });
  }

  async findMany(where?: Prisma.StatisticWhereInput): Promise<Statistic[]> {
    return this.prisma.statistic.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async create(data: CreateStatisticInput): Promise<Statistic> {
    return this.prisma.statistic.create({
      data,
    });
  }

  async update(id: string, data: UpdateStatisticInput): Promise<Statistic> {
    return this.prisma.statistic.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.statistic.delete({
      where: { id },
    });
  }

  async findByChatId(chatId: string, days = 30): Promise<Statistic[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.prisma.statistic.findMany({
      where: {
        chatId,
        date: {
          gte: startDate,
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  async recordAction(
    chatId: string,
    action: string,
    feedId?: string,
    count = 1
  ): Promise<Statistic> {
    return this.prisma.statistic.create({
      data: {
        chatId,
        action,
        feedId,
        count,
        date: new Date(),
      },
    });
  }

  async getSummaryByChatId(chatId: string, days = 30): Promise<StatisticSummary[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.prisma.statistic.groupBy({
      by: ['action'],
      where: {
        chatId,
        date: {
          gte: startDate,
        },
      },
      _sum: {
        count: true,
      },
    });

    return result.map((item: any) => ({
      action: item.action,
      totalCount: item._sum.count || 0,
      date: startDate,
    }));
  }

  async getMessagesSentCount(chatId: string, days = 30): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.prisma.statistic.aggregate({
      where: {
        chatId,
        action: 'message_sent',
        date: {
          gte: startDate,
        },
      },
      _sum: {
        count: true,
      },
    });

    return result._sum.count || 0;
  }

  async getFeedChecksCount(chatId: string, days = 30): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.prisma.statistic.aggregate({
      where: {
        chatId,
        action: 'feed_checked',
        date: {
          gte: startDate,
        },
      },
      _sum: {
        count: true,
      },
    });

    return result._sum.count || 0;
  }

  async cleanupOldStatistics(days = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.prisma.statistic.deleteMany({
      where: {
        date: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  async getDailyStats(
    chatId: string,
    days = 30
  ): Promise<{ date: string; messagesSent: number; feedsChecked: number }[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.prisma.statistic.findMany({
      where: {
        chatId,
        date: {
          gte: startDate,
        },
      },
      orderBy: { date: 'asc' },
    });

    // Group by date
    const dailyStats = new Map<string, { messagesSent: number; feedsChecked: number }>();

    stats.forEach((stat: Statistic) => {
      const dateKey = stat.date.toISOString().split('T')[0];
      if (!dateKey) return;

      if (!dailyStats.has(dateKey)) {
        dailyStats.set(dateKey, { messagesSent: 0, feedsChecked: 0 });
      }

      const dayStats = dailyStats.get(dateKey)!;
      if (stat.action === 'message_sent') {
        dayStats.messagesSent += stat.count;
      } else if (stat.action === 'feed_checked') {
        dayStats.feedsChecked += stat.count;
      }
    });

    return Array.from(dailyStats.entries()).map(([date, stats]) => ({
      date,
      ...stats,
    }));
  }
}
