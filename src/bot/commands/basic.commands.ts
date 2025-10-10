import {
  BaseCommandHandler,
  type CommandContext,
  type CommandHandler,
  CommandSchemas,
} from '../handlers/command.handler.js';
import { logger } from '../../utils/logger/logger.service.js';

/**
 * Start command handler
 */
export class StartCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new StartCommand();
    return {
      name: 'start',
      aliases: ['iniciar'],
      description: 'Start the bot and show welcome message',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    try {
      // Get chat information
      if (!ctx.chat) {
        throw new Error('Chat information not available');
      }

      const chatId = ctx.chat.id.toString();
      const chatType = ctx.chat.type;
      const chatTitle = 'title' in ctx.chat ? ctx.chat.title : null;

      // Import database service
      const { DatabaseService } = await import('../../database/database.service.js');

      // Initialize database
      const database = new DatabaseService();
      await database.connect();

      // Register or update chat directly with Prisma
      await database.client.chat.upsert({
        where: { id: chatId },
        update: {
          type: chatType,
          title: chatTitle,
          updatedAt: new Date(),
        },
        create: {
          id: chatId,
          type: chatType,
          title: chatTitle,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Create default settings if they don't exist
      await database.client.chatSettings.upsert({
        where: { chatId },
        update: {},
        create: {
          chatId,
          language: ctx.language || 'en',
          checkInterval: 300,
          maxFeeds: 50,
          enableFilters: true,
          timezone: 'UTC',
        },
      });

      logger.info(`Chat registered successfully: ${chatId} (${chatType}) - ${chatTitle || 'No title'}`);

      const welcomeMessage = `${ctx.t('welcome.title')}\n\n${ctx.t('welcome.help')}`;
      await ctx.reply(welcomeMessage);
    } catch (error) {
      logger.error('Failed to register chat in start command:', error);
      const welcomeMessage = `${ctx.t('welcome.title')}\n\n${ctx.t('welcome.help')}`;
      await ctx.reply(welcomeMessage);
    }
  }
}

/**
 * Help command handler
 */
export class HelpCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new HelpCommand();
    return {
      name: 'help',
      aliases: ['ajuda'],
      description: 'Show available commands',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    const helpMessage = `${ctx.t('help.title')}

${ctx.t('help.feeds')}
${ctx.t('cmd.add')}
${ctx.t('cmd.list')}
${ctx.t('cmd.remove')}
${ctx.t('cmd.enable')}
${ctx.t('cmd.disable')}

${ctx.t('help.settings')}
${ctx.t('cmd.settings')}
${ctx.t('cmd.filters')}

${ctx.t('help.stats')}
${ctx.t('cmd.stats')}

${ctx.t('help.other')}
${ctx.t('cmd.help')}

${ctx.t('help.developer')}`;

    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  }
}

/**
 * Secret ping command for testing bot functionality
 */
export class PingCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new PingCommand();
    return {
      name: 'ping',
      aliases: [],
      description: 'Secret ping command for testing',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    try {
      await ctx.reply('PONG!!!');
      logger.info('Ping command executed successfully', {
        chatId: ctx.chatIdString,
        userId: ctx.userId,
        chatType: ctx.chat?.type,
      });
    } catch (error) {
      logger.error('Error in ping command:', error);
      await ctx.reply('❌ Erro interno ao executar comando.');
    }
  }
}


/**
 * Secret reset command to clear all feeds and data
 */
