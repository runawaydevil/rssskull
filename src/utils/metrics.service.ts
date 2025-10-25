import { logger } from './logger/logger.service.js';

export interface LatencyMetric {
  feedId: string;
  domain: string;
  publishedAt: Date;
  fetchedAt: Date;
  notifiedAt: Date;
  latencyMs: number;
}

export interface DomainLatencyStats {
  domain: string;
  p50: number;
  p90: number;
  p99: number;
  count: number;
  recentViolations: number;
}

export class MetricsService {
  private metrics: LatencyMetric[] = [];
  private readonly maxMetrics = 10000; // Keep last 10k metrics
  private readonly violationThreshold = 15 * 60 * 1000; // 15 minutes

  /**
   * Record a latency metric
   */
  recordLatency(metric: LatencyMetric): void {
    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Check SLO violations
    this.checkSLOViolations(metric);
  }

  /**
   * Calculate percentiles for a domain
   */
  getDomainStats(domain: string): DomainLatencyStats | null {
    const domainMetrics = this.metrics.filter(m => m.domain === domain);
    
    if (domainMetrics.length === 0) {
      return null;
    }

    const latencies = domainMetrics.map(m => m.latencyMs).sort((a, b) => a - b);
    
    return {
      domain,
      p50: this.percentile(latencies, 50),
      p90: this.percentile(latencies, 90),
      p99: this.percentile(latencies, 99),
      count: latencies.length,
      recentViolations: this.countRecentViolations(domain),
    };
  }

  /**
   * Get stats for all domains
   */
  getAllDomainStats(): DomainLatencyStats[] {
    const domains = new Set(this.metrics.map(m => m.domain));
    const stats: DomainLatencyStats[] = [];

    for (const domain of domains) {
      const domainStats = this.getDomainStats(domain);
      if (domainStats) {
        stats.push(domainStats);
      }
    }

    return stats;
  }

  /**
   * Check SLO violations and log alerts
   */
  private checkSLOViolations(metric: LatencyMetric): void {
    const domain = metric.domain;
    const isRedditOrIG = domain.includes('reddit.com') || domain.includes('instagram.com');
    
    // SLO thresholds
    const redditIGThreshold = 20 * 60 * 1000; // 20 minutes
    const generalThreshold = 60 * 60 * 1000; // 60 minutes
    
    const threshold = isRedditOrIG ? redditIGThreshold : generalThreshold;
    
    if (metric.latencyMs > threshold) {
      const violationType = isRedditOrIG ? 'Reddit/IG' : 'General';
      logger.error(
        `⚠️ SLO VIOLATION (${violationType}): Domain ${domain} - Latency ${this.formatLatency(metric.latencyMs)} exceeds threshold ${this.formatLatency(threshold)}`
      );
    }
  }

  /**
   * Count recent violations for a domain
   */
  private countRecentViolations(domain: string): number {
    const recentCutoff = Date.now() - this.violationThreshold;
    const domainMetrics = this.metrics.filter(m => m.domain === domain);
    
    const isRedditOrIG = domain.includes('reddit.com') || domain.includes('instagram.com');
    const threshold = isRedditOrIG ? 20 * 60 * 1000 : 60 * 60 * 1000;
    
    return domainMetrics.filter(m => 
      m.notifiedAt.getTime() > recentCutoff && m.latencyMs > threshold
    ).length;
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }

  /**
   * Format latency for logging
   */
  private formatLatency(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      return `${(ms / 60000).toFixed(1)}min`;
    }
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalMetrics: number;
    domainsTracked: number;
    avgLatency: number;
    slowestDomain: string | null;
  } {
    if (this.metrics.length === 0) {
      return {
        totalMetrics: 0,
        domainsTracked: 0,
        avgLatency: 0,
        slowestDomain: null,
      };
    }

    const avgLatency = this.metrics.reduce((sum, m) => sum + m.latencyMs, 0) / this.metrics.length;
    const domains = new Set(this.metrics.map(m => m.domain));
    
    // Find slowest domain by p90
    let slowestDomain: string | null = null;
    let slowestP90 = 0;
    
    for (const domain of domains) {
      const stats = this.getDomainStats(domain);
      if (stats && stats.p90 > slowestP90) {
        slowestP90 = stats.p90;
        slowestDomain = domain;
      }
    }

    return {
      totalMetrics: this.metrics.length,
      domainsTracked: domains.size,
      avgLatency: Math.round(avgLatency),
      slowestDomain,
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    const count = this.metrics.length;
    this.metrics = [];
    logger.info(`Cleared ${count} metrics`);
  }
}

// Singleton instance
export const metricsService = new MetricsService();

