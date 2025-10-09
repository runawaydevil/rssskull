import { getFeedConfigForDomain } from '../config/feed.config.js';
import { logger } from './logger/logger.service.js';

export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    minDelayMs: number;
}

export interface DomainConfig {
    [domain: string]: RateLimitConfig;
}

export class RateLimiterService {
    private requestHistory: Map<string, number[]> = new Map();
    private lastRequestTime: Map<string, number> = new Map();

    /**
     * Check if a request should be rate limited and return delay if needed
     */
    async checkRateLimit(url: string): Promise<number> {
        const domain = this.extractDomain(url);
        const feedConfig = getFeedConfigForDomain(url);
        const config = feedConfig.rateLimit;
        const now = Date.now();

        // Check minimum delay between requests
        const lastRequest = this.lastRequestTime.get(domain) || 0;
        const timeSinceLastRequest = now - lastRequest;

        if (timeSinceLastRequest < config.minDelayMs) {
            const delayNeeded = config.minDelayMs - timeSinceLastRequest;
            logger.debug(`Rate limiting ${domain}: need to wait ${delayNeeded}ms`);
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
        const feedConfig = getFeedConfigForDomain(url);
        const config = feedConfig.rateLimit;
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
     * Clear all rate limiting data
     */
    clearAll(): void {
        this.requestHistory.clear();
        this.lastRequestTime.clear();
        logger.info('Cleared all rate limiting data');
    }
}

// Singleton instance
export const rateLimiterService = new RateLimiterService();