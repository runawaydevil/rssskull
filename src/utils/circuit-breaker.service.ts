import { logger } from './logger/logger.service.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Número de falhas para abrir
  resetTimeout: number;        // Tempo para tentar resetar (ms)
  monitoringWindow: number;    // Janela de monitoramento (ms)
  adaptiveThreshold: boolean;  // Usar threshold adaptativo
  successThreshold: number;    // Número de sucessos para fechar
  slowResponseThreshold: number; // Threshold para resposta lenta (ms)
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  nextAttemptTime: number;
  averageResponseTime: number;
  slowResponseCount: number;
  adaptiveThreshold: number;
}

export class CircuitBreakerService {
  private breakers: Map<string, CircuitBreakerState> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: 10,          // 10 falhas consecutivas (mais tolerante)
      resetTimeout: 3 * 60 * 1000,   // 3 minutos (reset mais rápido)
      monitoringWindow: 15 * 60 * 1000, // 15 minutos (janela maior)
      adaptiveThreshold: true,        // Usar threshold adaptativo
      successThreshold: 3,            // 3 sucessos para fechar
      slowResponseThreshold: 10000,   // 10 segundos para resposta lenta
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
   * Registra sucesso da requisição com tempo de resposta
   */
  recordSuccess(domain: string, responseTime?: number): void {
    const breaker = this.getBreaker(domain);
    const now = Date.now();

    breaker.successCount++;
    breaker.lastSuccessTime = now;

    // Atualizar tempo médio de resposta
    if (responseTime) {
      if (breaker.averageResponseTime === 0) {
        breaker.averageResponseTime = responseTime;
      } else {
        breaker.averageResponseTime = (breaker.averageResponseTime + responseTime) / 2;
      }

      // Contar respostas lentas
      if (responseTime > this.config.slowResponseThreshold) {
        breaker.slowResponseCount++;
      }
    }

    if (breaker.state === 'HALF_OPEN') {
      // Sucesso em HALF_OPEN significa que podemos fechar o circuit breaker
      if (breaker.successCount >= this.config.successThreshold) {
        breaker.state = 'CLOSED';
        breaker.failureCount = 0;
        breaker.successCount = 0;
        logger.info(`Circuit breaker for ${domain} closed after ${breaker.successCount} successful requests in HALF_OPEN state`);
      }
    } else if (breaker.state === 'CLOSED') {
      // Reset contador de falhas em caso de sucesso
      breaker.failureCount = 0;
      
      // Ajustar threshold adaptativo
      if (this.config.adaptiveThreshold) {
        this.adjustAdaptiveThreshold(breaker);
      }
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
        successCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
        nextAttemptTime: 0,
        averageResponseTime: 0,
        slowResponseCount: 0,
        adaptiveThreshold: this.config.failureThreshold,
      });
    }
    return this.breakers.get(domain)!;
  }

  /**
   * Ajusta threshold adaptativo baseado na performance
   */
  private adjustAdaptiveThreshold(breaker: CircuitBreakerState): void {
    const baseThreshold = this.config.failureThreshold;
    
    // Se há muitas respostas lentas, ser mais tolerante
    if (breaker.slowResponseCount > 5) {
      breaker.adaptiveThreshold = Math.min(baseThreshold * 1.5, 20);
      logger.debug(`Increased adaptive threshold to ${breaker.adaptiveThreshold} due to slow responses`);
    }
    // Se tempo médio de resposta é bom, ser mais restritivo
    else if (breaker.averageResponseTime > 0 && breaker.averageResponseTime < 2000) {
      breaker.adaptiveThreshold = Math.max(baseThreshold * 0.8, 5);
      logger.debug(`Decreased adaptive threshold to ${breaker.adaptiveThreshold} due to fast responses`);
    }
    // Reset para threshold base
    else {
      breaker.adaptiveThreshold = baseThreshold;
    }
  }

  /**
   * Força reset do circuit breaker
   */
  reset(domain: string): void {
    const breaker = this.getBreaker(domain);
    breaker.state = 'CLOSED';
    breaker.failureCount = 0;
    breaker.successCount = 0;
    breaker.lastFailureTime = 0;
    breaker.lastSuccessTime = 0;
    breaker.nextAttemptTime = 0;
    breaker.averageResponseTime = 0;
    breaker.slowResponseCount = 0;
    breaker.adaptiveThreshold = this.config.failureThreshold;
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