export class ResetCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new ResetCommand();
    return {
      name: 'reset',
      aliases: [],
      description: 'Secret reset command to clear all feeds',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    try {
      await ctx.reply('⚠️ ATENÇÃO: Resetando TODOS os dados do banco de dados...\n\n🔄 Isso inclui:\n• Todos os feeds de todos os chats\n• Todos os filtros\n• Todas as configurações\n• Todas as estatísticas\n\n⏳ Processando...');

      // Import database service
      const { DatabaseService } = await import('../../database/database.service.js');
      const database = new DatabaseService();
      await database.connect();
      
      logger.info('FULL DATABASE RESET command starting', {
        chatId: ctx.chatIdString,
        userId: ctx.userId,
        chatType: ctx.chat?.type,
      });

      // Get counts before deletion for logging
      const totalFeeds = await database.client.feed.count();
      const totalFilters = await database.client.feedFilter.count();
      const totalSettings = await database.client.chatSettings.count();
      const totalStats = await database.client.statistic.count();
      
      logger.info('Database contents before FULL reset', {
        totalFeeds,
        totalFilters,
        totalSettings,
        totalStats,
      });

      // Delete ALL filters first (foreign key constraint)
      const deletedFilters = await database.client.feedFilter.deleteMany({});

      // Delete ALL feeds
      const deletedFeeds = await database.client.feed.deleteMany({});

      // Delete ALL chat settings
      const deletedSettings = await database.client.chatSettings.deleteMany({});

      // Delete ALL statistics
      const deletedStats = await database.client.statistic.deleteMany({});

      await database.disconnect();

      logger.info('FULL DATABASE RESET executed successfully', {
        chatId: ctx.chatIdString,
        userId: ctx.userId,
        chatType: ctx.chat?.type,
        deletedFeeds: deletedFeeds.count,
        deletedFilters: deletedFilters.count,
        deletedSettings: deletedSettings.count,
        deletedStats: deletedStats.count,
      });

      await ctx.reply(`✅ FULL RESET COMPLETED!\n\n📊 Data removed from ENTIRE database:\n• ${deletedFeeds.count} feeds\n• ${deletedFilters.count} filters\n• ${deletedSettings.count} settings\n• ${deletedStats.count} statistics\n\n🗑️ Database completely cleaned!`);
    } catch (error) {
      logger.error('Error in FULL DATABASE RESET command:', error);
      await ctx.reply('❌ Internal error executing full reset.');
    }
  }
}

/**
 * Secret command to list and remove problematic feeds
 */
export class FixFeedsCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new FixFeedsCommand();
    return {
      name: 'fixfeeds',
      aliases: [],
      description: 'Secret command to fix problematic feeds',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    try {
      await ctx.reply('🔍 Checking problematic feeds...');

      // Import database service
      const { DatabaseService } = await import('../../database/database.service.js');
      const database = new DatabaseService();
      await database.connect();

      // Get chat ID
      const chatId = ctx.chatIdString;

      // Find problematic feeds
      const problematicFeeds = await database.client.feed.findMany({
        where: {
          chatId,
          OR: [
            { rssUrl: { contains: 'reddit.com.br' } },
            { url: { contains: 'reddit.com.br' } },
          ],
        },
      });

      if (problematicFeeds.length === 0) {
        await ctx.reply('✅ No problematic feeds found!');
        await database.disconnect();
        return;
      }

      // Delete problematic feeds
      const deletedFeeds = await database.client.feed.deleteMany({
        where: {
          chatId,
          OR: [
            { rssUrl: { contains: 'reddit.com.br' } },
            { url: { contains: 'reddit.com.br' } },
          ],
        },
      });

      // Delete associated filters
      const deletedFilters = await database.client.feedFilter.deleteMany({
        where: {
          feed: {
            chatId,
            OR: [
              { rssUrl: { contains: 'reddit.com.br' } },
              { url: { contains: 'reddit.com.br' } },
            ],
          },
        },
      });

      await database.disconnect();

      logger.info('Fix feeds command executed successfully', {
        chatId,
        userId: ctx.userId,
        chatType: ctx.chat?.type,
        deletedFeeds: deletedFeeds.count,
        deletedFilters: deletedFilters.count,
      });

      await ctx.reply(`✅ Problematic feeds removed!\n\n📊 Data removed:\n• ${deletedFeeds.count} feeds\n• ${deletedFilters.count} filters\n\n🔗 Removed feeds:\n${problematicFeeds.map(f => `• ${f.name} (${f.rssUrl})`).join('\n')}`);
    } catch (error) {
      logger.error('Error in fixfeeds command:', error);
      await ctx.reply('❌ Internal error executing command.');
    }
  }
}

