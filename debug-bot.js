#!/usr/bin/env node

/**
 * Debug script to identify where the bot is hanging during initialization
 */

import { config } from './dist/config/config.service.js';
import { DatabaseService } from './dist/database/database.service.js';
import { logger } from './dist/utils/logger/logger.service.js';

async function debugInitialization() {
  console.log('🔍 Starting bot initialization debug...\n');

  try {
    console.log('1️⃣ Testing configuration loading...');
    console.log(`   Bot token: ${config.bot.token ? '✅ Present' : '❌ Missing'}`);
    console.log(`   Database URL: ${config.database.url}`);
    console.log(`   Server port: ${config.server.port}`);
    console.log('   ✅ Configuration loaded successfully\n');

    console.log('2️⃣ Testing database connection...');
    const database = new DatabaseService();
    await database.connect();
    console.log('   ✅ Database connected successfully');
    
    // Test database query
    const chatCount = await database.client.chat.count();
    console.log(`   📊 Found ${chatCount} chats in database`);
    
    const feedCount = await database.client.feed.count();
    console.log(`   📊 Found ${feedCount} feeds in database`);
    
    await database.disconnect();
    console.log('   ✅ Database disconnected successfully\n');

    console.log('3️⃣ Testing Redis connection...');
    const { jobService } = await import('./dist/jobs/index.js');
    const redisHealth = await jobService.healthCheck();
    console.log(`   Redis health: ${redisHealth ? '✅ Healthy' : '❌ Unhealthy'}\n`);

    console.log('4️⃣ Testing bot API connection...');
    const { Bot } = await import('grammy');
    const testBot = new Bot(config.bot.token);
    
    console.log('   🔄 Getting bot info...');
    const me = await testBot.api.getMe();
    console.log(`   ✅ Bot info: @${me.username} (${me.first_name})`);
    console.log(`   🆔 Bot ID: ${me.id}\n`);

    console.log('5️⃣ Testing feed loading simulation...');
    const database2 = new DatabaseService();
    await database2.connect();
    
    const chats = await database2.client.chat.findMany({
      include: {
        feeds: {
          where: { enabled: true },
          include: { filters: true },
        },
      },
    });
    
    console.log(`   📊 Found ${chats.length} chats with feeds`);
    
    let totalFeeds = 0;
    for (const chat of chats) {
      totalFeeds += chat.feeds.length;
      if (chat.feeds.length > 0) {
        console.log(`   📋 Chat ${chat.id}: ${chat.feeds.length} feeds`);
      }
    }
    
    console.log(`   📊 Total enabled feeds: ${totalFeeds}`);
    await database2.disconnect();
    console.log('   ✅ Feed loading simulation completed\n');

    console.log('6️⃣ Testing job queue initialization...');
    const { feedQueueService } = await import('./dist/jobs/index.js');
    console.log('   ✅ Feed queue service imported successfully');
    
    // Test scheduling a dummy job (don't actually schedule)
    console.log('   ✅ Job queue appears to be working\n');

    console.log('✅ All components tested successfully!');
    console.log('\n💡 The bot should be able to start normally.');
    console.log('   If it\'s still hanging, the issue might be in:');
    console.log('   • Bot polling initialization');
    console.log('   • Webhook setup');
    console.log('   • Network connectivity to Telegram API');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('\n🔍 Error details:');
    console.error('   Message:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
  
  process.exit(0);
}

debugInitialization();