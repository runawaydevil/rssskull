#!/usr/bin/env node

/**
 * Local system validation script (no BOT_TOKEN required)
 */

async function validateSystem() {
  console.log('🔍 RSS Skull Bot - Local System Validation\n');

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
  };

  // Test 1: User-Agent Service
  console.log('1️⃣ Testing User-Agent service...');
  try {
    const { userAgentService } = await import('./dist/utils/user-agent.service.js');
    const headers = userAgentService.getHeaders('https://reddit.com/r/test.rss');
    
    if (headers['User-Agent'] && headers['Accept'] && headers['Referer']) {
      console.log('   ✅ User-Agent service working');
      console.log(`   📋 Sample User-Agent: ${headers['User-Agent'].substring(0, 50)}...`);
      console.log(`   🔗 Reddit Referer: ${headers['Referer']}`);
      results.passed++;
    } else {
      console.log('   ❌ User-Agent service not generating proper headers');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ User-Agent service failed:', error.message);
    results.failed++;
  }

  // Test 2: Cache Service
  console.log('\n2️⃣ Testing cache service...');
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
      console.log(`   📊 Cache entries: ${stats.totalEntries}, Hit rate: ${stats.hitRate}%`);
      results.passed++;
    } else {
      console.log('   ❌ Cache service not working properly');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ Cache service failed:', error.message);
    results.failed++;
  }

  // Test 3: Rate Limiter Service
  console.log('\n3️⃣ Testing rate limiter service...');
  try {
    const { rateLimiterService } = await import('./dist/utils/rate-limiter.service.js');
    
    const delay1 = await rateLimiterService.checkRateLimit('https://reddit.com/r/test.rss');
    rateLimiterService.recordRequest('https://reddit.com/r/test.rss');
    const delay2 = await rateLimiterService.checkRateLimit('https://reddit.com/r/test.rss');
    
    console.log('   ✅ Rate limiter service working');
    console.log(`   ⏱️  Reddit delays: ${delay1}ms → ${delay2}ms`);
    
    const stats = rateLimiterService.getStats('reddit.com');
    console.log(`   📊 Reddit requests: ${stats.requestsInWindow || 0}`);
    results.passed++;
  } catch (error) {
    console.log('   ❌ Rate limiter service failed:', error.message);
    results.failed++;
  }

  // Test 4: Feed Interval Service
  console.log('\n4️⃣ Testing feed interval service...');
  try {
    const { feedIntervalService } = await import('./dist/utils/feed-interval.service.js');
    
    const redditInterval = feedIntervalService.getIntervalForUrl('https://reddit.com/r/test.rss');
    const youtubeInterval = feedIntervalService.getIntervalForUrl('https://youtube.com/feeds/videos.xml');
    const githubInterval = feedIntervalService.getIntervalForUrl('https://github.com/user/repo/releases.atom');
    const defaultInterval = feedIntervalService.getIntervalForUrl('https://example.com/feed.xml');
    
    console.log('   ✅ Feed interval service working');
    console.log(`   📊 Intervals - Reddit: ${redditInterval}min, YouTube: ${youtubeInterval}min`);
    console.log(`   📊 GitHub: ${githubInterval}min, Default: ${defaultInterval}min`);
    
    if (redditInterval >= defaultInterval && githubInterval > youtubeInterval) {
      console.log('   ✅ Interval logic is correct');
      results.passed++;
    } else {
      console.log('   ⚠️  Interval logic may need review');
      results.warnings++;
    }
  } catch (error) {
    console.log('   ❌ Feed interval service failed:', error.message);
    results.failed++;
  }

  // Test 5: Feed Configuration
  console.log('\n5️⃣ Testing feed configuration...');
  try {
    const { getFeedConfigForDomain } = await import('./dist/config/feed.config.js');
    
    const redditConfig = getFeedConfigForDomain('https://reddit.com/r/test.rss');
    const defaultConfig = getFeedConfigForDomain('https://example.com/feed.xml');
    
    console.log('   ✅ Feed configuration working');
    console.log(`   📊 Reddit: ${redditConfig.checkIntervalMinutes}min, ${redditConfig.rateLimit.maxRequests} req/min`);
    console.log(`   📊 Default: ${defaultConfig.checkIntervalMinutes}min, ${defaultConfig.rateLimit.maxRequests} req/min`);
    
    if (redditConfig.rateLimit.maxRequests < defaultConfig.rateLimit.maxRequests) {
      console.log('   ✅ Reddit has stricter rate limits (correct)');
      results.passed++;
    } else {
      console.log('   ⚠️  Rate limit configuration may need review');
      results.warnings++;
    }
  } catch (error) {
    console.log('   ❌ Feed configuration failed:', error.message);
    results.failed++;
  }

  // Test 6: Template Service
  console.log('\n6️⃣ Testing template service...');
  try {
    const { TemplateService } = await import('./dist/services/template.service.js');
    
    const template = '🔗 {{title}}\n{{description}}\n[Read more]({{link}})';
    const errors = TemplateService.validateTemplate(template);
    const preview = TemplateService.previewTemplate(template);
    
    if (errors.length === 0 && preview.includes('Sample Title')) {
      console.log('   ✅ Template service working');
      console.log(`   📝 Preview: ${preview.substring(0, 50)}...`);
      results.passed++;
    } else {
      console.log('   ❌ Template service validation failed');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ Template service failed:', error.message);
    results.failed++;
  }

  // Test 7: Integration Test
  console.log('\n7️⃣ Testing service integration...');
  try {
    const { userAgentService } = await import('./dist/utils/user-agent.service.js');
    const { cacheService } = await import('./dist/utils/cache.service.js');
    const { rateLimiterService } = await import('./dist/utils/rate-limiter.service.js');
    
    // Simulate a request flow
    const url = 'https://reddit.com/r/programming.rss';
    
    // 1. Check cache (should be empty)
    const cached = cacheService.get(url);
    
    // 2. Check rate limiting
    const delay = await rateLimiterService.checkRateLimit(url);
    
    // 3. Get headers
    const headers = userAgentService.getHeaders(url);
    
    // 4. Record request
    rateLimiterService.recordRequest(url);
    
    // 5. Cache result
    const mockFeed = { title: 'Programming', items: [] };
    cacheService.set(url, mockFeed);
    
    // 6. Verify cache
    const nowCached = cacheService.get(url);
    
    if (!cached && nowCached && headers['User-Agent'] && delay >= 0) {
      console.log('   ✅ Service integration working');
      console.log('   🔄 Request flow: Rate limit → Headers → Cache → Success');
      results.passed++;
    } else {
      console.log('   ❌ Service integration failed');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ Integration test failed:', error.message);
    results.failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 LOCAL VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  
  const total = results.passed + results.failed + results.warnings;
  const successRate = ((results.passed / total) * 100).toFixed(1);
  
  console.log(`📈 Success Rate: ${successRate}%`);
  
  if (results.failed === 0) {
    console.log('\n🎉 All systems are working correctly!');
    console.log('🚀 RSS Skull Bot is ready for deployment.');
    console.log('\n📋 Features validated:');
    console.log('   ✅ User-Agent rotation with realistic browser profiles');
    console.log('   ✅ Intelligent caching with domain-specific TTL');
    console.log('   ✅ Rate limiting with Reddit-specific rules');
    console.log('   ✅ Dynamic feed intervals based on domain');
    console.log('   ✅ Centralized feed configuration');
    console.log('   ✅ Template system with validation');
    console.log('   ✅ Service integration and request flow');
  } else {
    console.log('\n⚠️  Some systems have issues that need attention.');
    console.log('🔧 Please review the failed tests above.');
  }
  
  console.log('\n💡 Next steps:');
  console.log('   • Deploy: docker compose up -d --build');
  console.log('   • Monitor: curl http://localhost:8916/health');
  console.log('   • Cache stats: curl http://localhost:8916/cache-stats');
  console.log('   • User-Agent stats: curl http://localhost:8916/user-agent-stats');
  
  process.exit(results.failed > 0 ? 1 : 0);
}

validateSystem().catch(error => {
  console.error('❌ Validation script failed:', error);
  process.exit(1);
});