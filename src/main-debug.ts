import Fastify from 'fastify';

import { BotService } from './bot/bot.service.js';
import { config } from './config/config.service.js';
import { DatabaseService } from './database/database.service.js';
import { feedQueueService, jobService } from './jobs/index.js';
import { logger } from './utils/logger/logger.service.js';

async function bootstrap() {
  try {
    // Set bot startup time for feed processing
    process.env.BOT_STARTUP_TIME = Date.now().toString();
    
    logger.info('🚀 Starting RSS Skull Bot v0.01 (DEBUG MODE)...');

    // Initialize database
    const database = new DatabaseService();
    await database.connect();
    logger.info('✅ Database connected successfully');

    // Initialize Fastify server
    const fastify = Fastify({
      logger: false, // We use our own logger
    });

    // Health check endpoint
    fastify.get('/health', async (_, reply) => {
      try {
        const checks = {
          database: await database.healthCheck(),
          redis: await jobService.healthCheck(),
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        };

        const isHealthy = checks.database && checks.redis;

        if (isHealthy) {
          return { status: 'ok', ...checks };
        }
        reply.code(503);
        return { status: 'error', ...checks };
      } catch (error) {
        reply.code(503);
        return {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        };
      }
    });

    // Initialize job service
    logger.info('✅ Job service initialized successfully');

    // Initialize bot with simplified initialization
    logger.info('🤖 Initializing bot (simplified mode)...');
    const botService = new BotService();
    
    // Call a simplified initialization that skips feed loading
    await botService.initializeSimplified();
    logger.info('✅ Bot initialized successfully (simplified mode)');

    // Start server
    const port = config.server.port;
    const host = config.server.host;

    await fastify.listen({ port, host });
    logger.info(`✅ Server listening on ${host}:${port}`);

    logger.info('🎉 Bot is now running in debug mode!');
    logger.info('📝 Feed loading was skipped to avoid initialization hang');
    logger.info('🔧 You can now test bot commands to verify functionality');

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await botService.stop();
      await feedQueueService.close();
      await jobService.close();
      await fastify.close();
      await database.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

bootstrap();