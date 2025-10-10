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
    
    logger.info('🚀 Starting RSS Skull Bot v0.01 (FULL BOT MODE)...');
    console.log('🚀 Starting RSS Skull Bot v0.01 (FULL BOT MODE)...');

    // Initialize database with timeout
    logger.info('📊 Initializing database...');
    console.log('📊 Initializing database...');
    const database = new DatabaseService();
    
    const dbConnectPromise = database.connect();
    const dbTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database connection timeout')), 15000)
    );
    
    await Promise.race([dbConnectPromise, dbTimeout]);
    logger.info('✅ Database connected successfully');
    console.log('✅ Database connected successfully');

    // Initialize Fastify server
    logger.info('🌐 Initializing Fastify server...');
    console.log('🌐 Initializing Fastify server...');
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
          mode: 'full-bot',
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
    logger.info('⚙️ Job service initialized successfully');
    console.log('⚙️ Job service initialized successfully');

    // Initialize bot with timeout
    logger.info('🤖 Creating BotService instance...');
    console.log('🤖 Creating BotService instance...');
    const botService = new BotService();
    
    logger.info('🔧 Initializing bot service...');
    console.log('🔧 Initializing bot service...');
    
    const botInitPromise = botService.initialize();
    const botTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Bot initialization timeout after 60 seconds')), 60000)
    );

    await Promise.race([botInitPromise, botTimeout]);
    logger.info('✅ Bot initialized successfully');
    console.log('✅ Bot initialized successfully');

    // BotService already starts polling in initialize() method
    logger.info('✅ Bot polling is already active from initialization');
    console.log('✅ Bot polling is already active from initialization');

    // Start server
    logger.info('🌐 Starting web server...');
    console.log('🌐 Starting web server...');
    const port = config.server.port;
    const host = config.server.host;

    await fastify.listen({ port, host });
    logger.info(`✅ Server listening on ${host}:${port}`);
    console.log(`✅ Server listening on ${host}:${port}`);

    logger.info('🎉 RSS Skull Bot is now fully operational!');
    console.log('🎉 RSS Skull Bot is now fully operational!');
    console.log('📊 Health check: http://localhost:8916/health');
    console.log('💬 Bot is ready to receive commands!');

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
    logger.error('❌ Failed to start application:', error);
    console.error('❌ Failed to start application:', error);
    
    if (error instanceof Error && error.message.includes('timeout')) {
      logger.error('💡 Initialization timed out. This could be due to:');
      logger.error('   • Network connectivity issues to Telegram API');
      logger.error('   • Bot token problems');
      logger.error('   • Database or Redis connection issues');
      console.error('💡 Initialization timed out - check network connectivity');
    }
    
    process.exit(1);
  }
}

bootstrap();
