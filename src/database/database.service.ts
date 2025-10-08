import { PrismaClient } from '@prisma/client';
import { config } from '../config/config.service.js';
import { logger } from '../utils/logger/logger.service.js';
import {
  ChatRepository,
  FeedRepository,
  FilterRepository,
  StatisticRepository,
} from './repositories/index.js';

export class DatabaseService {
  private prisma: PrismaClient;
  public readonly chats: ChatRepository;
  public readonly feeds: FeedRepository;
  public readonly filters: FilterRepository;
  public readonly statistics: StatisticRepository;

  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.database.url,
        },
      },
      log: config.app.logLevel === 'debug' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
    });

    // Initialize repositories
    this.chats = new ChatRepository(this.prisma);
    this.feeds = new FeedRepository(this.prisma);
    this.filters = new FilterRepository(this.prisma);
    this.statistics = new StatisticRepository(this.prisma);
  }

  async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('Database connection established');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection:', error);
      throw error;
    }
  }

  get client(): PrismaClient {
    return this.prisma;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
let databaseInstance: DatabaseService | null = null;

export function getDatabaseInstance(): DatabaseService {
  if (!databaseInstance) {
    databaseInstance = new DatabaseService();
  }
  return databaseInstance;
}

export const database = getDatabaseInstance();
