import Fastify from 'fastify';

import { config } from './config/config.service.js';
import { DatabaseService } from './database/database.service.js';
import { feedQueueService, jobService } from './jobs/index.js';
import { logger } from './utils/logger/logger.service.js';

async function bootstrap() {
  try {
    process.env.BOT_STARTUP_TIME = Date.now().toString();
    
    logger.info('🚀 Starting RSS Skull Bot v0.01 (FEED-ONLY MODE)...');
    console.log('🚀 Starting RSS Skull Bot v0.01 (FEED-ONLY MODE)...');

    // Initialize database
    logger.info('📊 Connecting to database...');
    console.log('📊 Connecting to database...');
    const database = new DatabaseService();
    await database.connect();
    logger.info('✅ Database connected');
    console.log('✅ Database connected');

    // Initialize Fastify server
    logger.info('🌐 Starting web server...');
    console.log('🌐 Starting web server...');
    const fastify = Fastify({ logger: false });

    // Health check
    fastify.get('/health', async () => {
      return {
        status: 'ok',
        database: await database.healthCheck(),
        redis: await jobService.healthCheck(),
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mode: 'feed-only',
      };
    });

    // User-Agent monitoring endpoint
    fastify.get('/user-agent-stats', async () => {
      const { userAgentService } = await import('./utils/user-agent.service.js');
      return {
        status: 'ok',
        userAgentStats: userAgentService.getStats(),
        timestamp: new Date().toISOString(),
      };
    });

    // Cache monitoring endpoint
    fastify.get('/cache-stats', async () => {
      const { cacheService } = await import('./utils/cache.service.js');
      return {
        status: 'ok',
        cacheStats: cacheService.getStats(),
        timestamp: new Date().toISOString(),
      };
    });

    // Detailed cache info endpoint
    fastify.get('/cache-info', async () => {
      const { cacheService } = await import('./utils/cache.service.js');
      return {
        status: 'ok',
        cacheInfo: cacheService.getDetailedInfo(),
        timestamp: new Date().toISOString(),
      };
    });

    // Start server
    const port = config.server.port;
    const host = config.server.host;

    await fastify.listen({ port, host });
    logger.info(`✅ Server running on ${host}:${port}`);
    console.log(`✅ Server running on ${host}:${port}`);

    // Load and schedule existing feeds
    logger.info('🔄 Loading existing feeds...');
    console.log('🔄 Loading existing feeds...');
    
    try {
      const chats = await database.client.chat.findMany({
        include: {
          feeds: {
            where: { enabled: true },
            include: { filters: true },
          },
        },
      });

      let totalScheduled = 0;
      for (const chat of chats) {
        if (chat.feeds.length === 0) continue;
        
        logger.info(`Loading ${chat.feeds.length} feeds for chat ${chat.id}`);
        console.log(`Loading ${chat.feeds.length} feeds for chat ${chat.id}`);
        
        for (const feed of chat.feeds) {
          try {
            // Import feed interval service for dynamic intervals
            const { feedIntervalService } = await import('./utils/feed-interval.service.js');
            const intervalMinutes = feedIntervalService.getIntervalForUrl(feed.rssUrl);

            await feedQueueService.scheduleRecurringFeedCheck({
              feedId: feed.id,
              chatId: feed.chatId,
              feedUrl: feed.rssUrl,
              lastItemId: feed.lastItemId ?? undefined,
            }, intervalMinutes);

            totalScheduled++;
            logger.debug(`Scheduled feed: ${feed.name} (${intervalMinutes}min interval)`);
          } catch (error) {
            logger.error(`Failed to schedule feed ${feed.name}:`, error);
          }
        }
      }

      logger.info(`✅ Scheduled ${totalScheduled} feeds with rate limiting`);
      console.log(`✅ Scheduled ${totalScheduled} feeds with rate limiting`);
    } catch (error) {
      logger.error('Failed to load feeds:', error);
      console.error('Failed to load feeds:', error);
    }

    logger.info('🎉 RSS Feed System is running!');
    console.log('🎉 RSS Feed System is running!');
    console.log('📊 Health check: http://localhost:8916/health');
    console.log('🔧 Rate limiting active: Reddit 15min, YouTube 10min, Others 5min');

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...');
      await feedQueueService.close();
      await jobService.close();
      await fastify.close();
      await database.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('❌ Failed to start:', error);
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

bootstrap();
