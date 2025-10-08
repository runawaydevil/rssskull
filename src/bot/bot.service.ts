import { Bot, type Context, session } from 'grammy';
import { config } from '../config/config.service.js';
import { notificationService } from '../services/notification.service.js';
import { logger } from '../utils/logger/logger.service.js';
import {
  AddFeedCommand,
  DisableFeedCommand,
  EnableFeedCommand,
  FiltersCommand,
  HelpCommand,
  ListFeedsCommand,
  RemoveFeedCommand,
  SettingsCommand,
  StartCommand,
  StatsCommand,
} from './commands/index.js';
import { type CommandContext, CommandRouter, parseCommand } from './handlers/command.handler.js';
import {
  type AuthContext,
  type I18nContext,
  authMiddleware,
  i18nMiddleware,
  loggingMiddleware,
} from './middleware/index.js';

interface SessionData {
  language: 'en' | 'pt';
}

type BotContext = Context &
  AuthContext &
  I18nContext & {
    session: SessionData;
  };

export class BotService {
  private bot: Bot<BotContext>;
  private commandRouter: CommandRouter;

  constructor() {
    this.bot = new Bot<BotContext>(config.bot.token);
    this.commandRouter = new CommandRouter();
    this.setupMiddleware();
    this.setupCommands();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Session middleware - must be first
    this.bot.use(
      session({
        initial: (): SessionData => ({ language: 'en' }),
      })
    );

    // Logging middleware - tracks all interactions
    this.bot.use(loggingMiddleware());

    // Authentication middleware - extracts chat/user info
    this.bot.use(authMiddleware());

    // Internationalization middleware - provides translation functions
    this.bot.use(i18nMiddleware());

    // Language persistence middleware - saves language preference to session
    this.bot.use(async (ctx, next) => {
      // Update session language if it differs from detected language
      if (ctx.language && ctx.session.language !== ctx.language) {
        ctx.session.language = ctx.language;
        logger.debug('Updated session language', {
          chatId: ctx.chatId,
          newLanguage: ctx.language,
        });
      }
      await next();
    });
  }

  private setupCommands(): void {
    // Register all command handlers
    this.commandRouter.register(StartCommand.create());
    this.commandRouter.register(HelpCommand.create());
    this.commandRouter.register(AddFeedCommand.create());
    this.commandRouter.register(ListFeedsCommand.create());
    this.commandRouter.register(RemoveFeedCommand.create());
    this.commandRouter.register(EnableFeedCommand.create());
    this.commandRouter.register(DisableFeedCommand.create());
    this.commandRouter.register(SettingsCommand.create());
    this.commandRouter.register(FiltersCommand.create());
    this.commandRouter.register(StatsCommand.create());

    logger.info('Command router initialized', {
      commandCount: this.commandRouter.getCommands().length,
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.bot.catch((err) => {
      const { ctx, error } = err;

      logger.error('Bot error occurred', {
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        updateId: ctx.update.update_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Try to send error message to user if context is available
      if (ctx.chat && ctx.t) {
        ctx.reply(ctx.t('error.internal')).catch((replyError) => {
          logger.error('Failed to send error message to user', replyError);
        });
      }
    });

    // Handle commands through the command router
    this.bot.on('message:text', async (ctx, next) => {
      const text = ctx.message.text;

      // Check if message starts with / (command)
      if (text.startsWith('/')) {
        const { command, args } = parseCommand(text);

        // Try to execute the command
        const executed = await this.commandRouter.execute(ctx as CommandContext, command, args);

        if (!executed) {
          // Unknown command
          await ctx.reply(ctx.t('error.unknown_command'));
        }
        return;
      }

      // Continue to next handler for non-command messages
      await next();
    });

    // Handle callback queries (for future inline keyboards)
    this.bot.on('callback_query', async (ctx, next) => {
      // Answer callback query to remove loading state
      await ctx.answerCallbackQuery().catch((error) => {
        logger.warn('Failed to answer callback query', error);
      });

      await next();
    });
  }

  async initialize(): Promise<void> {
    try {
      // Initialize notification service with bot instance
      notificationService.initialize(this.bot);

      // Get bot info
      const me = await this.bot.api.getMe();
      logger.info(`Bot initialized: @${me.username} (${me.first_name})`);

      // Start polling
      await this.bot.start();
      logger.info('Bot started and listening for updates');
    } catch (error) {
      logger.error('Failed to initialize bot:', error);
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

  get instance(): Bot<BotContext> {
    return this.bot;
  }
}
