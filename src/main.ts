import Fastify from 'fastify';

import { BotService } from './bot/bot.service.js';
import { config } from './config/config.service.js';
import { DatabaseService } from './database/database.service.js';
import { feedQueueService, jobService } from './jobs/index.js';
import { logger } from './utils/logger/logger.service.js';
import { cacheService } from './utils/cache.service.js';
import { cacheHTTPService } from './utils/cache-http.service.js';
import { userAgentService } from './utils/user-agent.service.js';
import { circuitBreakerService } from './utils/circuit-breaker.service.js';

async function bootstrap() {
  try {
    // Set bot startup time for feed processing (ISO string format)
    process.env.BOT_STARTUP_TIME = new Date().toISOString();
    
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

    // Enhanced health check endpoint with resilience
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

        // Add resilience system health if available
        const resilienceEndpoints = botService.getResilienceEndpoints();
        if (resilienceEndpoints) {
          const resilienceHealth = await resilienceEndpoints.getHealthStatus();
          checks.resilience = resilienceHealth;
        }

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

    // Cache stats endpoint
    fastify.get('/cache-stats', async () => {
      const cacheStats = cacheService.getStats();
      const httpStats = cacheHTTPService.getStats();
      
      return {
        cache: cacheStats,
        httpCache: httpStats,
        timestamp: new Date().toISOString(),
      };
    });

    // User agent stats endpoint
    fastify.get('/user-agent-stats', async () => {
      return {
        stats: userAgentService.getStats(),
        timestamp: new Date().toISOString(),
      };
    });

    // Circuit breaker stats endpoint
    fastify.get('/cbstats', async () => {
      return {
        stats: circuitBreakerService.getStats(),
        timestamp: new Date().toISOString(),
      };
    });

    // Stats endpoint (general)
    fastify.get('/stats', async () => {
      const feedQueueStats = await feedQueueService.getStats();
      
      return {
        feedQueue: feedQueueStats,
        cache: cacheService.getStats(),
        cacheHTTP: cacheHTTPService.getStats(),
        userAgent: userAgentService.getStats(),
        circuitBreaker: circuitBreakerService.getStats(),
        timestamp: new Date().toISOString(),
      };
    });

    // Resilience stats endpoint
    fastify.get('/resilience-stats', async (_, reply) => {
      try {
        const resilienceEndpoints = botService.getResilienceEndpoints();
        if (resilienceEndpoints) {
          return await resilienceEndpoints.getResilienceStats();
        } else {
          reply.code(503);
          return {
            error: 'Resilience system not available',
            timestamp: new Date().toISOString()
          };
        }
      } catch (error) {
        reply.code(500);
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        };
      }
    });

    // Detailed metrics endpoint
    fastify.get('/metrics', async (_, reply) => {
      try {
        const resilienceEndpoints = botService.getResilienceEndpoints();
        if (resilienceEndpoints) {
          return await resilienceEndpoints.getDetailedMetrics();
        } else {
          reply.code(503);
          return {
            error: 'Resilience system not available',
            timestamp: new Date().toISOString()
          };
        }
      } catch (error) {
        reply.code(500);
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        };
      }
    });

    // Initialize job service
    logger.info('⚙️ Job service initialized successfully');
    console.log('⚙️ Job service initialized successfully');

    // Initialize feed queue service (this creates workers)
    logger.info('📋 Feed queue service initialized');
    console.log('📋 Feed queue service initialized');

    // Initialize bot with timeout
    logger.info('🤖 Creating BotService instance...');
    console.log('🤖 Creating BotService instance...');
    const botService = new BotService();
    
    logger.info('🔧 Initializing bot service...');
    console.log('🔧 Initializing bot service...');
    
    // Initialize bot service (no timeout needed since polling is non-blocking)
    await botService.initialize();
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
      try {
        await botService.stop();
        await feedQueueService.close();
        await jobService.close();
        await fastify.close();
        await database.disconnect();
        logger.info('Shutdown completed successfully');
      } catch (error) {
        logger.error('Error during shutdown:', error);
      }
      process.exit(0);
    };

    // Handle shutdown signals
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown();
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown();
    });
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
