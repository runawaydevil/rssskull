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
    
    logger.info('🚀 Starting RSS Skull Bot v0.01 (DEBUG DETAILED MODE)...');
    console.log('🚀 Starting RSS Skull Bot v0.01 (DEBUG DETAILED MODE)...');

    // Initialize database with timeout
    logger.info('📊 Step A: Initializing database...');
    console.log('📊 Step A: Initializing database...');
    const database = new DatabaseService();
    
    logger.info('📊 Step A1: Connecting to database...');
    console.log('📊 Step A1: Connecting to database...');
    const dbConnectPromise = database.connect();
    const dbTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database connection timeout')), 15000)
    );
    
    await Promise.race([dbConnectPromise, dbTimeout]);
    logger.info('✅ Step A2: Database connected successfully');
    console.log('✅ Step A2: Database connected successfully');

    // Initialize Fastify server
    logger.info('🌐 Step B: Initializing Fastify server...');
    console.log('🌐 Step B: Initializing Fastify server...');
    const fastify = Fastify({
      logger: false, // We use our own logger
    });

    logger.info('🌐 Step B1: Adding health check endpoint...');
    console.log('🌐 Step B1: Adding health check endpoint...');
    // Health check endpoint
    fastify.get('/health', async (_, reply) => {
      try {
        const checks = {
          database: await database.healthCheck(),
          redis: await jobService.healthCheck(),
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          mode: 'debug-detailed',
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

    logger.info('✅ Step B2: Fastify server configured');
    console.log('✅ Step B2: Fastify server configured');

    // Initialize job service
    logger.info('⚙️ Step C: Job service check...');
    console.log('⚙️ Step C: Job service check...');
    
    logger.info('⚙️ Step C1: Testing Redis connection...');
    console.log('⚙️ Step C1: Testing Redis connection...');
    const redisHealthy = await jobService.healthCheck();
    logger.info(`⚙️ Step C2: Redis health: ${redisHealthy}`);
    console.log(`⚙️ Step C2: Redis health: ${redisHealthy}`);

    // Test bot token before creating BotService
    logger.info('🔑 Step D: Testing bot token...');
    console.log('🔑 Step D: Testing bot token...');
    
    logger.info('🔑 Step D1: Importing grammy...');
    console.log('🔑 Step D1: Importing grammy...');
    const { Bot } = await import('grammy');
    
    logger.info('🔑 Step D2: Creating test bot instance...');
    console.log('🔑 Step D2: Creating test bot instance...');
    const testBot = new Bot(config.bot.token);
    
    logger.info('🔑 Step D3: Testing getMe API call...');
    console.log('🔑 Step D3: Testing getMe API call...');
    const me = await testBot.api.getMe();
    logger.info(`🔑 Step D4: Bot token valid - @${me.username}`);
    console.log(`🔑 Step D4: Bot token valid - @${me.username}`);
    
    // Initialize bot with timeout
    logger.info('🤖 Step E: Creating BotService instance...');
    console.log('🤖 Step E: Creating BotService instance...');
    const botService = new BotService();
    logger.info('🤖 Step E1: BotService instance created');
    console.log('🤖 Step E1: BotService instance created');
    
    logger.info('🔧 Step F: Initializing bot service...');
    console.log('🔧 Step F: Initializing bot service...');
    
    const botInitPromise = botService.initialize();
    const botTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Bot initialization timeout after 60 seconds')), 60000)
    );

    await Promise.race([botInitPromise, botTimeout]);
    logger.info('✅ Step F1: Bot initialized successfully');
    console.log('✅ Step F1: Bot initialized successfully');

    // Start server
    logger.info('🌐 Step G: Starting web server...');
    console.log('🌐 Step G: Starting web server...');
    const port = config.server.port;
    const host = config.server.host;

    await fastify.listen({ port, host });
    logger.info(`✅ Step G1: Server listening on ${host}:${port}`);
    console.log(`✅ Step G1: Server listening on ${host}:${port}`);

    logger.info('🎉 Step H: RSS Skull Bot is now fully operational!');
    console.log('🎉 Step H: RSS Skull Bot is now fully operational!');
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
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
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