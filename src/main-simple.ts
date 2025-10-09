import Fastify from 'fastify';

import { config } from './config/config.service.js';
import { DatabaseService } from './database/database.service.js';
import { feedQueueService, jobService } from './jobs/index.js';
import { logger } from './utils/logger/logger.service.js';

async function bootstrap() {
  try {
    process.env.BOT_STARTUP_TIME = Date.now().toString();
    
    logger.info('🚀 Starting RSS Skull Bot v0.01 (SIMPLE MODE)...');
    console.log('🚀 Starting RSS Skull Bot v0.01 (SIMPLE MODE)...');

    // Initialize database
    const database = new DatabaseService();
    await database.connect();
    logger.info('✅ Database connected');
    console.log('✅ Database connected');

    // Initialize Fastify server
    const fastify = Fastify({ logger: false });

    // Health check
    fastify.get('/health', async () => {
      return {
        status: 'ok',
        database: await database.healthCheck(),
        redis: await jobService.healthCheck(),
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
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
        for (const feed of chat.feeds) {
          try {
            await feedQueueService.scheduleRecurringFeedCheck({
              feedId: feed.id,
              chatId: feed.chatId,
              feedUrl: feed.rssUrl,
              lastItemId: feed.lastItemId ?? undefined,
            }, 5); // 5 minutes interval

            totalScheduled++;
            logger.debug(`Scheduled feed: ${feed.name}`);
          } catch (error) {
            logger.error(`Failed to schedule feed ${feed.name}:`, error);
          }
        }
      }

      logger.info(`✅ Scheduled ${totalScheduled} feeds`);
      console.log(`✅ Scheduled ${totalScheduled} feeds`);
    } catch (error) {
      logger.error('Failed to load feeds:', error);
      console.error('Failed to load feeds:', error);
    }

    logger.info('🎉 RSS Skull Bot is running!');
    console.log('🎉 RSS Skull Bot is running!');
    console.log('📊 Check health: http://localhost:8916/health');

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