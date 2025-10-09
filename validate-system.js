#!/usr/bin/env node

/**
 * System validation script to ensure all features are working correctly
 */

import { config } from './dist/config/config.service.js';
import { logger } from './dist/utils/logger/logger.service.js';

async function validateSystem() {
  console.log('🔍 RSS Skull Bot - System Validation\n');

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
  };

  // Test 1: Configuration Loading
  console.log('1️⃣ Testing configuration loading...');
  try {
    if (config.bot.token && config.server.port && config.database.url) {
      console.log('   ✅ Configuration loaded successfully');
      results.passed++;
    } else {
      console.log('   ❌ Missing required configuration');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ Configuration loading failed:', error.message);
    results.failed++;
  }

  // Test 2: User-Agent Service
  console.log('\n2️⃣ Testing User-Agent service...');
  try {
    const { userAgentService } = await import('./dist/utils/user-agent.service.js');
    const headers = userAgentService.getHeaders('https://reddit.com/r/test.rss');
    
    if (headers['User-Agent'] && headers['Accept'] && headers['Referer']) {
      console.log('   ✅ User-Agent service working');
      console.log(`   📋 Sample User-Agent: ${headers['User-Agent'].substring(0, 50)}...`);
      results.passed++;
    } else {
      console.log('   ❌ User-Agent service not generating proper headers');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ User-Agent service failed:', error.message);
    results.failed++;
  }

  // Test 3: Cache Service
  console.log('\n3️⃣ Testing cache service...');
  try {
    const { cacheService } = await import('./dist/utils/cache.service.js');
    
    // Test cache operations
    const testFeed = {
      title: 'Test Feed',
      items: [{ id: 'test1', title: 'Test Item', link: 'https://example.com' }],
    };
    
    cacheService.set('https://test.com/feed.xml', testFeed);
    const cached = cacheService.get('https://test.com/feed.xml');
    
    if (cached && cached.title === 'Test Feed') {
      console.log('   ✅ Cache service working');
      const stats = cacheService.getStats();
      console.log(`   📊 Cache entries: ${stats.totalEntries}`);
      results.passed++;
    } else {
      console.log('   ❌ Cache service not working properly');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ Cache service failed:', error.message);
    results.failed++;
  }

  // Test 4: Rate Limiter Service
  console.log('\n4️⃣ Testing rate limiter service...');
  try {
    const { rateLimiterService } = await import('./dist/utils/rate-limiter.service.js');
    
    const delay1 = await rateLimiterService.checkRateLimit('https://reddit.com/r/test.rss');
    rateLimiterService.recordRequest('https://reddit.com/r/test.rss');
    const delay2 = await rateLimiterService.checkRateLimit('https://reddit.com/r/test.rss');
    
    if (delay2 > delay1) {
      console.log('   ✅ Rate limiter service working');
      console.log(`   ⏱️  Reddit delay: ${delay2}ms`);
      results.passed++;
    } else {
      console.log('   ⚠️  Rate limiter may not be applying delays correctly');
      results.warnings++;
    }
  } catch (error) {
    console.log('   ❌ Rate limiter service failed:', error.message);
    results.failed++;
  }

  // Test 5: Feed Interval Service
  console.log('\n5️⃣ Testing feed interval service...');
  try {
    const { feedIntervalService } = await import('./dist/utils/feed-interval.service.js');
    
    const redditInterval = feedIntervalService.getIntervalForUrl('https://reddit.com/r/test.rss');
    const defaultInterval = feedIntervalService.getIntervalForUrl('https://example.com/feed.xml');
    
    if (redditInterval > defaultInterval) {
      console.log('   ✅ Feed interval service working');
      console.log(`   📊 Reddit: ${redditInterval}min, Default: ${defaultInterval}min`);
      results.passed++;
    } else {
      console.log('   ❌ Feed interval service not applying different intervals');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ Feed interval service failed:', error.message);
    results.failed++;
  }

  // Test 6: RSS Service Integration
  console.log('\n6️⃣ Testing RSS service integration...');
  try {
    const { RSSService } = await import('./dist/services/rss.service.js');
    const rssService = new RSSService();
    
    // Test with a simple RSS feed (this might fail due to network, that's ok)
    console.log('   🔄 Testing RSS parsing (network dependent)...');
    const result = await rssService.fetchFeed('https://feeds.feedburner.com/TechCrunch');
    
    if (result.success) {
      console.log('   ✅ RSS service working with real feed');
      console.log(`   📰 Parsed ${result.feed?.items.length || 0} items`);
      results.passed++;
    } else {
      console.log('   ⚠️  RSS service structure OK, but network test failed');
      console.log(`   📝 Error: ${result.error}`);
      results.warnings++;
    }
  } catch (error) {
    console.log('   ❌ RSS service integration failed:', error.message);
    results.failed++;
  }

  // Test 7: Database Connection
  console.log('\n7️⃣ Testing database connection...');
  try {
    const { DatabaseService } = await import('./dist/database/database.service.js');
    const database = new DatabaseService();
    await database.connect();
    
    const isHealthy = await database.healthCheck();
    await database.disconnect();
    
    if (isHealthy) {
      console.log('   ✅ Database connection working');
      results.passed++;
    } else {
      console.log('   ❌ Database health check failed');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ Database connection failed:', error.message);
    results.failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  
  const total = results.passed + results.failed + results.warnings;
  const successRate = ((results.passed / total) * 100).toFixed(1);
  
  console.log(`📈 Success Rate: ${successRate}%`);
  
  if (results.failed === 0) {
    console.log('\n🎉 All critical systems are working correctly!');
    console.log('🚀 RSS Skull Bot is ready for production use.');
  } else {
    console.log('\n⚠️  Some systems have issues that need attention.');
    console.log('🔧 Please review the failed tests above.');
  }
  
  console.log('\n💡 Next steps:');
  console.log('   • Deploy with: docker compose up -d --build');
  console.log('   • Monitor with: curl http://localhost:8916/health');
  console.log('   • Check cache: curl http://localhost:8916/cache-stats');
  console.log('   • View logs: docker compose logs -f rss-skull-bot');
  
  process.exit(results.failed > 0 ? 1 : 0);
}

validateSystem().catch(error => {
  console.error('❌ Validation script failed:', error);
  process.exit(1);
});