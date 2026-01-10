import { type Job, Queue, type QueueOptions, Worker, type WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config/config.service.js';
import { logger } from '../utils/logger/logger.service.js';

export interface JobData {
  [key: string]: any;
}

export interface JobResult {
  success: boolean;
  message?: string;
  data?: any;
}

export class JobService {
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        // Estratégia de retry exponencial para reconexão
        const delay = Math.min(times * 100, 3000);
        logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms before retry`);
        return delay;
      },
      reconnectOnError: (err) => {
        // Reconectar em erros específicos
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          logger.error('Redis READONLY error - will reconnect');
          return true;
        }
        return false;
      },
      lazyConnect: false,
    });

    this.redis.on('connect', () => {
      logger.info('Connected to Redis for job queue');
    });

    this.redis.on('ready', () => {
      logger.info('Redis is ready for job queue');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
      logger.error('Redis error details:', {
        message: error.message,
        code: (error as any).code,
        errno: (error as any).errno,
        syscall: (error as any).syscall
      });
      
      // NÃO CRASHAR - Redis tem retry automático
      logger.warn('Redis connection error - will attempt automatic reconnection');
    });
    
    this.redis.on('close', () => {
      logger.warn('Redis connection closed - will attempt reconnection');
    });
    
    this.redis.on('reconnecting', (delay: number) => {
      logger.info(`Redis reconnecting in ${delay}ms`);
    });
  }

  /**
   * Create a new queue
   */
  createQueue(name: string, options?: QueueOptions): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const defaultOptions: QueueOptions = {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    };

    const queue = new Queue(name, { ...defaultOptions, ...options });
    this.queues.set(name, queue);

    logger.info(`Created queue: ${name}`);
    return queue;
  }

  /**
   * Create a worker for processing jobs
   */
  createWorker<T extends JobData, R extends JobResult>(
    queueName: string,
    processor: (job: Job<T>) => Promise<R>,
    options?: WorkerOptions
  ): Worker<T, R> {
    if (this.workers.has(queueName)) {
      return this.workers.get(queueName)! as Worker<T, R>;
    }

    const defaultOptions: WorkerOptions = {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
      },
      concurrency: 5,
    };

    const worker = new Worker<T, R>(queueName, processor, { ...defaultOptions, ...options });

    // Event handlers with error recovery
    worker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed in queue ${queueName}`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} failed in queue ${queueName}:`, err);
      // Job failed - but don't crash the worker
      // BullMQ will handle retries automatically
    });

    worker.on('error', (err) => {
      logger.error(`CRITICAL: Worker error in queue ${queueName}:`, err);
      logger.error('CRITICAL: Worker error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        queueName
      });
      
      // CRÍTICO: Não deixar erro do worker matar o processo
      // O worker pode estar em estado inconsistente, mas o processo deve continuar
      logger.error('CRITICAL: Worker error caught - process will continue but worker may need restart');
      
      // Tentar reconectar Redis se for erro de conexão
      if (err instanceof Error && (
        err.message.includes('Redis') || 
        err.message.includes('Connection') ||
        err.message.includes('ECONNREFUSED')
      )) {
        logger.warn('Redis connection error detected in worker - attempting recovery');
        // O Redis já tem handlers de reconexão, então só logamos
      }
    });
    
    // Adicionar handler para erros não tratados no worker
    worker.on('closed', () => {
      logger.warn(`Worker closed for queue ${queueName} - this may indicate a problem`);
    });

    this.workers.set(queueName, worker as Worker);
    logger.info(`Created worker for queue: ${queueName}`);

    return worker;
  }

  /**
   * Add a job to a queue
   */
  async addJob<T extends JobData>(
    queueName: string,
    jobName: string,
    data: T,
    options?: any
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.add(jobName, data, options);
    logger.debug(`Added job ${job.id} to queue ${queueName}`);

    return job;
  }

  /**
   * Add a recurring job to a queue
   */
  async addRecurringJob<T extends JobData>(
    queueName: string,
    jobName: string,
    data: T,
    cronPattern: string,
    options?: any
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.add(jobName, data, {
      repeat: { pattern: cronPattern },
      ...options,
    });

    logger.info(`Added recurring job ${job.id} to queue ${queueName} with pattern ${cronPattern}`);
    return job;
  }

  /**
   * Acquire a distributed lock using Redis
   */
  async acquireLock(key: string, value: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.redis.set(key, value, 'EX', ttl, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error('Failed to acquire lock:', error);
      return false;
    }
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(key: string, value: string): Promise<void> {
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await this.redis.eval(script, 1, key, value);
    } catch (error) {
      logger.error('Failed to release lock:', error);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
    logger.info(`Paused queue: ${queueName}`);
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
    logger.info(`Resumed queue: ${queueName}`);
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    logger.info('Closing job service...');

    // Close all workers
    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.info(`Closed worker: ${name}`);
    }

    // Close all queues
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Closed queue: ${name}`);
    }

    // Close Redis connection
    await this.redis.quit();
    logger.info('Job service closed');
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Get Redis connection for advanced operations
   */
  getRedisConnection(): Redis {
    return this.redis;
  }

  /**
   * Get a queue by name
   */
  getQueue(queueName: string): Queue | undefined {
    return this.queues.get(queueName);
  }
}

// Singleton instance
export const jobService = new JobService();
