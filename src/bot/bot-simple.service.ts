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

    // Feed commands - simplified
    this.bot.command('add', async (ctx) => {
      logger.info(`/add command from ${ctx.from?.first_name}`);
      await ctx.reply('⚠️ Feed management is being implemented. Please wait for updates.');
    });

    this.bot.command('list', async (ctx) => {
      logger.info(`/list command from ${ctx.from?.first_name}`);
      await ctx.reply('📋 Feed list functionality is being implemented.');
    });

    this.bot.command('remove', async (ctx) => {
      logger.info(`/remove command from ${ctx.from?.first_name}`);
      await ctx.reply('🗑️ Feed removal functionality is being implemented.');
    });

    this.bot.command('settings', async (ctx) => {
      logger.info(`/settings command from ${ctx.from?.first_name}`);
      await ctx.reply('⚙️ Settings functionality is being implemented.');
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

      // Start bot
      await this.bot.start();
      logger.info('✅ Bot started and listening for updates');
      console.log('✅ Bot started and listening for updates');

    } catch (error) {
      logger.error('❌ Failed to initialize simple bot:', error);
      console.error('❌ Failed to initialize simple bot:', error);
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
}

export const simpleBotService = new SimpleBotService();