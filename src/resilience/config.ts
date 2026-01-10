import { logger } from '../utils/logger/logger.service.js';

export interface ResilienceConfig {
  telegram: {
    retries: {
      maxRetries: number;
      baseDelay: number;
      maxDelay: number;
      jitter: boolean;
    };
    circuitBreaker: {
      enabled: boolean;
      threshold: number;
      timeout: number;
      recoveryThreshold: number;
    };
    rateLimit: {
      respectRetryAfter: boolean;
      defaultDelay: number;
      maxDelay: number;
    };
  };
  messageQueue: {
    enabled: boolean;
    maxSize: number;
    batchSize: number;
    processingInterval: number;
    messageTTL: number;
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    healthCheckInterval: number;
    alertThresholds: {
      errorRate: number;
      downtimeMinutes: number;
      queueSize: number;
    };
  };
}

/**
 * Default resilience configuration
 */
export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  telegram: {
    retries: {
      maxRetries: 10,
      baseDelay: 1000,
      maxDelay: 60000,
      jitter: true
    },
    circuitBreaker: {
      enabled: true,
      threshold: 5,
      timeout: 300000, // 5 minutes
      recoveryThreshold: 3
    },
    rateLimit: {
      respectRetryAfter: true,
      defaultDelay: 1000,
      maxDelay: 300000 // 5 minutes
    }
  },
  messageQueue: {
    enabled: true,
    maxSize: 1000,
    batchSize: 20,
    processingInterval: 5000,
    messageTTL: 3600000 // 1 hour
  },
  monitoring: {
    enabled: true,
    metricsInterval: 30000,
    healthCheckInterval: 30000,
    alertThresholds: {
      errorRate: 0.1, // 10%
      downtimeMinutes: 15,
      queueSize: 500
    }
  }
};

/**
 * Environment variable mappings for resilience configuration
 */
const ENV_MAPPINGS = {
  // Telegram configuration
  'TELEGRAM_RESILIENCE_ENABLED': 'telegram.circuitBreaker.enabled',
  'TELEGRAM_MAX_RETRIES': 'telegram.retries.maxRetries',
  'TELEGRAM_BASE_DELAY': 'telegram.retries.baseDelay',
  'TELEGRAM_MAX_DELAY': 'telegram.retries.maxDelay',
  'TELEGRAM_CIRCUIT_BREAKER_THRESHOLD': 'telegram.circuitBreaker.threshold',
  'TELEGRAM_CIRCUIT_BREAKER_TIMEOUT': 'telegram.circuitBreaker.timeout',
  
  // Message Queue configuration
  'MESSAGE_QUEUE_ENABLED': 'messageQueue.enabled',
  'MESSAGE_QUEUE_MAX_SIZE': 'messageQueue.maxSize',
  'MESSAGE_QUEUE_BATCH_SIZE': 'messageQueue.batchSize',
  'MESSAGE_QUEUE_PROCESSING_INTERVAL': 'messageQueue.processingInterval',
  'MESSAGE_QUEUE_MESSAGE_TTL': 'messageQueue.messageTTL',
  
  // Health Monitoring
  'HEALTH_CHECK_INTERVAL': 'monitoring.healthCheckInterval',
  'METRICS_RETENTION_DAYS': 'monitoring.metricsInterval',
  'ALERT_THRESHOLD_ERROR_RATE': 'monitoring.alertThresholds.errorRate',
  'ALERT_THRESHOLD_DOWNTIME_MINUTES': 'monitoring.alertThresholds.downtimeMinutes',
  'ALERT_THRESHOLD_QUEUE_SIZE': 'monitoring.alertThresholds.queueSize'
};

/**
 * Resilience configuration manager
 */
export class ResilienceConfigManager {
  private config: ResilienceConfig;
  private configChangeListeners: Array<(config: ResilienceConfig) => void> = [];

  constructor(initialConfig?: Partial<ResilienceConfig>) {
    this.config = this.mergeConfig(DEFAULT_RESILIENCE_CONFIG, initialConfig || {});
    this.loadFromEnvironment();
  }

  /**
   * Gets the current configuration
   */
  getConfig(): ResilienceConfig {
    return JSON.parse(JSON.stringify(this.config)); // Deep copy
  }

  /**
   * Updates configuration with validation
   */
  updateConfig(updates: Partial<ResilienceConfig>): void {
    const newConfig = this.mergeConfig(this.config, updates);
    
    if (this.validateConfig(newConfig)) {
      const oldConfig = this.config;
      this.config = newConfig;
      
      logger.info('Resilience configuration updated', {
        changes: this.getConfigDiff(oldConfig, newConfig)
      });
      
      // Notify listeners
      this.notifyConfigChange();
    } else {
      throw new Error('Invalid configuration provided');
    }
  }

