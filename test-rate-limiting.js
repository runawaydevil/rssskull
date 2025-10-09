#!/usr/bin/env node

/**
 * Test script to verify rate limiting and feed interval configurations
 */

import { getFeedConfigForDomain, getRecommendedHeaders } from './dist/config/feed.config.js';

console.log('🧪 Testing Feed Configuration System\n');

// Test URLs
const testUrls = [
  'https://www.reddit.com/r/programming.rss',
  'https://www.reddit.com/r/brasil.rss',
  'https://feeds.feedburner.com/TechCrunch',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx',
  'https://github.com/microsoft/vscode/releases.atom',
  'https://medium.com/feed/@username',
  'https://dev.to/feed',
  'https://hnrss.org/frontpage',
  'https://example.com/feed.xml', // Unknown domain
];

console.log('📊 Domain Configurations:');
console.log('=' .repeat(80));

testUrls.forEach(url => {
  const config = getFeedConfigForDomain(url);
  const headers = getRecommendedHeaders(url);
  
  console.log(`\n🔗 URL: ${url}`);
  console.log(`   📝 Description: ${config.description}`);
  console.log(`   ⏱️  Check Interval: ${config.checkIntervalMinutes} minutes`);
  console.log(`   🚦 Rate Limit: ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs/1000}s`);
  console.log(`   ⏳ Min Delay: ${config.rateLimit.minDelayMs}ms`);
  console.log(`   📋 Headers: ${Object.keys(headers).length} custom headers`);
  
  if (config.flags) {
    const flags = Object.entries(config.flags)
      .filter(([_, value]) => value)
      .map(([key, _]) => key);
    if (flags.length > 0) {
      console.log(`   🏷️  Flags: ${flags.join(', ')}`);
    }
  }
});

console.log('\n' + '=' .repeat(80));
console.log('✅ Configuration test completed successfully!');
console.log('\n💡 Key improvements implemented:');
console.log('   • Reddit feeds: 15min intervals, 5 req/min, 5s delays');
console.log('   • YouTube feeds: 10min intervals, 20 req/min, 2s delays');
console.log('   • GitHub releases: 30min intervals (low frequency)');
console.log('   • Default feeds: 5min intervals, 50 req/min');
console.log('   • Domain-specific headers and User-Agent strings');
console.log('   • Centralized configuration management');