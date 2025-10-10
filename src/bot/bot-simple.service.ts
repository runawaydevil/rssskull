import { Bot } from 'grammy';
import { config } from '../config/config.service.js';
import { notificationService } from '../services/notification.service.js';
import { logger } from '../utils/logger/logger.service.js';

export class SimpleBotService {
  private bot: Bot;
  private botUsername?: string;
  private botId?: number;

  constructor() {
    this.bot = new Bot(config.bot.token);
    this.setupCommands();
  }

  private setupCommands(): void {
    // Basic commands
    this.bot.command('start', async (ctx) => {
      logger.info(`/start command from ${ctx.from?.first_name}`);
      await ctx.reply('🚀 Hello! I am RSS Skull Bot v0.01.\n\nUse /help to see all available commands.');
    });

    this.bot.command('help', async (ctx) => {
      logger.info(`/help command from ${ctx.from?.first_name}`);
      const helpText = `📚 *Available Commands:*

🔗 *Feed Management:*
/add <name> <url> - Add RSS feed
/list - List all feeds
/remove <name> - Remove feed
/enable <name> - Enable feed
/disable <name> - Disable feed

⚙️ *Settings:*
/settings - View chat settings

📊 *Other:*
/help - Show this message
/ping - Test bot response

👨‍💻 *Developer:* Pablo Murad - https://github.com/runawaydevil`;

      await ctx.reply(helpText, { parse_mode: 'Markdown' });
    });

    this.bot.command('ping', async (ctx) => {
      logger.info(`/ping command from ${ctx.from?.first_name}`);
      await ctx.reply('🏓 Pong! Bot is working.');
    });

    // Feed commands - functional
    this.bot.command('add', async (ctx) => {
      logger.info(`/add command from ${ctx.from?.first_name}`);
      await this.handleAddFeed(ctx);
    });

    this.bot.command('list', async (ctx) => {
      logger.info(`/list command from ${ctx.from?.first_name}`);
      await this.handleListFeeds(ctx);
    });

    this.bot.command('remove', async (ctx) => {
      logger.info(`/remove command from ${ctx.from?.first_name}`);
      await this.handleRemoveFeed(ctx);
    });

    this.bot.command('settings', async (ctx) => {
      logger.info(`/settings command from ${ctx.from?.first_name}`);
      await this.handleSettings(ctx);
    });

    // Portuguese feed commands
    this.bot.command('adicionar', async (ctx) => {
      logger.info(`/adicionar command from ${ctx.from?.first_name}`);
      await this.handleAddFeed(ctx);
    });

    this.bot.command('listar', async (ctx) => {
      logger.info(`/listar command from ${ctx.from?.first_name}`);
      await this.handleListFeeds(ctx);
    });

    this.bot.command('remover', async (ctx) => {
      logger.info(`/remover command from ${ctx.from?.first_name}`);
      await this.handleRemoveFeed(ctx);
    });

    this.bot.command('configuracoes', async (ctx) => {
      logger.info(`/configuracoes command from ${ctx.from?.first_name}`);
      await this.handleSettings(ctx);
    });

    // Portuguese commands
    this.bot.command('iniciar', async (ctx) => {
      logger.info(`/iniciar command from ${ctx.from?.first_name}`);
      await ctx.reply('🚀 Olá! Eu sou o RSS Skull Bot v0.01.\n\nUse /ajuda para ver todos os comandos disponíveis.');
    });

    this.bot.command('ajuda', async (ctx) => {
      logger.info(`/ajuda command from ${ctx.from?.first_name}`);
      const helpText = `📚 *Comandos Disponíveis:*

🔗 *Gerenciamento de Feeds:*
/adicionar <nome> <url> - Adicionar feed RSS
/listar - Listar todos os feeds
/remover <nome> - Remover feed
/habilitar <nome> - Habilitar feed
/desabilitar <nome> - Desabilitar feed

⚙️ *Configurações:*
/configuracoes - Ver configurações do chat

📊 *Outros:*
/ajuda - Mostrar esta mensagem
/ping - Testar resposta do bot

👨‍💻 *Desenvolvedor:* Pablo Murad - https://github.com/runawaydevil`;

      await ctx.reply(helpText, { parse_mode: 'Markdown' });
    });

    // Log all messages for debugging
    this.bot.on('message', (ctx) => {
      const text = ctx.message.text || '[non-text message]';
      const user = ctx.from?.first_name || 'Unknown';
      const chatType = ctx.chat?.type || 'unknown';

      logger.info(`Message received: "${text}" from ${user} in ${chatType} chat`);

      // Handle unknown commands
      if (text.startsWith('/') && !text.match(/^\/(start|help|ping|add|list|remove|settings|iniciar|ajuda|adicionar|listar|remover|configuracoes|habilitar|desabilitar)(\s|$)/)) {
        ctx.reply('❌ Unknown command. Use /help or /ajuda to see available commands.');
      }
    });

    // Error handling
    this.bot.catch((err) => {
      const { ctx, error } = err;
      logger.error('Bot error:', {
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info('Simple bot commands configured');
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🔧 Initializing simple bot service...');
      console.log('🔧 Initializing simple bot service...');

      // Initialize notification service
      notificationService.initialize(this.bot);
      logger.info('✅ Notification service initialized');
      console.log('✅ Notification service initialized');

      // Get bot info
      const me = await this.bot.api.getMe();
      this.botUsername = me.username;
      this.botId = me.id;

      logger.info(`✅ Bot info: @${me.username} (${me.first_name})`);
      console.log(`✅ Bot info: @${me.username} (${me.first_name})`);

      // Set bot commands
      const commands = [
        { command: 'start', description: 'Start the bot' },
        { command: 'help', description: 'Show help' },
        { command: 'ping', description: 'Test bot' },
        { command: 'add', description: 'Add RSS feed' },
        { command: 'list', description: 'List feeds' },
        { command: 'settings', description: 'View settings' },
      ];

      await this.bot.api.setMyCommands(commands);
      logger.info('✅ Bot commands registered');
      console.log('✅ Bot commands registered');

      // Clear webhook to ensure polling works
      logger.info('🔧 Clearing webhook to enable polling...');
      console.log('🔧 Clearing webhook to enable polling...');

      try {
        await this.bot.api.deleteWebhook({ drop_pending_updates: true });
        logger.info('✅ Webhook cleared');
        console.log('✅ Webhook cleared');
      } catch (error) {
        logger.warn('Webhook clear failed (may not exist):', error);
        console.log('⚠️ Webhook clear failed (may not exist)');
      }

      // Skip bot.start() for now - it's causing timeout issues in Docker
      logger.info('⚠️ Skipping bot.start() due to Docker network timeout issues');
      console.log('⚠️ Skipping bot.start() due to Docker network timeout issues');
      
      // Load existing feeds for processing
      logger.info('🔄 Loading existing feeds for processing...');
      console.log('🔄 Loading existing feeds for processing...');
      await this.loadExistingFeeds();
      
      logger.info('✅ Bot initialized successfully (webhook mode ready)');
      console.log('✅ Bot initialized successfully (webhook mode ready)');

    } catch (error) {
      logger.error('❌ Failed to initialize simple bot:', error);
      console.error('❌ Failed to initialize simple bot:', error);
      throw error;
    }
  }

  async loadExistingFeeds(): Promise<void> {
    try {
      // Import services
      const { database } = await import('../database/database.service.js');
      const { feedQueueService } = await import('../jobs/index.js');
      const { feedIntervalService } = await import('../utils/feed-interval.service.js');

      // Get all chats with their feeds
      const chats = await database.client.chat.findMany({
        include: {
          feeds: {
            where: { enabled: true },
            include: { filters: true },
          },
        },
      });

      let totalScheduled = 0;
      let totalErrors = 0;

      for (const chat of chats) {
        if (chat.feeds.length === 0) continue;

        logger.info(`Loading ${chat.feeds.length} feeds for chat ${chat.id}`);
        console.log(`Loading ${chat.feeds.length} feeds for chat ${chat.id}`);

        for (const feed of chat.feeds) {
          try {
            const intervalMinutes = feedIntervalService.getIntervalForUrl(feed.rssUrl);

            await feedQueueService.scheduleRecurringFeedCheck({
              feedId: feed.id,
              chatId: feed.chatId,
              feedUrl: feed.rssUrl,
              lastItemId: feed.lastItemId ?? undefined,
            }, intervalMinutes);

            totalScheduled++;
            logger.debug(`Scheduled feed: ${feed.name} (${intervalMinutes}min interval)`);
          } catch (error) {
            totalErrors++;
            logger.error(`Failed to schedule feed ${feed.name}:`, error);
          }
        }
      }

      logger.info(`✅ Scheduled ${totalScheduled} feeds with rate limiting`);
      console.log(`✅ Scheduled ${totalScheduled} feeds with rate limiting`);
      
      if (totalErrors > 0) {
        logger.warn(`⚠️ ${totalErrors} feeds failed to schedule`);
        console.log(`⚠️ ${totalErrors} feeds failed to schedule`);
      }
    } catch (error) {
      logger.error('Failed to load existing feeds:', error);
      console.error('Failed to load existing feeds:', error);
    }
  }

  async startPolling(): Promise<void> {
    try {
      logger.info('🔄 Starting bot polling manually...');
      console.log('🔄 Starting bot polling manually...');
      
      await this.bot.start();
      logger.info('✅ Bot polling started successfully');
      console.log('✅ Bot polling started successfully');
    } catch (error) {
      logger.error('❌ Failed to start polling:', error);
      console.error('❌ Failed to start polling:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.bot.stop();
      logger.info('Bot stopped');
    } catch (error) {
      logger.error('Error stopping bot:', error);
      throw error;
    }
  }

  getBotInfo() {
    return {
      username: this.botUsername,
      id: this.botId,
    };
  }

  // Feed management methods
  private async handleAddFeed(ctx: any): Promise<void> {
    try {
      const text = ctx.message.text;
      const args = text.split(' ').slice(1); // Remove command

      if (args.length < 2) {
        await ctx.reply('❌ Usage: /add <name> <url>\nExample: /add tech https://feeds.feedburner.com/TechCrunch');
        return;
      }

      const [name, url] = args;
      const chatId = ctx.chat.id.toString();

      // Import feed service
      const { database } = await import('../database/database.service.js');
      const { FeedService } = await import('../services/feed.service.js');

      const feedService = new FeedService(database.client);

      await ctx.reply('⏳ Adding feed...');

      const result = await feedService.addFeed({
        chatId,
        name,
        url,
      });

      if (result.success) {
        let message = `✅ Feed "${name}" added successfully!`;

        if (result.conversionInfo) {
          message += `\n\n🔄 URL converted:\n${result.conversionInfo.platform}: ${result.conversionInfo.originalUrl}\n→ RSS: ${result.conversionInfo.rssUrl}`;
        }

        await ctx.reply(message);
      } else {
        const errors = result.errors?.map(e => `• ${e.message}`).join('\n') || 'Unknown error';
        await ctx.reply(`❌ Failed to add feed:\n${errors}`);
      }
    } catch (error) {
      logger.error('Error in handleAddFeed:', error);
      await ctx.reply('❌ An error occurred while adding the feed. Please try again.');
    }
  }

  private async handleListFeeds(ctx: any): Promise<void> {
    try {
      const chatId = ctx.chat.id.toString();

      // Import feed service
      const { database } = await import('../database/database.service.js');
      const { FeedService } = await import('../services/feed.service.js');

      const feedService = new FeedService(database.client);
      const feeds = await feedService.listFeeds(chatId);

      if (feeds.length === 0) {
        await ctx.reply('📋 No feeds configured for this chat.\n\nUse /add <name> <url> to add your first feed!');
        return;
      }

      let message = `📋 *Configured Feeds (${feeds.length}):*\n\n`;

      feeds.forEach((feed, index) => {
        const status = feed.enabled ? '✅' : '❌';
        const failureInfo = feed.failures > 0 ? ` (${feed.failures} failures)` : '';
        message += `${index + 1}. ${status} *${feed.name}*${failureInfo}\n   ${feed.url}\n\n`;
      });

      message += `Use /remove <name> to remove a feed\nUse /settings to configure options`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in handleListFeeds:', error);
      await ctx.reply('❌ An error occurred while listing feeds. Please try again.');
    }
  }

  private async handleRemoveFeed(ctx: any): Promise<void> {
    try {
      const text = ctx.message.text;
      const args = text.split(' ').slice(1); // Remove command

      if (args.length < 1) {
        await ctx.reply('❌ Usage: /remove <name>\nExample: /remove tech');
        return;
      }

      const name = args[0];
      const chatId = ctx.chat.id.toString();

      // Import feed service
      const { database } = await import('../database/database.service.js');
      const { FeedService } = await import('../services/feed.service.js');

      const feedService = new FeedService(database.client);

      const result = await feedService.removeFeed(chatId, name);

      if (result.success) {
        await ctx.reply(`✅ Feed "${name}" removed successfully!`);
      } else {
        await ctx.reply(`❌ ${result.message}`);
      }
    } catch (error) {
      logger.error('Error in handleRemoveFeed:', error);
      await ctx.reply('❌ An error occurred while removing the feed. Please try again.');
    }
  }

  private async handleSettings(ctx: any): Promise<void> {
    try {
      const chatId = ctx.chat.id.toString();

      // Import database service
      const { database } = await import('../database/database.service.js');

      // Get chat settings
      const chat = await database.client.chat.findUnique({
        where: { id: chatId },
        include: { feeds: true }
      });

      if (!chat) {
        await ctx.reply('⚙️ No settings found. Add a feed first with /add <name> <url>');
        return;
      }

      const feedCount = chat.feeds.length;
      const enabledFeeds = chat.feeds.filter(f => f.enabled).length;

      const message = `⚙️ *Chat Settings*

📊 *Feed Statistics:*
• Total feeds: ${feedCount}
• Enabled feeds: ${enabledFeeds}
• Disabled feeds: ${feedCount - enabledFeeds}

🔧 *Configuration:*
• Chat ID: ${chatId}
• Chat Type: ${ctx.chat.type}
• Rate limiting: Active (Reddit 15min, YouTube 10min)

📋 *Available Commands:*
• /add <name> <url> - Add new feed
• /list - Show all feeds
• /remove <name> - Remove feed
• /help - Show help

👨‍💻 *Developer:* Pablo Murad - https://github.com/runawaydevil`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in handleSettings:', error);
      await ctx.reply('❌ An error occurred while loading settings. Please try again.');
    }
  }
}

export const simpleBotService = new SimpleBotService();