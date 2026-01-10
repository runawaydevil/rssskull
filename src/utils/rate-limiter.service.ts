import { getFeedConfigForDomain } from '../config/feed.config.js';
import { logger } from './logger/logger.service.js';

export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    minDelayMs: number;
    adaptiveEnabled: boolean;  // Enable adaptive throttling
    successThreshold: number;  // Success rate threshold for adjustment
    failurePenalty: number;    // Penalty multiplier for failures
    successReward: number;     // Reward multiplier for successes
}

export interface DomainConfig {
    [domain: string]: RateLimitConfig;
}

export class RateLimiterService {
    private requestHistory: Map<string, number[]> = new Map();
    private lastRequestTime: Map<string, number> = new Map();
    private adaptiveConfigs: Map<string, RateLimitConfig> = new Map();
    private successRates: Map<string, { successes: number; failures: number; lastReset: number }> = new Map();

    /**
     * Check if a request should be rate limited and return delay if needed
     */
    async checkRateLimit(url: string): Promise<number> {
        const domain = this.extractDomain(url);
        const config = this.getAdaptiveConfig(domain);
        const now = Date.now();

        // Check minimum delay between requests
        const lastRequest = this.lastRequestTime.get(domain) || 0;
        const timeSinceLastRequest = now - lastRequest;

        if (timeSinceLastRequest < config.minDelayMs) {
            const baseDelay = config.minDelayMs - timeSinceLastRequest;
            // Adicionar jitter aleatório (±30% de variação)
            const jitter = Math.random() * 0.6 * baseDelay - 0.3 * baseDelay;
            const delayNeeded = Math.max(0, baseDelay + jitter);
            logger.debug(`Rate limiting ${domain}: need to wait ${delayNeeded}ms (base: ${baseDelay}ms, jitter: ${jitter.toFixed(0)}ms)`);
            return delayNeeded;
        }

        // Check request count in window
        const history = this.requestHistory.get(domain) || [];
        const windowStart = now - config.windowMs;

        // Remove old requests outside the window
        const recentRequests = history.filter(time => time > windowStart);

        if (recentRequests.length >= config.maxRequests) {
            // Calculate delay until the oldest request in window expires
            const oldestRequest = Math.min(...recentRequests);
            const delayNeeded = (oldestRequest + config.windowMs) - now;
            logger.warn(`Rate limit exceeded for ${domain}: need to wait ${delayNeeded}ms`);
            return Math.max(delayNeeded, config.minDelayMs);
        }

        return 0; // No delay needed
    }

    /**
     * Record a request for rate limiting tracking
     */
    recordRequest(url: string): void {
        const domain = this.extractDomain(url);
        const now = Date.now();

        // Update last request time
        this.lastRequestTime.set(domain, now);

        // Add to request history
        const history = this.requestHistory.get(domain) || [];
        history.push(now);

        // Keep only recent requests
        const config = this.getAdaptiveConfig(domain);
        const windowStart = now - config.windowMs;
        const recentRequests = history.filter(time => time > windowStart);

        this.requestHistory.set(domain, recentRequests);

        logger.debug(`Recorded request for ${domain} (${recentRequests.length}/${config.maxRequests} in window)`);
    }

    /**
     * Wait for the specified delay
     */
    async wait(delayMs: number): Promise<void> {
        if (delayMs <= 0) return;

        logger.debug(`Waiting ${delayMs}ms for rate limiting...`);
        return new Promise(resolve => setTimeout(resolve, delayMs));
    }

