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

// Global service references for watchdog
let botService: BotService | null = null;
let database: DatabaseService | null = null;
let fastify: ReturnType<typeof Fastify> | null = null;
const MAX_BOOTSTRAP_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY = 5000; // 5 seconds

/**
 * Service watchdog that monitors critical services and restarts them if needed
 */
class ServiceWatchdog {
  private healthCheckInterval?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private consecutiveFailures = 0;
  private isRunning = false;

  start() {
    if (this.isRunning) {
      logger.warn('Watchdog already running');
      return;
    }

    this.isRunning = true;
    logger.info('🔍 Starting service watchdog...');

    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkServicesHealth();
    }, 30000);

    // Heartbeat every 5 minutes
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, 300000);

    // Initial heartbeat
    this.heartbeat();
  }

  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    this.isRunning = false;
    logger.info('Service watchdog stopped');
  }

  private heartbeat() {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const memoryMB = Math.round(memory.rss / 1024 / 1024);

    logger.info('💓 Heartbeat - Application is alive', {
      uptime: `${Math.floor(uptime / 60)} minutes`,
      memoryMB,
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });
    console.log(`💓 Heartbeat - Application running for ${Math.floor(uptime / 60)} minutes, Memory: ${memoryMB}MB`);
  }

  private async checkServicesHealth() {
    try {
      const checks: Record<string, boolean> = {};

      // Check database
      if (database) {
        try {
          checks.database = await database.healthCheck();
        } catch (error) {
          checks.database = false;
          logger.error('Database health check failed:', error);
        }
      } else {
        checks.database = false;
      }

      // Check Redis
      try {
        checks.redis = await jobService.healthCheck();
      } catch (error) {
        checks.redis = false;
        logger.error('Redis health check failed:', error);
      }

      // Check server
      if (fastify) {
        try {
          // Try to make a request to verify server is actually listening
          // We'll check if the server is listening by checking its internal state
          const serverInfo = fastify.server;
          checks.server = !!serverInfo && serverInfo.listening;
        } catch (error) {
          checks.server = false;
          logger.error('Server health check failed:', error);
        }
      } else {
        checks.server = false;
      }

      // Check bot polling status
      if (botService) {
        try {
          checks.bot = await botService.isPollingActive();
          
          // If polling is not active, try to restart it
          if (!checks.bot) {
            logger.warn('Bot polling is not active - attempting restart...');
            const restarted = await botService.restartPollingIfNeeded();
            if (restarted) {
              checks.bot = true;
              logger.info('Bot polling restarted successfully');
            }
          }
        } catch (error) {
          checks.bot = false;
          logger.error('Bot polling check failed:', error);
        }
      } else {
        checks.bot = false;
      }

      const allHealthy = Object.values(checks).every((check) => check === true);

      if (allHealthy) {
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures++;
        logger.warn('Service health check failed', {
          checks,
          consecutiveFailures: this.consecutiveFailures,
        });

        // If we have too many consecutive failures, try to recover
        if (this.consecutiveFailures >= 3) {
          logger.error('Multiple consecutive health check failures - attempting recovery...');
          await this.attemptRecovery(checks);
        }
      }
    } catch (error) {
      logger.error('Error during health check:', error);
    }
  }

  private async attemptRecovery(checks: Record<string, boolean>) {
    logger.info('Attempting service recovery...');

    // Try to recover Redis if it's down
    if (!checks.redis) {
      logger.info('Attempting Redis recovery...');
      try {
        // JobService should handle reconnection automatically
        const recovered = await jobService.healthCheck();
        if (recovered) {
          logger.info('Redis recovery successful');
        }
      } catch (error) {
        logger.error('Redis recovery failed:', error);
      }
    }

    // Try to recover database if it's down
    if (!checks.database && database) {
      logger.info('Attempting database recovery...');
      try {
        await database.disconnect();
        await database.connect();
        const recovered = await database.healthCheck();
        if (recovered) {
          logger.info('Database recovery successful');
        }
      } catch (error) {
        logger.error('Database recovery failed:', error);
      }
    }

    // Reset failure counter after recovery attempt
    this.consecutiveFailures = 0;
  }
}

const watchdog = new ServiceWatchdog();

/**
 * Bootstrap with retry logic and backoff
 */
