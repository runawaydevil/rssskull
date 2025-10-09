#!/usr/bin/env node

/**
 * Step-by-step debug script to identify exactly where the bot hangs
 */

import { config } from './dist/config/config.service.js';
import { logger } from './dist/utils/logger/logger.service.js';

async function debugBotInitialization() {
  console.log('🔍 Step-by-step bot initialization debug...\n');

  try {
    console.log('1️⃣ Testing BotService import...');
    const { BotService } = await import('./dist/bot/bot.service.js');
    console.log('   ✅ BotService imported successfully\n');

    console.log('2️⃣ Creating BotService instance...');
    const botService = new BotService();
    console.log('   ✅ BotService instance created\n');

    console.log('3️⃣ Testing notification service import...');
    const { notificationService } = await import('./dist/services/notification.service.js');
    console.log('   ✅ Notification service imported\n');

    console.log('4️⃣ Testing bot API connection...');
    const { Bot } = await import('grammy');
    const testBot = new Bot(config.bot.token);
    
    console.log('   🔄 Getting bot info...');
    const me = await testBot.api.getMe();
    console.log(`   ✅ Bot info: @${me.username} (${me.first_name})`);
    console.log(`   🆔 Bot ID: ${me.id}\n`);

    console.log('5️⃣ Testing notification service initialization...');
    notificationService.initialize(testBot);
    console.log('   ✅ Notification service initialized\n');

    console.log('6️⃣ Testing bot commands setup...');
    const commands = [
      { command: 'start', description: 'Start the bot and show welcome message' },
      { command: 'help', description: 'Show available commands' },
    ];
    await testBot.api.setMyCommands(commands);
    console.log('   ✅ Bot commands set successfully\n');

    console.log('7️⃣ Testing bot start (this is where it might hang)...');
    console.log('   🔄 Starting bot polling...');
    
    // Set a timeout for bot start
    const startPromise = testBot.start();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Bot start timeout after 30 seconds')), 30000)
    );

    await Promise.race([startPromise, timeoutPromise]);
    console.log('   ✅ Bot started successfully!\n');

    console.log('8️⃣ Testing bot stop...');
    await testBot.stop();
    console.log('   ✅ Bot stopped successfully\n');

    console.log('✅ All steps completed successfully!');
    console.log('💡 The bot should be able to initialize normally.');
    
  } catch (error) {
    console.error('❌ Debug failed at step:', error.message);
    console.error('\n🔍 Error details:');
    console.error('   Message:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack.split('\n').slice(0, 10).join('\n'));
    }
    
    if (error.message.includes('timeout')) {
      console.error('\n💡 The bot is hanging during the start() method.');
      console.error('   This could be due to:');
      console.error('   • Network connectivity issues to Telegram API');
      console.error('   • Webhook conflicts');
      console.error('   • Bot token issues');
      console.error('   • Firewall blocking outbound connections');
    }
  }
  
  process.exit(0);
}

debugBotInitialization();