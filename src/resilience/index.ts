/**
 * Telegram Resilience System
 * 
 * This module provides robust error handling and recovery mechanisms
 * for Telegram API connectivity issues, including:
 * - Error classification and retry strategies
 * - Exponential backoff with jitter
 * - Circuit breaker integration
 * - Message queuing during outages
 * - Health monitoring and metrics
 */

// Core types and interfaces
export * from './types.js';

// Error handling and classification
export * from './error-classifier.js';
export * from './resilience-handler.js';

// Connection management
export * from './connection-manager.js';
export * from './connection-persistence.js';
export * from './exponential-backoff.js';

// Circuit breaker
export * from './telegram-circuit-breaker.js';
export * from './recovery-manager.js';

// Message queue system
export * from './message-queue.js';
export * from './persistent-message-queue.js';
export * from './queue-processor.js';

// Health monitoring
export * from './health-monitor.js';
export * from './health-endpoints.js';

// Configuration
export * from './config.js';

// Singleton exports
export { telegramResilienceHandler } from './resilience-handler.js';
export { telegramConnectionManager, getTelegramConnectionManager } from './connection-manager.js';
export { telegramCircuitBreaker } from './telegram-circuit-breaker.js';
export { telegramRecoveryManager } from './recovery-manager.js';
export { exponentialBackoff } from './exponential-backoff.js';
export { resilienceConfig } from './config.js';