    /**
     * Check rate limit and wait if necessary
     */
    async waitIfNeeded(url: string): Promise<void> {
        const delay = await this.checkRateLimit(url);
        if (delay > 0) {
            await this.wait(delay);
        }
        this.recordRequest(url);
    }

    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.toLowerCase();
        } catch {
            return 'unknown';
        }
    }





    /**
     * Get current statistics for a domain
     */
    getStats(domain?: string): Record<string, any> {
        if (domain) {
            const history = this.requestHistory.get(domain) || [];
            const lastRequest = this.lastRequestTime.get(domain) || 0;
            const feedConfig = getFeedConfigForDomain(`https://${domain}`);

            return {
                domain,
                config: feedConfig.rateLimit,
                requestsInWindow: history.length,
                lastRequestTime: new Date(lastRequest).toISOString(),
                timeSinceLastRequest: Date.now() - lastRequest,
            };
        }

        // Return stats for all domains
        const stats: Record<string, any> = {};
        for (const domain of this.requestHistory.keys()) {
            stats[domain] = this.getStats(domain);
        }
        return stats;
    }

    /**
     * Clear rate limiting data for a domain
     */
    clearDomain(domain: string): void {
        this.requestHistory.delete(domain);
        this.lastRequestTime.delete(domain);
        logger.info(`Cleared rate limiting data for ${domain}`);
    }

    /**
     * Record a successful request for adaptive throttling
     */
    recordSuccess(url: string): void {
        const domain = this.extractDomain(url);
        const stats = this.successRates.get(domain) || { successes: 0, failures: 0, lastReset: Date.now() };
        
        stats.successes++;
        this.successRates.set(domain, stats);
        
        // Adjust rate limiting if adaptive is enabled
        this.adjustRateLimit(domain, true);
        
        logger.debug(`Recorded success for ${domain} (${stats.successes} successes, ${stats.failures} failures)`);
    }

    /**
     * Record a failed request for adaptive throttling
     */
    recordFailure(url: string): void {
        const domain = this.extractDomain(url);
        const stats = this.successRates.get(domain) || { successes: 0, failures: 0, lastReset: Date.now() };
        
        stats.failures++;
        this.successRates.set(domain, stats);
        
        // Adjust rate limiting if adaptive is enabled
        this.adjustRateLimit(domain, false);
        
        logger.debug(`Recorded failure for ${domain} (${stats.successes} successes, ${stats.failures} failures)`);
    }

    /**
     * Adjust rate limiting based on success/failure patterns
     */
    private adjustRateLimit(domain: string, isSuccess: boolean): void {
        const feedConfig = getFeedConfigForDomain(`https://${domain}`);
        const baseConfig = feedConfig.rateLimit;
        
        // Check if adaptive throttling is enabled
        if (!baseConfig.adaptiveEnabled) {
            return;
        }

        const stats = this.successRates.get(domain);
        if (!stats) return;

        const totalRequests = stats.successes + stats.failures;
        if (totalRequests < 10) return; // Need minimum data points

        const successRate = stats.successes / totalRequests;
        const adaptiveConfig = this.adaptiveConfigs.get(domain) || { 
            ...baseConfig,
            adaptiveEnabled: baseConfig.adaptiveEnabled || false,
            successThreshold: baseConfig.successThreshold || 0.8,
            failurePenalty: baseConfig.failurePenalty || 1.5,
            successReward: baseConfig.successReward || 0.8,
        };

        if (isSuccess && successRate > (baseConfig.successThreshold || 0.8)) {
            // High success rate - can be more aggressive
            adaptiveConfig.minDelayMs = Math.max(
                baseConfig.minDelayMs * 0.8, // Reduce delay by 20%
                baseConfig.minDelayMs * 0.5   // But not less than 50% of original
            );
            adaptiveConfig.maxRequests = Math.min(
                Math.floor(baseConfig.maxRequests * 1.2), // Increase by 20%
                baseConfig.maxRequests * 2                 // But not more than double
            );
            
            logger.info(`Adaptive throttling: Increased limits for ${domain} (success rate: ${(successRate * 100).toFixed(1)}%)`);
        } else if (!isSuccess && successRate < (baseConfig.successThreshold || 0.8)) {
            // Low success rate - be more conservative
            adaptiveConfig.minDelayMs = Math.min(
                baseConfig.minDelayMs * 1.5, // Increase delay by 50%
                baseConfig.minDelayMs * 3    // But not more than triple
            );
            adaptiveConfig.maxRequests = Math.max(
                Math.floor(baseConfig.maxRequests * 0.8), // Reduce by 20%
                Math.floor(baseConfig.maxRequests * 0.5)   // But not less than half
            );
            
            logger.warn(`Adaptive throttling: Decreased limits for ${domain} (success rate: ${(successRate * 100).toFixed(1)}%)`);
        }

        this.adaptiveConfigs.set(domain, adaptiveConfig);
        
        // Reset stats periodically
        if (Date.now() - stats.lastReset > 3600000) { // 1 hour
            stats.successes = 0;
            stats.failures = 0;
            stats.lastReset = Date.now();
        }
    }

    /**
     * Get adaptive rate limit config for domain
     */
    private getAdaptiveConfig(domain: string): RateLimitConfig {
        const feedConfig = getFeedConfigForDomain(`https://${domain}`);
        const baseConfig = feedConfig.rateLimit;
        
        if (!baseConfig.adaptiveEnabled) {
            return {
                ...baseConfig,
                adaptiveEnabled: false,
                successThreshold: 0.8,
                failurePenalty: 1.5,
                successReward: 0.8,
            };
        }

        return this.adaptiveConfigs.get(domain) || {
            ...baseConfig,
            adaptiveEnabled: baseConfig.adaptiveEnabled || false,
            successThreshold: baseConfig.successThreshold || 0.8,
            failurePenalty: baseConfig.failurePenalty || 1.5,
            successReward: baseConfig.successReward || 0.8,
        };
    }

    /**
     * Clear all rate limiting data
     */
    clearAll(): void {
        this.requestHistory.clear();
        this.lastRequestTime.clear();
        this.adaptiveConfigs.clear();
        this.successRates.clear();
        logger.info('Cleared all rate limiting data including adaptive configs');
    }
}

// Singleton instance
export const rateLimiterService = new RateLimiterService();