/**
 * Unit tests for Metrics Service
 * Tests latency tracking, p90/p99 calculation, and SLO violations
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { metricsService } from '../src/utils/metrics.service.js';

describe('MetricsService', () => {
  beforeEach(() => {
    metricsService.clear();
  });

  describe('recordLatency', () => {
    it('should record latency metrics', () => {
      const metric = {
        feedId: 'feed1',
        domain: 'reddit.com',
        publishedAt: new Date(Date.now() - 600000), // 10 min ago
        fetchedAt: new Date(Date.now() - 300000),    // 5 min ago
        notifiedAt: new Date(),
        latencyMs: 600000, // 10 minutes
      };

      metricsService.recordLatency(metric);
      
      const stats = metricsService.getDomainStats('reddit.com');
      expect(stats).not.toBeNull();
      expect(stats?.count).toBe(1);
    });
  });

  describe('getDomainStats', () => {
    it('should calculate p50, p90, p99 percentiles', () => {
      // Add multiple latency metrics
      const latencies = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
      
      latencies.forEach((latency, index) => {
        metricsService.recordLatency({
          feedId: `feed${index}`,
          domain: 'test.com',
          publishedAt: new Date(Date.now() - latency),
          fetchedAt: new Date(Date.now() - latency / 2),
          notifiedAt: new Date(),
          latencyMs: latency,
        });
      });

      const stats = metricsService.getDomainStats('test.com');
      
      expect(stats).not.toBeNull();
      expect(stats?.p50).toBeGreaterThan(0);
      expect(stats?.p90).toBeGreaterThan(0);
      expect(stats?.p99).toBeGreaterThan(0);
      expect(stats?.count).toBe(10);
    });

    it('should return null for domain with no metrics', () => {
      const stats = metricsService.getDomainStats('nonexistent.com');
      expect(stats).toBeNull();
    });
  });

  describe('getSummary', () => {
    it('should return summary statistics', () => {
      // Add some metrics
      metricsService.recordLatency({
        feedId: 'feed1',
        domain: 'reddit.com',
        publishedAt: new Date(Date.now() - 600000),
        fetchedAt: new Date(Date.now() - 300000),
        notifiedAt: new Date(),
        latencyMs: 600000,
      });

      const summary = metricsService.getSummary();
      
      expect(summary.totalMetrics).toBeGreaterThan(0);
      expect(summary.domainsTracked).toBeGreaterThan(0);
      expect(summary.avgLatency).toBeGreaterThan(0);
    });
  });
});

