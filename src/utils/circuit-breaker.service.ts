import { logger } from './logger/logger.service.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Número de falhas para abrir
  resetTimeout: number;        // Tempo para tentar resetar (ms)
  monitoringWindow: number;    // Janela de monitoramento (ms)
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

export class CircuitBreakerService {
  private breakers: Map<string, CircuitBreakerState> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: 5,           // 5 falhas consecutivas
      resetTimeout: 5 * 60 * 1000,   // 5 minutos
      monitoringWindow: 10 * 60 * 1000, // 10 minutos
      ...config,
    };
  }

  /**
   * Verifica se o circuit breaker permite a requisição
   */
  async canExecute(domain: string): Promise<boolean> {
    const breaker = this.getBreaker(domain);
    const now = Date.now();

    switch (breaker.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        if (now >= breaker.nextAttemptTime) {
          // Tentar resetar para HALF_OPEN
          breaker.state = 'HALF_OPEN';
          breaker.failureCount = 0;
          logger.info(`Circuit breaker for ${domain} moved to HALF_OPEN state`);
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return true;

      default:
        return false;
    }
  }

  /**
   * Registra sucesso da requisição
   */
  recordSuccess(domain: string): void {
    const breaker = this.getBreaker(domain);
    
    if (breaker.state === 'HALF_OPEN') {
      // Sucesso em HALF_OPEN significa que podemos fechar o circuit breaker
      breaker.state = 'CLOSED';
      breaker.failureCount = 0;
      logger.info(`Circuit breaker for ${domain} closed after successful request`);
    } else if (breaker.state === 'CLOSED') {
      // Reset contador de falhas em caso de sucesso
      breaker.failureCount = 0;
    }
  }

  /**
   * Registra falha da requisição
   */
  recordFailure(domain: string): void {
    const breaker = this.getBreaker(domain);
    const now = Date.now();

    breaker.failureCount++;
    breaker.lastFailureTime = now;

    if (breaker.state === 'CLOSED' && breaker.failureCount >= this.config.failureThreshold) {
      // Abrir circuit breaker
      breaker.state = 'OPEN';
      breaker.nextAttemptTime = now + this.config.resetTimeout;
      logger.warn(`Circuit breaker for ${domain} opened after ${breaker.failureCount} failures`);
    } else if (breaker.state === 'HALF_OPEN') {
      // Falha em HALF_OPEN significa que devemos abrir novamente
      breaker.state = 'OPEN';
      breaker.nextAttemptTime = now + this.config.resetTimeout;
      logger.warn(`Circuit breaker for ${domain} reopened after failure in HALF_OPEN state`);
    }
  }

  /**
   * Obtém ou cria circuit breaker para um domínio
   */
  private getBreaker(domain: string): CircuitBreakerState {
    if (!this.breakers.has(domain)) {
      this.breakers.set(domain, {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      });
    }
    return this.breakers.get(domain)!;
  }

  /**
   * Força reset do circuit breaker
   */
  reset(domain: string): void {
    const breaker = this.getBreaker(domain);
    breaker.state = 'CLOSED';
    breaker.failureCount = 0;
    breaker.lastFailureTime = 0;
    breaker.nextAttemptTime = 0;
    logger.info(`Circuit breaker for ${domain} manually reset`);
  }

  /**
   * Obtém estado atual do circuit breaker
   */
  getState(domain: string): CircuitBreakerState {
    return this.getBreaker(domain);
  }

  /**
   * Obtém estatísticas de todos os circuit breakers
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [domain, breaker] of this.breakers.entries()) {
      stats[domain] = {
        state: breaker.state,
        failureCount: breaker.failureCount,
        lastFailureTime: breaker.lastFailureTime,
        nextAttemptTime: breaker.nextAttemptTime,
        timeUntilNextAttempt: Math.max(0, breaker.nextAttemptTime - Date.now()),
      };
    }
    
    return stats;
  }

  /**
   * Limpa circuit breakers antigos
   */
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.monitoringWindow * 2; // 2x a janela de monitoramento
    
    for (const [domain, breaker] of this.breakers.entries()) {
      if (breaker.lastFailureTime < cutoff && breaker.state === 'CLOSED') {
        this.breakers.delete(domain);
        logger.debug(`Cleaned up old circuit breaker for ${domain}`);
      }
    }
  }
}

// Singleton instance
export const circuitBreakerService = new CircuitBreakerService();
