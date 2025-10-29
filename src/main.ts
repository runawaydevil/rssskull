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
import { memoryMonitorService } from './utils/memory-monitor.service.js';
import { errorRecoveryService } from './utils/error-recovery.service.js';
import { resourceCleanupService } from './utils/resource-cleanup.service.js';
import { autoRecoveryService } from './utils/auto-recovery.service.js';

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
        const memoryStats = memoryMonitorService.getMemoryStats();
        const checks: any = {
          database: await database.healthCheck(),
          redis: await jobService.healthCheck(),
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: {
            ...process.memoryUsage(),
            usagePercent: Math.round(memoryStats.usagePercent * 100),
            usageMB: Math.round(memoryStats.rss / 1024 / 1024)
          },
          mode: 'full-bot',
        };

        // Add resilience system health if available
        try {
          const resilienceEndpoints = botService.getResilienceEndpoints();
          if (resilienceEndpoints) {
            const resilienceHealth = await resilienceEndpoints.getHealthStatus();
            checks.resilience = resilienceHealth;
          }
        } catch (resilienceError) {
          // Resilience system may not be initialized yet, continue without it
          checks.resilience = { status: 'not_available', error: 'Resilience system not initialized' };
        }

        // Add stability monitoring health
        checks.stability = {
          memoryMonitor: !!memoryMonitorService,
          errorRecovery: errorRecoveryService.getStats(),
          resourceCleanup: resourceCleanupService.getStats()
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
      const memoryStats = memoryMonitorService.getMemoryStats();
      
      return {
        feedQueue: feedQueueStats,
        cache: cacheService.getStats(),
        cacheHTTP: cacheHTTPService.getStats(),
        userAgent: userAgentService.getStats(),
        circuitBreaker: circuitBreakerService.getStats(),
        memory: {
          usageMB: Math.round(memoryStats.rss / 1024 / 1024),
          usagePercent: Math.round(memoryStats.usagePercent * 100),
          heapUsedMB: Math.round(memoryStats.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memoryStats.heapTotal / 1024 / 1024)
        },
        errorRecovery: errorRecoveryService.getStats(),
        resourceCleanup: resourceCleanupService.getStats(),
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

    // Start memory monitoring
    logger.info('🧠 Starting memory monitor...');
    console.log('🧠 Starting memory monitor...');
    memoryMonitorService.start();

    // Start error recovery service
    logger.info('🔧 Starting error recovery service...');
    console.log('🔧 Starting error recovery service...');
    errorRecoveryService.start();

    // Start resource cleanup service
    logger.info('🧹 Starting resource cleanup service...');
    console.log('🧹 Starting resource cleanup service...');
    resourceCleanupService.start();

    // Start auto-recovery service
    logger.info('🔄 Starting auto-recovery service...');
    console.log('🔄 Starting auto-recovery service...');
    autoRecoveryService.start();

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
        memoryMonitorService.stop();
        errorRecoveryService.stop();
        resourceCleanupService.stop();
        autoRecoveryService.stop();
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
    
    // Enhanced error handling with recovery
    process.on('uncaughtException', (error) => {
      errorRecoveryService.interceptUncaughtException(error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      errorRecoveryService.interceptUnhandledRejection(error, promise);
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