  /**
   * Loads configuration from environment variables
   */
  private loadFromEnvironment(): void {
    const envUpdates: any = {};
    
    for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        const parsedValue = this.parseEnvValue(envValue);
        this.setNestedValue(envUpdates, configPath, parsedValue);
      }
    }
    
    if (Object.keys(envUpdates).length > 0) {
      this.config = this.mergeConfig(this.config, envUpdates);
      logger.info('Loaded resilience configuration from environment variables', {
        loadedVars: Object.keys(ENV_MAPPINGS).filter(key => process.env[key] !== undefined)
      });
    }
  }

  /**
   * Parses environment variable value to appropriate type
   */
  private parseEnvValue(value: string): any {
    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Numeric values
    const numValue = Number(value);
    if (!isNaN(numValue)) return numValue;
    
    // String values
    return value;
  }

  /**
   * Sets a nested value in an object using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!key) continue;
      
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
  }

  /**
   * Merges configuration objects deeply
   */
  private mergeConfig(base: any, updates: any): any {
    const result = JSON.parse(JSON.stringify(base));
    
    for (const key in updates) {
      if (updates[key] !== null && typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
        result[key] = this.mergeConfig(result[key] || {}, updates[key]);
      } else {
        result[key] = updates[key];
      }
    }
    
    return result;
  }

  /**
   * Validates configuration values
   */
  private validateConfig(config: ResilienceConfig): boolean {
    try {
      // Validate telegram configuration
      if (config.telegram.retries.maxRetries < 0 || config.telegram.retries.maxRetries > 50) {
        logger.error('Invalid maxRetries: must be between 0 and 50');
        return false;
      }
      
      if (config.telegram.retries.baseDelay < 100 || config.telegram.retries.baseDelay > 10000) {
        logger.error('Invalid baseDelay: must be between 100ms and 10s');
        return false;
      }
      
      if (config.telegram.retries.maxDelay < config.telegram.retries.baseDelay) {
        logger.error('Invalid maxDelay: must be greater than baseDelay');
        return false;
      }
      
      if (config.telegram.circuitBreaker.threshold < 1 || config.telegram.circuitBreaker.threshold > 20) {
        logger.error('Invalid circuit breaker threshold: must be between 1 and 20');
        return false;
      }
      
      // Validate message queue configuration
      if (config.messageQueue.maxSize < 10 || config.messageQueue.maxSize > 10000) {
        logger.error('Invalid queue maxSize: must be between 10 and 10000');
        return false;
      }
      
      if (config.messageQueue.batchSize < 1 || config.messageQueue.batchSize > 100) {
        logger.error('Invalid queue batchSize: must be between 1 and 100');
        return false;
      }
      
      if (config.messageQueue.processingInterval < 1000 || config.messageQueue.processingInterval > 60000) {
        logger.error('Invalid processing interval: must be between 1s and 60s');
        return false;
      }
      
      // Validate monitoring configuration
      if (config.monitoring.alertThresholds.errorRate < 0 || config.monitoring.alertThresholds.errorRate > 1) {
        logger.error('Invalid error rate threshold: must be between 0 and 1');
        return false;
      }
      
      if (config.monitoring.alertThresholds.downtimeMinutes < 1 || config.monitoring.alertThresholds.downtimeMinutes > 1440) {
        logger.error('Invalid downtime threshold: must be between 1 minute and 24 hours');
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Configuration validation error', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Gets configuration differences between two configs
   */
  private getConfigDiff(oldConfig: ResilienceConfig, newConfig: ResilienceConfig): any {
    const diff: any = {};
    
    const findDifferences = (old: any, updated: any, path: string = '') => {
      for (const key in updated) {
        if (!key) continue;
        
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof updated[key] === 'object' && updated[key] !== null && !Array.isArray(updated[key])) {
          findDifferences(old?.[key] || {}, updated[key], currentPath);
        } else if (old?.[key] !== updated[key]) {
          diff[currentPath] = {
            old: old?.[key],
            new: updated[key]
          };
        }
      }
    };
    
    findDifferences(oldConfig, newConfig);
    return diff;
  }

  /**
   * Adds a configuration change listener
   */
  onConfigChange(listener: (config: ResilienceConfig) => void): void {
    this.configChangeListeners.push(listener);
  }

  /**
   * Removes a configuration change listener
   */
  removeConfigChangeListener(listener: (config: ResilienceConfig) => void): void {
    const index = this.configChangeListeners.indexOf(listener);
    if (index > -1) {
      this.configChangeListeners.splice(index, 1);
    }
  }

  /**
   * Notifies all listeners of configuration changes
   */
  private notifyConfigChange(): void {
    for (const listener of this.configChangeListeners) {
      try {
        listener(this.getConfig());
      } catch (error) {
        logger.error('Error in config change listener', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Resets configuration to defaults
   */
  resetToDefaults(): void {
    this.config = JSON.parse(JSON.stringify(DEFAULT_RESILIENCE_CONFIG));
    this.loadFromEnvironment();
    
    logger.info('Resilience configuration reset to defaults');
    this.notifyConfigChange();
  }

  /**
   * Gets configuration as environment variables format
   */
  toEnvironmentVariables(): Record<string, string> {
    const envVars: Record<string, string> = {};
    
    for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
      const value = this.getNestedValue(this.config, configPath);
      if (value !== undefined) {
        envVars[envVar] = String(value);
      }
    }
    
    return envVars;
  }

  /**
   * Gets a nested value from an object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Exports configuration to JSON
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Imports configuration from JSON
   */
  importConfig(jsonConfig: string): void {
    try {
      const importedConfig = JSON.parse(jsonConfig);
      this.updateConfig(importedConfig);
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Singleton instance
export const resilienceConfig = new ResilienceConfigManager();