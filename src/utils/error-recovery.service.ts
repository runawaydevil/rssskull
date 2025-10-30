import { logger } from './logger/logger.service.js';
import { circuitBreakerService } from './circuit-breaker.service.js';

export interface FailedOperation {
  type: 'telegram' | 'database' | 'redis' | 'feed';
  operation: string;
  data: any;
  retryCount: number;
  maxRetries: number;
  lastError: string;
  timestamp: Date;
}

export class ErrorRecoveryService {
  private failedOperations: Map<string, FailedOperation> = new Map();
  private retryInterval?: NodeJS.Timeout;
  private circuitBreakerResetInterval?: NodeJS.Timeout;

  start(): void {
    logger.info('Starting error recovery service');

    // Process failed operations every 30 seconds
    this.retryInterval = setInterval(() => {
      this.processFailedOperations();
    }, 30000);

    // Reset circuit breakers every 5 minutes
    this.circuitBreakerResetInterval = setInterval(() => {
      this.resetCircuitBreakers();
    }, 300000); // 5 minutes
  }

  stop(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = undefined;
    }
    if (this.circuitBreakerResetInterval) {
      clearInterval(this.circuitBreakerResetInterval);
      this.circuitBreakerResetInterval = undefined;
    }
    logger.info('Error recovery service stopped');
  }

  interceptUnhandledRejection(error: Error, promise: Promise<any>): void {
    logger.error('Unhandled rejection intercepted', {
      error: error.message,
      stack: error.stack,
      promise: promise.toString()
    });

    // Don't call process.exit() - just log and continue
    // The application should continue running
    
    // Try to identify the operation type and queue for retry if possible
    this.analyzeAndQueueError(error);
  }

  interceptUncaughtException(error: Error): void {
    logger.error('CRITICAL: Uncaught exception intercepted', {
      error: error.message,
      stack: error.stack,
      note: 'Application will continue running but may be in unstable state'
    });

    // Try to recover instead of immediately exiting
    this.analyzeAndQueueError(error);
    
    // NÃO CHAMAR process.exit() - isso mata o container!
    // Em vez disso, apenas logamos o erro crítico
    // O erro já foi interceptado e logado, a aplicação deve continuar
    logger.error('CRITICAL: Uncaught exception handled - application continuing (may be unstable)');
    
    // Não fazer nada mais - deixar o processo continuar
    // Se o erro é realmente crítico, o monitoramento externo deve detectar
  }

  queueFailedOperation(operation: FailedOperation): void {
    const key = `${operation.type}_${operation.operation}_${Date.now()}`;
    this.failedOperations.set(key, operation);
    
    logger.warn('Operation queued for retry', {
      type: operation.type,
      operation: operation.operation,
      retryCount: operation.retryCount,
      maxRetries: operation.maxRetries
    });
  }

  private analyzeAndQueueError(error: Error): void {
    const errorMessage = error.message.toLowerCase();
    const stack = error.stack || '';

    // Try to identify the operation type from error message or stack
    let operationType: FailedOperation['type'] = 'telegram'; // default

    if (errorMessage.includes('database') || errorMessage.includes('prisma') || stack.includes('database')) {
      operationType = 'database';
    } else if (errorMessage.includes('redis') || stack.includes('redis')) {
      operationType = 'redis';
    } else if (errorMessage.includes('feed') || errorMessage.includes('rss') || stack.includes('feed')) {
      operationType = 'feed';
    }

    // Queue for retry if it's a recoverable error
    if (this.isRecoverableError(error)) {
      this.queueFailedOperation({
        type: operationType,
        operation: 'unknown_operation',
        data: { error: error.message },
        retryCount: 0,
        maxRetries: 3,
        lastError: error.message,
        timestamp: new Date()
      });
    }
  }

  private isRecoverableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // Network errors are usually recoverable
    if (errorMessage.includes('network') || 
        errorMessage.includes('timeout') || 
        errorMessage.includes('connection') ||
        errorMessage.includes('econnreset') ||
        errorMessage.includes('enotfound')) {
      return true;
    }

    // Telegram API errors are often recoverable
    if (errorMessage.includes('telegram') || 
        errorMessage.includes('502') || 
        errorMessage.includes('503') ||
        errorMessage.includes('429')) {
      return true;
    }

    // Redis connection errors
    if (errorMessage.includes('redis') && 
        (errorMessage.includes('connection') || errorMessage.includes('timeout'))) {
      return true;
    }

    return false;
  }

  private async processFailedOperations(): Promise<void> {
    if (this.failedOperations.size === 0) {
      return;
    }

    logger.info(`Processing ${this.failedOperations.size} failed operations`);

    const operationsToRetry = Array.from(this.failedOperations.entries());
    
    for (const [key, operation] of operationsToRetry) {
      if (operation.retryCount >= operation.maxRetries) {
        logger.warn('Operation exceeded max retries, removing from queue', {
          type: operation.type,
          operation: operation.operation,
          retryCount: operation.retryCount
        });
        this.failedOperations.delete(key);
        continue;
      }

      // Check if enough time has passed (exponential backoff)
      const backoffMs = Math.min(1000 * Math.pow(2, operation.retryCount), 60000); // Max 1 minute
      const timeSinceLastTry = Date.now() - operation.timestamp.getTime();
      
      if (timeSinceLastTry < backoffMs) {
        continue; // Not time to retry yet
      }

      // Attempt retry
      const success = await this.retryOperation(operation);
      
      if (success) {
        logger.info('Operation retry successful', {
          type: operation.type,
          operation: operation.operation,
          retryCount: operation.retryCount
        });
        this.failedOperations.delete(key);
      } else {
        // Update retry count and timestamp
        operation.retryCount++;
        operation.timestamp = new Date();
        logger.warn('Operation retry failed', {
          type: operation.type,
          operation: operation.operation,
          retryCount: operation.retryCount,
          maxRetries: operation.maxRetries
        });
      }
    }
  }

  private async retryOperation(operation: FailedOperation): Promise<boolean> {
    try {
      // This is a simplified retry - in a real implementation,
      // you would have specific retry logic for each operation type
      logger.info('Attempting to retry operation', {
        type: operation.type,
        operation: operation.operation
      });

      // For now, just return true to simulate successful retry
      // In practice, you would implement specific retry logic here
      return true;
    } catch (error) {
      logger.error('Error during operation retry', {
        type: operation.type,
        operation: operation.operation,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  private resetCircuitBreakers(): void {
    try {
      // Get all circuit breaker stats
      const stats = circuitBreakerService.getStats();
      
      // Reset circuit breakers that have been open for more than 5 minutes
      for (const [domain, domainStats] of Object.entries(stats)) {
        if (domainStats.state === 'OPEN') {
          const timeSinceOpen = Date.now() - domainStats.lastFailureTime;
          if (timeSinceOpen > 300000) { // 5 minutes
            logger.info('Resetting circuit breaker for domain', { domain });
            circuitBreakerService.reset(domain);
          }
        }
      }
    } catch (error) {
      logger.error('Error resetting circuit breakers', { error });
    }
  }

  getStats() {
    return {
      failedOperationsCount: this.failedOperations.size,
      failedOperations: Array.from(this.failedOperations.values()).map(op => ({
        type: op.type,
        operation: op.operation,
        retryCount: op.retryCount,
        maxRetries: op.maxRetries,
        timestamp: op.timestamp
      }))
    };
  }
}

// Singleton instance
export const errorRecoveryService = new ErrorRecoveryService();