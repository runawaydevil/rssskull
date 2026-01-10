/**
 * Core types and interfaces for the Telegram resilience system
 */

export enum TelegramErrorType {
  NETWORK_ERROR = 'network_error',        // 502, 503, 504
  RATE_LIMITED = 'rate_limited',          // 429
  CLIENT_ERROR = 'client_error',          // 4xx
  SERVER_ERROR = 'server_error',          // 5xx
  TIMEOUT = 'timeout',                    // Request timeout
  CONNECTION_REFUSED = 'connection_refused' // Network issues
}

export interface TelegramError {
  code: number;
  description: string;
  method: string;
  payload: any;
  timestamp: Date;
  retryCount: number;
  errorType: TelegramErrorType;
  originalError?: Error;
}

export interface RetryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  circuitBreakerEnabled: boolean;
  queueMessages: boolean;
}

export interface ConnectionState {
  status: 'connected' | 'disconnected' | 'recovering' | 'circuit_open';
  lastSuccessfulCall: Date;
  consecutiveFailures: number;
  currentRetryDelay: number;
  nextRetryAt: Date;
  totalDowntime: number;
}

export interface ResilienceHandler {
  handleTelegramError(error: TelegramError, context?: any): Promise<void>;
  isRecoverable(error: TelegramError): boolean;
  shouldEnqueueMessage(error: TelegramError): boolean;
  getRetryStrategy(error: TelegramError): RetryStrategy;
}

export const RECOVERY_STRATEGIES: Record<TelegramErrorType, RetryStrategy> = {
  [TelegramErrorType.NETWORK_ERROR]: {
    maxRetries: 10,
    baseDelay: 1000,
    maxDelay: 60000,
    backoffMultiplier: 2,
    jitter: true,
    circuitBreakerEnabled: true,
    queueMessages: true
  },
  [TelegramErrorType.RATE_LIMITED]: {
    maxRetries: 5,
    baseDelay: 5000,
    maxDelay: 300000, // 5 minutes
    backoffMultiplier: 2,
    jitter: false, // Respect Retry-After header
    circuitBreakerEnabled: false,
    queueMessages: true
  },
  [TelegramErrorType.SERVER_ERROR]: {
    maxRetries: 8,
    baseDelay: 2000,
    maxDelay: 120000, // 2 minutes
    backoffMultiplier: 2,
    jitter: true,
    circuitBreakerEnabled: true,
    queueMessages: true
  },
  [TelegramErrorType.TIMEOUT]: {
    maxRetries: 6,
    baseDelay: 500,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
    jitter: true,
    circuitBreakerEnabled: false,
    queueMessages: false
  },
  [TelegramErrorType.CONNECTION_REFUSED]: {
    maxRetries: 12,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2,
    jitter: true,
    circuitBreakerEnabled: true,
    queueMessages: true
  },
  [TelegramErrorType.CLIENT_ERROR]: {
    maxRetries: 0, // Don't retry client errors
    baseDelay: 0,
    maxDelay: 0,
    backoffMultiplier: 1,
    jitter: false,
    circuitBreakerEnabled: false,
    queueMessages: false
  }
};