async function bootstrapWithRetry(): Promise<void> {
  let attempt = 0;
  let delay = INITIAL_RETRY_DELAY;

  while (attempt < MAX_BOOTSTRAP_ATTEMPTS) {
    try {
      attempt++;

      if (attempt > 1) {
        logger.info(`🔄 Bootstrap attempt ${attempt}/${MAX_BOOTSTRAP_ATTEMPTS}...`);
        console.log(`🔄 Retrying bootstrap in ${delay / 1000} seconds (attempt ${attempt}/${MAX_BOOTSTRAP_ATTEMPTS})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        // Exponential backoff
        delay = Math.min(delay * 2, 60000); // Max 60 seconds
      }

      await bootstrap();
      // If bootstrap succeeds, break out of retry loop
      return;
    } catch (error) {
      logger.error(`❌ Bootstrap attempt ${attempt} failed:`, error);
      console.error(`❌ Bootstrap attempt ${attempt}/${MAX_BOOTSTRAP_ATTEMPTS} failed`);

      if (attempt >= MAX_BOOTSTRAP_ATTEMPTS) {
        logger.error(`❌ All ${MAX_BOOTSTRAP_ATTEMPTS} bootstrap attempts failed. Application will continue running but may be in unstable state.`);
        console.error(`❌ All ${MAX_BOOTSTRAP_ATTEMPTS} bootstrap attempts failed.`);
        console.error('⚠️  Application will continue running but may be in unstable state.');
        console.error('⚠️  Check logs for details and consider manual intervention.');

        // Don't exit - keep the process alive so we can attempt manual recovery
        // Set up a keep-alive loop to prevent process from exiting
        setupKeepAlive();
        return;
      }
    }
  }
}

/**
 * Setup keep-alive loop to ensure process never exits unexpectedly
 */
function setupKeepAlive() {
  logger.info('🔒 Setting up keep-alive loop to prevent unexpected exits...');
  
  // Keep event loop alive with periodic intervals
  setInterval(() => {
    // Just keep the process alive
    if (process.memoryUsage().rss > 0) {
      // Process is still alive
    }
  }, 10000); // Every 10 seconds

  // Log keep-alive status periodically
  setInterval(() => {
    logger.info('🔒 Keep-alive: Process is still running', {
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    });
  }, 60000); // Every minute
}

async function bootstrap() {
  try {
    // Set bot startup time for feed processing (ISO string format)
    process.env.BOT_STARTUP_TIME = new Date().toISOString();
    
    logger.info('🚀 Starting RSS Skull Bot v0.01 (FULL BOT MODE)...');
    console.log('🚀 Starting RSS Skull Bot v0.01 (FULL BOT MODE)...');

    // Initialize database with migrations
    logger.info('📊 Initializing database...');
    console.log('📊 Initializing database...');
    
    // Ensure data directory exists
    const fs = await import('fs');
    const path = await import('path');
    const dataDir = path.dirname(config.database.url.replace('file:', ''));
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Run migrations first
    try {
      logger.info('🔄 Running database migrations...');
      const { execSync } = await import('child_process');
      // Prisma CLI is now in dependencies, so it should be available directly
      // Use npx as it handles PATH issues in Docker containers
      execSync('npx prisma migrate deploy --schema=./prisma/schema.prisma', { 
        stdio: 'inherit',
        timeout: 30000 
      });
      logger.info('✅ Database migrations completed');
    } catch (error) {
      logger.warn('⚠️ Migration failed, continuing anyway:', error);
    }
    
    database = new DatabaseService();
    
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
    fastify = Fastify({
      logger: false, // We use our own logger
    });

    // Enhanced health check endpoint with resilience
    fastify.get('/health', async (_request: any, reply: any) => {
      try {
        const memoryStats = memoryMonitorService.getMemoryStats();
        const checks: any = {
          database: database ? await database.healthCheck() : false,
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
          if (botService) {
            const resilienceEndpoints = botService.getResilienceEndpoints();
            if (resilienceEndpoints) {
              const resilienceHealth = await resilienceEndpoints.getHealthStatus();
              checks.resilience = resilienceHealth;
            }
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
    fastify.get('/resilience-stats', async (_request: any, reply: any) => {
      try {
        if (!botService) {
          reply.code(503);
          return {
            error: 'Bot service not available',
            timestamp: new Date().toISOString()
          };
        }
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
    fastify.get('/metrics', async (_request: any, reply: any) => {
      try {
        if (!botService) {
          reply.code(503);
          return {
            error: 'Bot service not available',
            timestamp: new Date().toISOString()
          };
        }
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
    botService = new BotService();
    
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

    // Start watchdog and keep-alive after successful bootstrap
    logger.info('🔍 Starting service watchdog...');
    watchdog.start();
    
    // Setup keep-alive to prevent process from exiting
    setupKeepAlive();
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
    
    // Don't call process.exit(1) - let retry logic handle it
    // Throw error to be caught by bootstrapWithRetry
    throw error;
  }
}

// Handle shutdown signals globally
let shutdownInProgress = false;
const gracefulShutdown = async () => {
  if (shutdownInProgress) {
    logger.warn('Shutdown already in progress');
    return;
  }
  
  shutdownInProgress = true;
  logger.info('Shutting down gracefully...');
  try {
    watchdog.stop();
    memoryMonitorService.stop();
    errorRecoveryService.stop();
    resourceCleanupService.stop();
    autoRecoveryService.stop();
    if (botService) {
      await botService.stop();
    }
    await feedQueueService.close();
    await jobService.close();
    if (fastify) {
      await fastify.close();
    }
    if (database) {
      await database.disconnect();
    }
    logger.info('Shutdown completed successfully');
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
  process.exit(0);
};

// Handle shutdown signals
process.once('SIGINT', gracefulShutdown);
process.once('SIGTERM', gracefulShutdown);

// Enhanced error handling with recovery - set up globally
process.on('uncaughtException', (error) => {
  errorRecoveryService.interceptUncaughtException(error);
});

process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  errorRecoveryService.interceptUnhandledRejection(error, promise);
});

// Prevent process from exiting due to empty event loop
process.on('beforeExit', (code) => {
  if (code === 0) {
    logger.info('Process attempting to exit with code 0 - this should only happen during graceful shutdown');
  } else {
    logger.warn(`Process attempting to exit with code ${code} - keeping alive...`);
    // Don't allow exit unless it's a graceful shutdown
  }
});

// Start bootstrap with retry
bootstrapWithRetry().catch((error) => {
  logger.error('Critical: bootstrapWithRetry failed completely:', error);
  console.error('Critical: All bootstrap attempts failed. Process will remain alive for manual intervention.');
  setupKeepAlive();
});
