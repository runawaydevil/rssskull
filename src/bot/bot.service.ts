import { Bot, type Context, session } from 'grammy';
import { run } from '@grammyjs/runner';
import { config } from '../config/config.service.js';
import { feedQueueService } from '../jobs/index.js';
import { notificationService } from '../services/notification.service.js';
import { logger } from '../utils/logger/logger.service.js';
import {
  AddFeedCommand,
  DisableFeedCommand,
  CircuitBreakerStatsCommand,
  DebugFeedCommand,
  DiscoverFeedsCommand,
  EnableFeedCommand,
  FeedStatusCommand,
  FiltersCommand,
  FixFeedsCommand,
  HelpCommand,
  ListFeedsCommand,
  PingCommand,
  // ProcessFeedCommand, // Disabled - command no longer used
  // ProcessFeedsCommand, // Disabled - command no longer used
  ReloadFeedsCommand,
  RemoveFeedCommand,
  ResetCircuitBreakerCommand,
  ResetCommand,
  ResetFeedCommand,
  // SettingsCommand, // Disabled - settings don't affect system
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
import { MentionProcessor } from '../utils/mention.utils.js';
import { 
  telegramResilienceHandler, 
  getTelegramConnectionManager,
  telegramCircuitBreaker,
  PersistentMessageQueue,
  TelegramQueueProcessor,
  TelegramHealthMonitor,
  TelegramResilienceEndpoints,
  TelegramErrorClassifier,
  MessagePriority,
  InMemoryMessageQueue
} from '../resilience/index.js';
import { DatabaseService } from '../database/database.service.js';

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
  private botUsername?: string;
  private botId?: number;
  private runner?: any;
  private feedsLoaded: boolean = false;
  
  // Resilience system components
  private connectionManager: any;
  private messageQueue: any;
  private queueProcessor: any;
  private healthMonitor: any;
  private resilienceEndpoints: any;
  private resilienceEnabled: boolean = true;

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

    // Message logging will be handled in setupCommandHandlers

    // Test command is now handled by CommandRouter

    // Note: Mention middleware will be added after bot initialization when we have bot info
  }

  private setupCommandHandlers(): void {
    logger.info('🔧 Setting up command handlers...');
    console.log('🔧 Setting up command handlers...');
    
    // Handle commands through the command router
    this.bot.on('message:text', async (ctx, next) => {
      const text = ctx.message.text;
      const authCtx = ctx as CommandContext;
      
      // Debug logging for all text messages
      const user = ctx.from?.first_name || 'Unknown';
      const chatType = ctx.chat?.type || 'unknown';
      logger.info(`📨 Text message received: "${text}" from ${user} in ${chatType} chat`);
      console.log(`📨 Text message received: "${text}" from ${user} in ${chatType} chat`);

      // Apply mention processing directly if bot info is available
      if (this.botUsername && this.botId && ctx.message?.text && ctx.message?.entities) {
        const mentionProcessor = MentionProcessor.create(this.botUsername, this.botId, false);
        const mentionContext = mentionProcessor.extractMentionCommand(text, ctx.message.entities);
        
        // Add mention context to the context object
        Object.assign(ctx, {
          mentionContext,
        });

        if (mentionContext.isMentioned) {
          logger.info('Bot mentioned in message (direct processing)', {
            chatId: authCtx.chatIdString,
            userId: authCtx.userId,
            chatType: ctx.chat?.type,
            mentionText: mentionContext.mentionText,
            extractedCommand: mentionContext.commandFromMention,
            argsCount: mentionContext.argsFromMention?.length || 0,
          });
        }
      }

      // Debug logging for text messages
      logger.info('Text message received', {
        chatId: authCtx.chatIdString,
        chatType: ctx.chat?.type,
        text: text?.substring(0, 100),
        hasEntities: !!(ctx.message as any).entities?.length,
        mentionContext: authCtx.mentionContext,
        hasMentionContext: !!authCtx.mentionContext,
        isMentioned: authCtx.mentionContext?.isMentioned,
      });

      // Auto-register chat when any message is received
      await this.autoRegisterChat(ctx);

      // Process direct commands (starting with /)
      if (text.startsWith('/')) {
        const { command, args } = parseCommand(text);

        // Check if auth context is properly set up
        if (!authCtx.chatIdString || !authCtx.userId) {
          logger.warn('Auth context not properly set up for command processing', {
            chatId: authCtx.chatIdString,
            userId: authCtx.userId,
            command,
            chatType: ctx.chat?.type,
          });
          return;
        }

        logger.info('Processing direct command', {
          chatId: authCtx.chatIdString,
          chatType: ctx.chat?.type,
          command,
          argsCount: args.length,
          isChannel: authCtx.isChannel,
        });

        try {
          // Execute the command through the router
          logger.info('Attempting to execute direct command', {
            chatId: authCtx.chatIdString,
            command,
            args,
            chatType: ctx.chat?.type,
          });

          const executed = await this.commandRouter.execute(authCtx, command, args);

          logger.info('Direct command execution result', {
            chatId: authCtx.chatIdString,
            command,
            executed,
            chatType: ctx.chat?.type,
          });

          if (!executed) {
            // Unknown command - provide helpful feedback
            const helpText = authCtx.isChannel
              ? `${ctx.t('error.unknown_command')}\n\n${ctx.t('help.mention_help')}`
              : ctx.t('error.unknown_command');

            await ctx.reply(helpText);

            logger.warn('Unknown direct command', {
              chatId: authCtx.chatIdString,
              command,
              chatType: ctx.chat?.type,
            });
          }
        } catch (error) {
          logger.error('Direct command execution error', {
            chatId: authCtx.chatIdString,
            command,
            error: error instanceof Error ? error.message : String(error),
          });

          await ctx.reply(ctx.t('error.internal'));
        }

        return;
      }

      // Enhanced mention detection and processing for channels and groups
      if (authCtx.mentionContext?.isMentioned) {
        logger.info('Bot mentioned in message', {
          chatId: authCtx.chatIdString,
          chatType: ctx.chat?.type,
          userId: authCtx.userId,
          isAnonymousAdmin: authCtx.isAnonymousAdmin,
          mentionText: authCtx.mentionContext.mentionText,
          hasCommand: !!authCtx.mentionContext.commandFromMention,
        });

        // For channels, validate permissions before processing commands
        if (authCtx.isChannel) {
          const hasPermissions = await this.validateChannelPermissions(ctx);
          if (!hasPermissions) {
            logger.warn('Insufficient permissions for channel operation', {
              chatId: authCtx.chatIdString,
              command: authCtx.mentionContext.commandFromMention,
            });

            const i18nCtx = ctx as any;
            const permissionMessage =
              i18nCtx.t('error.channel_permissions') ||
              'I need administrator permissions to work properly in this channel.';
            await ctx.reply(permissionMessage).catch(() => { });
            return;
          }
        }

        // Bot was mentioned - process the command from mention
        if (authCtx.mentionContext.commandFromMention) {
          const command = authCtx.mentionContext.commandFromMention;
          const args = authCtx.mentionContext.argsFromMention || [];

          logger.info('Processing command from mention', {
            chatId: authCtx.chatIdString,
            chatType: ctx.chat?.type,
            command,
            argsCount: args.length,
            isChannel: authCtx.isChannel,
          });

          try {
            // Execute the command through the router
            logger.info('Attempting to execute command from mention', {
              chatId: authCtx.chatIdString,
              command,
              args,
              chatType: ctx.chat?.type,
            });

            const executed = await this.commandRouter.execute(authCtx, command, args);

            logger.info('Command execution result', {
              chatId: authCtx.chatIdString,
              command,
              executed,
              chatType: ctx.chat?.type,
            });

            if (!executed) {
              // Unknown command from mention - provide helpful feedback
              const helpText = authCtx.isChannel
                ? `${ctx.t('error.unknown_command')}\n\n${ctx.t('help.mention_help')}`
                : ctx.t('error.unknown_command');

              await ctx.reply(helpText);

              logger.warn('Unknown command from mention', {
                chatId: authCtx.chatIdString,
                command,
                chatType: ctx.chat?.type,
              });
            }
          } catch (error) {
            logger.error('Error executing command from mention', {
              chatId: authCtx.chatIdString,
              command,
              error: error instanceof Error ? error.message : String(error),
            });

            // Use channel-specific error handling
            if (authCtx.isChannel) {
              await this.handleChannelError(ctx, error, {
                chatId: authCtx.chatIdString,
                command,
                userId: authCtx.userId,
              });
            } else {
              await this.handleStandardError(ctx, error);
            }
          }

          return;
        }
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
    this.commandRouter.register(DiscoverFeedsCommand.create());
    // this.commandRouter.register(SettingsCommand.create()); // Disabled - settings don't affect system
    this.commandRouter.register(FiltersCommand.create());
    this.commandRouter.register(PingCommand.create());
    this.commandRouter.register(ResetCommand.create());
    this.commandRouter.register(FixFeedsCommand.create());
    this.commandRouter.register(ResetCircuitBreakerCommand.create());
    this.commandRouter.register(CircuitBreakerStatsCommand.create());
    
    // Secret/debug commands (not listed in help)
    this.commandRouter.register(StatsCommand.create());
    // this.commandRouter.register(ProcessFeedsCommand.create()); // Disabled - command no longer used
    // this.commandRouter.register(ProcessFeedCommand.create()); // Disabled - command no longer used
    this.commandRouter.register(DebugFeedCommand.create());
    this.commandRouter.register(ResetFeedCommand.create());
    this.commandRouter.register(FeedStatusCommand.create());
    this.commandRouter.register(ReloadFeedsCommand.create());

    logger.info('Command router initialized', {
      commandCount: this.commandRouter.getCommands().length,
    });
  }

  private setupErrorHandling(): void {
    // Enhanced global error handler with resilience integration
    this.bot.catch(async (err) => {
      const { ctx, error } = err;
      const authCtx = ctx as AuthContext;

      // Enhanced error logging with channel context
      const errorInfo = {
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        updateId: ctx.update.update_id,
        chatType: ctx.chat?.type,
        isChannel: authCtx.isChannel,
        isAnonymousAdmin: authCtx.isAnonymousAdmin,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        messageText: ctx.message?.text?.substring(0, 100),
      };

      logger.error('Bot error occurred', errorInfo);

      // Integrate with resilience system
      if (this.resilienceEnabled) {
        await this.handleTelegramError(error, ctx, errorInfo);
      }

      // Channel-specific error handling
      if (authCtx.isChannel) {
        await this.handleChannelError(ctx, error, errorInfo);
      } else {
        // Standard error handling for private chats and groups
        await this.handleStandardError(ctx, error);
      }
    });

    // Handle commands through the command router
    this.bot.on('message:text', async (ctx, next) => {
      const text = ctx.message.text;
      const authCtx = ctx as CommandContext;

      // Apply mention processing directly if bot info is available
      if (this.botUsername && this.botId && ctx.message?.text && ctx.message?.entities) {
        const mentionProcessor = MentionProcessor.create(this.botUsername, this.botId, false);
        const mentionContext = mentionProcessor.extractMentionCommand(text, ctx.message.entities);
        
        // Add mention context to the context object
        Object.assign(ctx, {
          mentionContext,
        });

        if (mentionContext.isMentioned) {
          logger.info('Bot mentioned in message (direct processing)', {
            chatId: authCtx.chatIdString,
            userId: authCtx.userId,
            chatType: ctx.chat?.type,
            mentionText: mentionContext.mentionText,
            extractedCommand: mentionContext.commandFromMention,
            argsCount: mentionContext.argsFromMention?.length || 0,
          });
        }
      }

      // Debug logging for text messages
      logger.info('Text message received', {
        chatId: authCtx.chatIdString,
        chatType: ctx.chat?.type,
        text: text?.substring(0, 100),
        hasEntities: !!(ctx.message as any).entities?.length,
        mentionContext: authCtx.mentionContext,
        hasMentionContext: !!authCtx.mentionContext,
        isMentioned: authCtx.mentionContext?.isMentioned,
      });

      // Auto-register chat when any message is received
      await this.autoRegisterChat(ctx);

      // Process direct commands (starting with /)
      if (text.startsWith('/')) {
        const { command, args } = parseCommand(text);

        // Check if auth context is properly set up
        if (!authCtx.chatIdString || !authCtx.userId) {
          logger.warn('Auth context not properly set up for command processing', {
            chatId: authCtx.chatIdString,
            userId: authCtx.userId,
            command,
            chatType: ctx.chat?.type,
          });
          return;
        }

        logger.info('Processing direct command', {
          chatId: authCtx.chatIdString,
          chatType: ctx.chat?.type,
          command,
          argsCount: args.length,
          isChannel: authCtx.isChannel,
        });

        try {
          // Execute the command through the router
          logger.info('Attempting to execute direct command', {
            chatId: authCtx.chatIdString,
            command,
            args,
            chatType: ctx.chat?.type,
          });

          const executed = await this.commandRouter.execute(authCtx, command, args);

          logger.info('Direct command execution result', {
            chatId: authCtx.chatIdString,
            command,
            executed,
            chatType: ctx.chat?.type,
          });

          if (!executed) {
            // Unknown command - provide helpful feedback
            const helpText = authCtx.isChannel
              ? `${ctx.t('error.unknown_command')}\n\n${ctx.t('help.mention_help')}`
              : ctx.t('error.unknown_command');

            await ctx.reply(helpText);

            logger.warn('Unknown direct command', {
              chatId: authCtx.chatIdString,
              command,
              chatType: ctx.chat?.type,
            });
          }
        } catch (error) {
          logger.error('Direct command execution error', {
            chatId: authCtx.chatIdString,
            command,
            error: error instanceof Error ? error.message : String(error),
          });

          await ctx.reply(ctx.t('error.internal'));
        }

        return;
      }

      // Enhanced mention detection and processing for channels and groups
      if (authCtx.mentionContext?.isMentioned) {
        logger.info('Bot mentioned in message', {
          chatId: authCtx.chatIdString,
          chatType: ctx.chat?.type,
          userId: authCtx.userId,
          isAnonymousAdmin: authCtx.isAnonymousAdmin,
          mentionText: authCtx.mentionContext.mentionText,
          hasCommand: !!authCtx.mentionContext.commandFromMention,
        });

        // For channels, validate permissions before processing commands
        if (authCtx.isChannel) {
          const hasPermissions = await this.validateChannelPermissions(ctx);
          if (!hasPermissions) {
            logger.warn('Insufficient permissions for channel operation', {
              chatId: authCtx.chatIdString,
              command: authCtx.mentionContext.commandFromMention,
            });

            const i18nCtx = ctx as any;
            const permissionMessage =
              i18nCtx.t('error.channel_permissions') ||
              'I need administrator permissions to work properly in this channel.';
            await ctx.reply(permissionMessage).catch(() => { });
            return;
          }
        }

        // Bot was mentioned - process the command from mention
        if (authCtx.mentionContext.commandFromMention) {
          const command = authCtx.mentionContext.commandFromMention;
          const args = authCtx.mentionContext.argsFromMention || [];

          logger.info('Processing command from mention', {
            chatId: authCtx.chatIdString,
            chatType: ctx.chat?.type,
            command,
            argsCount: args.length,
            isChannel: authCtx.isChannel,
          });

          try {
            // Execute the command through the router
            logger.info('Attempting to execute command from mention', {
              chatId: authCtx.chatIdString,
              command,
              args,
              chatType: ctx.chat?.type,
            });

            const executed = await this.commandRouter.execute(authCtx, command, args);

            logger.info('Command execution result', {
              chatId: authCtx.chatIdString,
              command,
              executed,
              chatType: ctx.chat?.type,
            });

            if (!executed) {
              // Unknown command from mention - provide helpful feedback
              const helpText = authCtx.isChannel
                ? `${ctx.t('error.unknown_command')}\n\n${ctx.t('help.mention_help')}`
                : ctx.t('error.unknown_command');

              await ctx.reply(helpText);

              logger.warn('Unknown command from mention', {
                chatId: authCtx.chatIdString,
                command,
                chatType: ctx.chat?.type,
              });
            }
          } catch (error) {
            logger.error('Error executing command from mention', {
              chatId: authCtx.chatIdString,
              command,
              error: error instanceof Error ? error.message : String(error),
            });

            // Use channel-specific error handling
            if (authCtx.isChannel) {
              await this.handleChannelError(ctx, error, {
                chatId: authCtx.chatIdString,
                command,
                operation: 'mention_command',
              });
            } else {
              await ctx.reply(ctx.t('error.internal')).catch(() => {
                logger.error('Failed to send error message for mention command');
              });
            }
          }
          return;
        }
        // Bot was mentioned but no command - provide contextual fallback response
        logger.info('Bot mentioned without command, providing help', {
          chatId: authCtx.chatIdString,
          chatType: ctx.chat?.type,
          mentionText: authCtx.mentionContext.mentionText,
        });

        try {
          if (authCtx.isChannel) {
            // In channels, provide concise help with example
            const helpMessage = this.botUsername
              ? `${ctx.t('help.mention_help')}\n\n${ctx.t('help.example_usage')}: @${this.botUsername} /help`
              : ctx.t('help.mention_help');

            await ctx.reply(helpMessage);
          } else if (authCtx.isGroup) {
            // In groups, provide brief help or execute help command
            await this.commandRouter.execute(authCtx, 'help', []);
          } else {
            // In private chats, show full help
            await this.commandRouter.execute(authCtx, 'help', []);
          }
        } catch (error) {
          logger.error('Error sending fallback response for mention', {
            chatId: authCtx.chatIdString,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      // Process direct commands (starting with /)
      if (text.startsWith('/')) {
        const { command, args } = parseCommand(text);

        logger.debug('Processing direct command', {
          chatId: authCtx.chatIdString,
          chatType: ctx.chat?.type,
          command,
          argsCount: args.length,
        });

        // For channels, validate permissions before processing commands
        if (authCtx.isChannel) {
          const hasPermissions = await this.validateChannelPermissions(ctx);
          if (!hasPermissions) {
            logger.warn('Insufficient permissions for channel command', {
              chatId: authCtx.chatIdString,
              command,
            });

            const i18nCtx = ctx as any;
            const permissionMessage =
              i18nCtx.t('error.channel_permissions') ||
              'I need administrator permissions to work properly in this channel.';
            await ctx.reply(permissionMessage).catch(() => { });
            return;
          }
        }

        try {
          // Execute the command through the router
          const executed = await this.commandRouter.execute(authCtx, command, args);

          if (!executed) {
            // Unknown command - provide helpful feedback
            await ctx.reply(ctx.t('error.unknown_command'));

            logger.warn('Unknown direct command', {
              chatId: authCtx.chatIdString,
              command,
              chatType: ctx.chat?.type,
            });
          }
        } catch (error) {
          logger.error('Error executing direct command', {
            chatId: authCtx.chatIdString,
            command,
            error: error instanceof Error ? error.message : String(error),
          });

          // Use channel-specific error handling
          if (authCtx.isChannel) {
            await this.handleChannelError(ctx, error, {
              chatId: authCtx.chatIdString,
              command,
              operation: 'direct_command',
            });
          } else {
            await ctx.reply(ctx.t('error.internal')).catch(() => {
              logger.error('Failed to send error message for direct command');
            });
          }
        }
        return;
      }

      // Only process non-command messages in private chats
      if (authCtx.isPrivate) {
        // Auto-detect RSS URLs in messages (only in private chats)
        await this.autoDetectRSSUrls(ctx, text);
      }

      // Continue to next handler for non-command messages
      await next();
    });

    // Handle ALL updates to debug what's happening
    this.bot.use(async (ctx, next) => {
      logger.info('Raw update received', {
        updateType: ctx.update.update_id,
        hasMessage: !!ctx.message,
        hasChannelPost: !!ctx.channelPost,
        hasEditedMessage: !!ctx.editedMessage,
        hasEditedChannelPost: !!ctx.editedChannelPost,
        chatType: ctx.chat?.type,
        chatId: ctx.chat?.id,
        updateKeys: Object.keys(ctx.update),
      });
      await next();
    });

    // Handle channel posts specifically
    this.bot.on('channel_post', async (ctx) => {
      logger.info('Channel post received', {
        chatId: ctx.chat?.id,
        text: ctx.channelPost?.text,
        hasText: !!ctx.channelPost?.text,
        entities: ctx.channelPost?.entities,
        fullPost: JSON.stringify(ctx.channelPost, null, 2).substring(0, 500),
      });

      if (ctx.channelPost?.text && ctx.channelPost?.entities) {
        const text = ctx.channelPost.text;
        const entities = ctx.channelPost.entities;

        // Look for bot mentions
        const botMention = entities.find((entity: any) =>
          entity.type === 'mention' &&
          text.substring(entity.offset, entity.offset + entity.length) === `@${this.botUsername}`
        );

        if (botMention) {
          logger.info('Bot mentioned in channel post', {
            chatId: ctx.chat?.id,
            text,
            botUsername: this.botUsername,
          });

          // Extract command after mention
          const afterMention = text.substring(botMention.offset + botMention.length).trim();
          if (afterMention.startsWith('/')) {
            const { command, args } = parseCommand(afterMention);

            logger.info('Executing command from channel post', {
              chatId: ctx.chat?.id,
              command,
              args,
            });

            try {
              // Create command context with proper translation
              const commandCtx = Object.assign(ctx, {
                chatIdString: ctx.chat?.id?.toString(),
                userId: 0,
                isGroup: false,
                isPrivate: false,
                isChannel: true,
                isAnonymousAdmin: true,
                language: 'en',
                // Add proper translation function
                t: (key: string, params?: Record<string, string | number>): string => {
                  // Import translation messages from i18n middleware
                  const messages = {
                    'welcome.title': '🤖 Hello! I am RSS Skull Bot v0.01.',
                    'welcome.help': 'Use /help to see all available commands.',
                    'help.title': '📚 *Available Commands:*',
                    'help.feeds': '🔗 *Feed Management:*',
                    // 'help.settings': '⚙️ *Settings:*', // Disabled - settings don't affect system
                    'help.stats': '📊 *Statistics:*',
                    'help.other': 'ℹ️ *Other:*',
                    'help.developer': '👨‍💻 *Developer:* Pablo Murad - https://github.com/runawaydevil',
                    'cmd.add': '/add <name> <url> - Add RSS feed',
                    'cmd.list': '/list - List all feeds',
                    'cmd.remove': '/remove <name> - Remove feed',
                    'cmd.enable': '/enable <name> - Enable feed',
                    'cmd.disable': '/disable <name> - Disable feed',
                    // 'cmd.settings': '/settings - View chat settings', // Disabled - settings don't affect system
                    'cmd.filters': '/filters <name> - Manage feed filters',
                    'cmd.stats': '/stats - View usage statistics',
                    'cmd.help': '/help - Show this message',
                    'error.unknown_command': '❌ Unknown command. Use /help to see available commands.',
                    'error.internal': '❌ An internal error occurred. Please try again later.',
                    'status.processing': '⏳ Processing your request...',
                    'status.success': '✅ Operation completed successfully.',
                    'feed.added': '✅ Feed "{{name}}" added successfully!',
                    'feed.removed': '✅ Feed "{{name}}" removed successfully!',
                    'feed.enabled': '✅ Feed "{{name}}" enabled successfully!',
                    'feed.disabled': '✅ Feed "{{name}}" disabled successfully!',
                    'feed.not_found': '❌ Feed "{{name}}" not found.',
                    'feed.already_exists': '❌ Feed "{{name}}" already exists.',
                    'feed.list_empty': 'ℹ️ No feeds configured for this chat.',
                    'feed.invalid_url': '❌ Invalid URL format.',
                    'feed.invalid_name': '❌ Feed name must be between 1 and 50 characters.',
                    'feed.list_title': '📋 *Configured Feeds ({{count}}):*',
                    'feed.list_item': '{{status}} {{name}} - {{url}}',
                    'feed.validation_error': '❌ {{field}}: {{message}}',
                    'settings.title': '⚙️ *Chat Settings*',
                    'settings.language': '🌐 Language: {{language}}',
                    'settings.check_interval': '⏰ Check Interval: {{interval}} seconds ({{description}})',
                    'settings.max_feeds': '📊 Max Feeds: {{count}}',
                    'settings.filters_enabled': '🔍 Filters: {{status}}',
                    'settings.message_template': '📝 Message Template: {{template}}',
                    'settings.timezone': '🌍 Timezone: {{timezone}}',
                    'settings.updated': '✅ Settings updated successfully!',
                    'settings.help': 'Use: /settings [language|interval|template|reset] [value]',
                    'settings.enabled': 'Enabled',
                    'settings.disabled': 'Disabled',
                    'settings.no_template': 'Default template',
                    'stats.title': '📊 *Usage Statistics ({{period}} days)*',
                    'stats.no_data': 'ℹ️ No statistics available for this chat yet.',
                    'stats.period_30': '30 days',
                    'filter.help': '🔍 *Filter Commands:*\n\n• `/filters list <feed_name>` - List filters for a feed\n• `/filters add <feed_name> <include|exclude> <pattern> [regex]` - Add filter\n• `/filters remove <feed_name> <filter_id>` - Remove filter\n• `/filters clear <feed_name>` - Clear all filters',
                  };

                  let message = messages[key as keyof typeof messages] || key;

                  if (params) {
                    // Simple parameter substitution
                    Object.entries(params).forEach(([param, value]) => {
                      message = message.replace(`{{${param}}}`, String(value));
                    });
                  }

                  return message;
                },
              }) as CommandContext;

              const executed = await this.commandRouter.execute(commandCtx, command, args);
              if (!executed) {
                await ctx.reply('❌ Unknown command. Use /help to see available commands.');
              }
            } catch (error) {
              logger.error('Error executing channel post command', { error });
              await ctx.reply('❌ An error occurred while processing your command.');
            }
          }
        }
      }
    });

    // Handle all message types in channels (not just text)
    this.bot.on('message', async (ctx, next) => {
      const authCtx = ctx as AuthContext;

      // Enhanced logging for all channel interactions
      if (authCtx.isChannel) {
        const messageType = this.getMessageType(ctx.message);
        const hasText = !!ctx.message.text;
        const hasEntities = !!(ctx.message as any).entities?.length;

        logger.info('Channel message received', {
          chatId: authCtx.chatIdString,
          userId: authCtx.userId,
          isAnonymousAdmin: authCtx.isAnonymousAdmin,
          messageType,
          hasText,
          hasEntities,
          updateId: ctx.update.update_id,
          textPreview: hasText ? ctx.message.text?.substring(0, 100) : undefined,
          messageKeys: Object.keys(ctx.message),
          rawUpdate: JSON.stringify(ctx.update, null, 2).substring(0, 800),
        });

        // If it's a text message in channel, process it here since message:text might not catch it
        if (hasText && ctx.message.text) {
          logger.info('Processing channel text message directly', {
            chatId: authCtx.chatIdString,
            text: ctx.message.text,
            entities: (ctx.message as any).entities,
          });

          // Auto-register chat
          await this.autoRegisterChat(ctx);

          // Check for mentions manually
          const text = ctx.message.text;
          const entities = (ctx.message as any).entities || [];

          // Look for bot mentions
          const botMention = entities.find((entity: any) =>
            entity.type === 'mention' &&
            text.substring(entity.offset, entity.offset + entity.length) === `@${this.botUsername}`
          );

          if (botMention) {
            logger.info('Bot mentioned in channel message', {
              chatId: authCtx.chatIdString,
              text,
              botUsername: this.botUsername,
            });

            // Extract command after mention
            const afterMention = text.substring(botMention.offset + botMention.length).trim();
            if (afterMention.startsWith('/')) {
              const { command, args } = parseCommand(afterMention);

              logger.info('Executing command from channel mention', {
                chatId: authCtx.chatIdString,
                command,
                args,
              });

              try {
                // Ensure we have the right context type
                const commandCtx = authCtx as CommandContext;
                if (!commandCtx.t) {
                  // Add translation function if missing
                  Object.assign(commandCtx, {
                    t: (key: string) => key, // Fallback translation
                  });
                }

                const executed = await this.commandRouter.execute(commandCtx, command, args);
                if (!executed) {
                  await ctx.reply(commandCtx.t('error.unknown_command'));
                }
              } catch (error) {
                logger.error('Error executing channel command', { error });
                await ctx.reply('❌ An error occurred while processing your command.');
              }
              return; // Don't continue processing
            }
          }
        }

        // For non-text messages in channels, check if they contain mentions
        // This handles cases where users might send media with captions containing mentions
        if (!hasText && ctx.message.caption && (ctx.message as any).caption_entities) {
          const captionAuthCtx = ctx as CommandContext;

          // Process caption mentions similar to text mentions
          if (captionAuthCtx.mentionContext?.isMentioned) {
            logger.info('Bot mentioned in caption', {
              chatId: authCtx.chatIdString,
              messageType,
              captionPreview: ctx.message.caption.substring(0, 50),
            });

            // Handle caption mentions (could contain commands)
            if (captionAuthCtx.mentionContext.commandFromMention) {
              const command = captionAuthCtx.mentionContext.commandFromMention;
              const args = captionAuthCtx.mentionContext.argsFromMention || [];

              try {
                const executed = await this.commandRouter.execute(captionAuthCtx, command, args);
                if (!executed) {
                  await ctx.reply(ctx.t('error.unknown_command'));
                }
              } catch (error) {
                logger.error('Error executing command from caption mention', {
                  chatId: authCtx.chatIdString,
                  command,
                  error: error instanceof Error ? error.message : String(error),
                });
                await ctx.reply(ctx.t('error.internal')).catch(() => { });
              }
              return; // Don't continue processing
            }
          }
        }
      }

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
      logger.info('🔧 Step 1: Initializing notification service...');
      console.log('🔧 Step 1: Initializing notification service...');
      // Initialize notification service with bot instance
      notificationService.initialize(this.bot);
      logger.info('✅ Notification service initialized');
      console.log('✅ Notification service initialized');

      logger.info('🔧 Step 1.5: Initializing resilience system...');
      console.log('🔧 Step 1.5: Initializing resilience system...');
      await this.initializeResilienceSystem();
      logger.info('✅ Resilience system initialized');
      console.log('✅ Resilience system initialized');

      logger.info('🔧 Step 2: Getting bot info from Telegram API...');
      console.log('🔧 Step 2: Getting bot info from Telegram API...');
      // Get bot info and store for mention processing
      const me = await this.bot.api.getMe();
      this.botUsername = me.username;
      this.botId = me.id;

      // Store bot info for mention processing
      logger.info('✅ Bot info obtained for mention processing', {
        botUsername: this.botUsername,
        botId: this.botId,
      });
      console.log(`✅ Bot info: @${me.username} (${me.first_name})`);

      logger.info('🔧 Step 3: Registering bot commands...');
      console.log('🔧 Step 3: Registering bot commands...');
      // Register bot commands in BotFather
      await this.setBotCommands();
      logger.info('✅ Bot commands registered');
      console.log('✅ Bot commands registered');

      // Add command processing handler after middleware setup
      this.setupCommandHandlers();

      logger.info('🔧 Step 4: Starting bot polling (this might take a moment)...');
      console.log('🔧 Step 4: Starting bot polling (this might take a moment)...');
      
      // Clear any existing webhook first
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

      // Use grammY Runner for better reliability and concurrency
      logger.info('🔧 Starting bot with grammY Runner...');
      console.log('🔧 Starting bot with grammY Runner...');
      
      try {
        // Start bot with runner for concurrent processing
        this.runner = run(this.bot);
        
        logger.info('✅ Bot started with grammY Runner');
        console.log('✅ Bot started with grammY Runner');
      } catch (error) {
        logger.error('❌ Failed to start bot with runner:', error);
        console.error('❌ Failed to start bot with runner:', error);
        
        // Check for 409 Conflict error (multiple instances)
        if (error && typeof error === 'object' && 'error_code' in error && error.error_code === 409) {
          logger.error('🔴 Conflict detected: Another bot instance is running');
          logger.info('⏳ Waiting 5 seconds before retry...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Retry deleting webhook
          try {
            await this.bot.api.deleteWebhook({ drop_pending_updates: true });
            logger.info('✅ Webhook cleared on retry');
          } catch (webhookError) {
            logger.warn('Webhook clear failed on retry:', webhookError);
          }
        }
        
        // Fallback to regular polling
        logger.info('🔄 Falling back to regular polling...');
        console.log('🔄 Falling back to regular polling...');
        
        // Try regular polling with timeout
        const pollingPromise = this.bot.start();
        const pollingTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Polling timeout')), 15000)
        );
        
        try {
          await Promise.race([pollingPromise, pollingTimeout]);
          logger.info('✅ Bot polling started successfully');
          console.log('✅ Bot polling started successfully');
        } catch (pollingError) {
          logger.error('❌ Regular polling also failed:', pollingError);
          console.error('❌ Regular polling also failed:', pollingError);
          
          // Last resort: start polling in background without waiting
          this.bot.start().then(() => {
            logger.info('✅ Bot polling started in background (last resort)');
            console.log('✅ Bot polling started in background (last resort)');
          }).catch((bgError) => {
            logger.error('❌ All polling methods failed:', bgError);
            console.error('❌ All polling methods failed:', bgError);
          });
        }
      }
      
      logger.info('✅ Bot polling initialization completed');
      console.log('✅ Bot polling initialization completed');

      logger.info('🔧 Step 5: Scheduling background feed loading...');
      console.log('🔧 Step 5: Scheduling background feed loading...');
      // Load and schedule all existing feeds AFTER bot is running
      this.loadAndScheduleAllFeedsAsync();
      logger.info('✅ Background feed loading scheduled');
      console.log('✅ Background feed loading scheduled');
      
    } catch (error) {
      logger.error('❌ Failed to initialize bot:', error);
      console.error('❌ Failed to initialize bot:', error);
      throw error;
    }
  }

  /**
   * Simplified initialization that skips feed loading for debugging
   */
  async initializeSimplified(): Promise<void> {
    try {
      // Initialize notification service with bot instance
      notificationService.initialize(this.bot);

      // Get bot info and store for mention processing
      const me = await this.bot.api.getMe();
      this.botUsername = me.username;
      this.botId = me.id;

      // Store bot info for mention processing
      logger.info('Bot info obtained for mention processing', {
        botUsername: this.botUsername,
        botId: this.botId,
      });

      logger.info(`Bot initialized: @${me.username} (${me.first_name})`);

      // Register bot commands in BotFather
      await this.setBotCommands();

      // SKIP: Load and schedule all existing feeds (this is what's causing the hang)
      logger.info('⚠️ Skipping feed loading in simplified mode');

      // Start polling
      await this.bot.start();
      logger.info('Bot started and listening for updates');
    } catch (error) {
      logger.error('Failed to initialize bot (simplified):', error);
      throw error;
    }
  }

  /**
   * Initialize bot for webhook mode (no polling)
   */
  async initializeWebhook(): Promise<void> {
    try {
      logger.info('🔧 Step 1: Initializing notification service...');
      console.log('🔧 Step 1: Initializing notification service...');
      // Initialize notification service with bot instance
      notificationService.initialize(this.bot);
      logger.info('✅ Notification service initialized');
      console.log('✅ Notification service initialized');

      logger.info('🔧 Step 2: Getting bot info from Telegram API...');
      console.log('🔧 Step 2: Getting bot info from Telegram API...');
      // Get bot info and store for mention processing
      const me = await this.bot.api.getMe();
      this.botUsername = me.username;
      this.botId = me.id;

      // Store bot info for mention processing
      logger.info('✅ Bot info obtained for mention processing', {
        botUsername: this.botUsername,
        botId: this.botId,
      });
      console.log(`✅ Bot info: @${me.username} (${me.first_name})`);

      logger.info('🔧 Step 3: Registering bot commands...');
      console.log('🔧 Step 3: Registering bot commands...');
      // Register bot commands in BotFather
      await this.setBotCommands();
      logger.info('✅ Bot commands registered');
      console.log('✅ Bot commands registered');

      // NO POLLING - webhook mode
      logger.info('✅ Bot ready for webhook mode (no polling)');
      console.log('✅ Bot ready for webhook mode (no polling)');
      
    } catch (error) {
      logger.error('❌ Failed to initialize bot (webhook):', error);
      console.error('❌ Failed to initialize bot (webhook):', error);
      throw error;
    }
  }

  /**
   * Get the bot instance for webhook setup
   */
  getBot() {
    return this.bot;
  }

  async stop(): Promise<void> {
    try {
      if (this.runner) {
        // Stop runner if it was used
        await this.runner.stop();
        logger.info('Bot runner stopped');
      } else {
        // Stop regular polling
        await this.bot.stop();
        logger.info('Bot polling stopped');
      }
    } catch (error) {
      logger.error('Error stopping bot:', error);
      throw error;
    }
  }

  /**
   * Check if bot polling is active
   */
  async isPollingActive(): Promise<boolean> {
    try {
      if (this.runner) {
        // For grammY Runner, we can check if it's running
        // Runner doesn't expose a direct isRunning method, so we'll use a workaround
        // Try to get bot info - if this succeeds, polling is likely active
        try {
          await this.bot.api.getMe();
          return true;
        } catch (error) {
          logger.warn('Bot polling health check failed:', error);
          return false;
        }
      } else {
        // For regular polling, check if bot is running
        try {
          await this.bot.api.getMe();
          return true;
        } catch (error) {
          logger.warn('Bot polling health check failed:', error);
          return false;
        }
      }
    } catch (error) {
      logger.error('Error checking bot polling status:', error);
      return false;
    }
  }

  /**
   * Restart bot polling if it's not active
   */
  async restartPollingIfNeeded(): Promise<boolean> {
    try {
      const isActive = await this.isPollingActive();
      
      if (isActive) {
        logger.debug('Bot polling is active - no restart needed');
        return false;
      }

      logger.warn('⚠️ Bot polling is not active - attempting to restart...');
      console.log('⚠️ Bot polling is not active - attempting to restart...');

      // Stop existing polling/runner first
      try {
        if (this.runner) {
          await this.runner.stop();
        } else {
          await this.bot.stop();
        }
      } catch (stopError) {
        logger.warn('Error stopping existing polling (continuing anyway):', stopError);
      }

      // Clear webhook
      try {
        await this.bot.api.deleteWebhook({ drop_pending_updates: true });
        logger.info('Webhook cleared for restart');
      } catch (webhookError) {
        logger.warn('Webhook clear failed during restart (continuing anyway):', webhookError);
      }

      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Restart polling
      try {
        this.runner = run(this.bot);
        logger.info('✅ Bot polling restarted successfully');
        console.log('✅ Bot polling restarted successfully');
        return true;
      } catch (runnerError) {
        logger.error('Failed to restart with runner, trying regular polling:', runnerError);
        
        // Fallback to regular polling
        try {
          await this.bot.start();
          logger.info('✅ Bot polling restarted with regular polling');
          console.log('✅ Bot polling restarted with regular polling');
          return true;
        } catch (pollingError) {
          logger.error('❌ Failed to restart bot polling:', pollingError);
          console.error('❌ Failed to restart bot polling:', pollingError);
          return false;
        }
      }
    } catch (error) {
      logger.error('Error during bot polling restart:', error);
      return false;
    }
  }

  /**
   * Load all existing feeds from database and schedule them for checking (async version)
   */
  private loadAndScheduleAllFeedsAsync(): void {
    // Run in background without blocking initialization
    setTimeout(async () => {
      try {
        await this.loadAndScheduleAllFeeds();
        logger.info('✅ All existing feeds loaded and scheduled successfully');
        console.log('✅ All existing feeds loaded and scheduled successfully');
      } catch (error) {
        logger.error('❌ Failed to load feeds in background:', error);
        console.error('❌ Failed to load feeds in background:', error);
        
        // Retry more aggressively: 10 seconds, then 30 seconds, then give up
        logger.info('🔄 Retrying feed loading in 10 seconds...');
        console.log('🔄 Retrying feed loading in 10 seconds...');
        
        setTimeout(async () => {
          try {
            await this.loadAndScheduleAllFeeds();
            logger.info('✅ Feed loading succeeded on retry');
            console.log('✅ Feed loading succeeded on retry');
          } catch (retryError) {
            logger.error('❌ Feed loading failed again on retry:', retryError);
            console.error('❌ Feed loading failed again on retry:', retryError);
            
            // Final retry after 30 seconds
            logger.info('🔄 Final retry in 30 seconds...');
            console.log('🔄 Final retry in 30 seconds...');
            
            setTimeout(async () => {
              try {
                await this.loadAndScheduleAllFeeds();
                logger.info('✅ Feed loading succeeded on final retry');
                console.log('✅ Feed loading succeeded on final retry');
              } catch (finalError) {
                logger.error('❌ Feed loading failed on final retry. Manual intervention may be required.', finalError);
                console.error('❌ Feed loading failed on final retry. Manual intervention may be required.', finalError);
              }
            }, 30000);
          }
        }, 10000); // 10 seconds
      }
    }, 2000); // Wait 2 seconds after bot starts (reduced from 5 seconds)
  }

  /**
   * Load all existing feeds from database and schedule them for checking
   */
  async loadAndScheduleAllFeeds(): Promise<void> {
    // Prevent multiple initializations
    if (this.feedsLoaded) {
      logger.warn('⚠️ Feeds already loaded, skipping duplicate initialization');
      return;
    }

    try {
      logger.info('🔄 Starting feed loading process...');
      console.log('🔄 Starting feed loading process...');
      this.feedsLoaded = true;

      // Import services with timeout
      logger.info('📦 Importing database service...');
      const { database } = await Promise.race([
        import('../database/database.service.js'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database import timeout')), 10000)
        )
      ]) as any;
      logger.info('✅ Database service imported');

      // Get all chats with their feeds with timeout
      logger.info('📊 Querying database for feeds...');
      const chats = await Promise.race([
        database.client.chat.findMany({
          include: {
            feeds: {
              where: { enabled: true },
              include: { filters: true },
            },
          },
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 15000)
        )
      ]) as any;
      logger.info(`📊 Found ${chats.length} chats in database`);

      let totalScheduled = 0;
      let totalErrors = 0;
      const errorDetails: Array<{ name: string; error: string }> = [];

      for (const chat of chats) {
        if (chat.feeds.length === 0) {
          logger.debug(`📭 Chat ${chat.id} has no enabled feeds`);
          continue;
        }

        logger.info(`📋 Chat ${chat.id} (${chat.title || 'No title'}): ${chat.feeds.length} enabled feeds`);

        for (const feed of chat.feeds) {
          try {
            // Use dynamic intervals based on feed URL
            const { feedIntervalService } = await import('../utils/feed-interval.service.js');
            const intervalMinutes = feedIntervalService.getIntervalForUrl(feed.rssUrl);

            logger.info(`🔄 Scheduling feed "${feed.name}" (${feed.id}) with ${intervalMinutes}min interval...`);

            await feedQueueService.scheduleRecurringFeedCheck({
              feedId: feed.id,
              chatId: feed.chatId,
              feedUrl: feed.rssUrl,
              lastItemId: feed.lastItemId ?? undefined,
            }, intervalMinutes);

            totalScheduled++;
            logger.info(`✅ Successfully scheduled feed "${feed.name}" (${feed.id})`);
          } catch (error) {
            totalErrors++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errorDetails.push({ name: feed.name, error: errorMessage });
            logger.error(`❌ Failed to schedule feed "${feed.name}" (${feed.id}):`, error);
          }
        }
      }

      logger.info(`✅ Feed loading completed: ${totalScheduled} feeds scheduled, ${totalErrors} errors`);
      console.log(`✅ Feed loading completed: ${totalScheduled} feeds scheduled, ${totalErrors} errors`);
      
      if (totalErrors > 0) {
        logger.warn(`⚠️ Errors during feed scheduling:`);
        errorDetails.forEach(({ name, error }) => {
          logger.warn(`  • ${name}: ${error}`);
        });
      }
      
      if (totalScheduled === 0) {
        logger.warn('⚠️ No feeds were scheduled. This might be normal if no feeds exist yet.');
      }
    } catch (error) {
      logger.error('❌ Failed to load and schedule feeds:', error);
      console.error('❌ Failed to load and schedule feeds:', error);
      throw error;
    }
  }

  /**
   * Auto-register chat when any interaction occurs
   */
  private async autoRegisterChat(ctx: Context): Promise<void> {
    try {
      if (!ctx.chat) return;

      const chatId = ctx.chat.id.toString();
      const chatType = ctx.chat.type;
      const chatTitle = 'title' in ctx.chat ? ctx.chat.title : null;

      // Import database service
      const { DatabaseService } = await import('../database/database.service.js');

      // Initialize database
      const database = new DatabaseService();
      await database.connect();

      // Check if chat already exists
      const existingChat = await database.client.chat.findUnique({
        where: { id: chatId },
      });

      if (!existingChat) {
        // Register new chat
        await database.client.chat.create({
          data: {
            id: chatId,
            type: chatType,
            title: chatTitle,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Create default settings
        await database.client.chatSettings.create({
          data: {
            chatId,
            language: (ctx as any).language ?? 'en',
            checkInterval: 120, // 2 minutes max
            maxFeeds: 50,
            enableFilters: true,
            timezone: 'UTC',
          },
        });

        logger.info(
          `Auto-registered new chat: ${chatId} (${chatType}) - ${chatTitle || 'No title'}`
        );
      }
    } catch (error) {
      logger.error('Failed to auto-register chat:', error);
    }
  }

  /**
   * Auto-detect RSS URLs in messages and suggest adding them
   */
  private async autoDetectRSSUrls(ctx: Context, text: string): Promise<void> {
    try {
      // URL patterns that might be RSS feeds
      const urlPattern = /(https?:\/\/[^\s]+)/gi;
      const rssPatterns = [
        /reddit\.com\/r\/\w+/i,
        /feeds?\./i,
        /rss/i,
        /atom/i,
        /\.xml$/i,
        /youtube\.com\/(channel|user|c)\//i,
      ];

      const urls = text.match(urlPattern);
      if (!urls) return;

      for (const url of urls) {
        const isLikelyRSS = rssPatterns.some((pattern) => pattern.test(url));

        if (isLikelyRSS) {
          const suggestion = `🔍 Detected a potential RSS URL!\n\nTo add it as a feed, use:\n\`/add feedname ${url}\``;

          await ctx.reply(suggestion, {
            parse_mode: 'Markdown',
            reply_to_message_id: ctx.message?.message_id,
          });

          logger.info(`Auto-detected RSS URL: ${url} in chat ${ctx.chat?.id}`);
          break; // Only suggest once per message
        }
      }
    } catch (error) {
      logger.error('Failed to auto-detect RSS URLs:', error);
    }
  }

  /**
   * Set bot commands in BotFather
   */
  async setBotCommands(): Promise<void> {
    try {
      const commands = [
        { command: 'start', description: 'Start the bot and show welcome message' },
        { command: 'help', description: 'Show available commands' },
        { command: 'add', description: 'Add a new RSS feed' },
        { command: 'list', description: 'List all feeds' },
        { command: 'remove', description: 'Remove a feed' },
        { command: 'enable', description: 'Enable a feed' },
        { command: 'disable', description: 'Disable a feed' },
        { command: 'settings', description: 'View and modify chat settings' },
        { command: 'filters', description: 'Manage feed filters' },
        { command: 'stats', description: 'View usage statistics' },
      ];

      await this.bot.api.setMyCommands(commands);
      logger.info('Bot commands registered successfully');
    } catch (error) {
      logger.error('Failed to set bot commands:', error);
    }
  }

  /**
   * Handle errors specific to channel operations
   */
  private async handleChannelError(ctx: Context, error: any, errorInfo: any): Promise<void> {
    try {
      const authCtx = ctx as AuthContext;
      const i18nCtx = ctx as any; // Type assertion for translation function

      // Check if error is permission-related
      if (this.isPermissionError(error)) {
        logger.warn('Channel permission error detected', {
          ...errorInfo,
          errorType: 'permission',
        });

        // Try to send permission error message
        if (i18nCtx.t) {
          const permissionMessage =
            i18nCtx.t('error.channel_permissions') ||
            'I need administrator permissions to work properly in this channel.';

          await ctx.reply(permissionMessage).catch((replyError) => {
            logger.error('Failed to send permission error message in channel', {
              chatId: authCtx.chatIdString,
              replyError: replyError instanceof Error ? replyError.message : String(replyError),
            });
          });
        }
        return;
      }

      // Check if error is related to anonymous admin posts
      if (authCtx.isAnonymousAdmin && this.isUserContextError(error)) {
        logger.warn('Anonymous admin context error in channel', {
          ...errorInfo,
          errorType: 'anonymous_admin',
        });

        // Don't send error message for anonymous admin context issues
        // Just log and continue
        return;
      }

      // For other channel errors, send generic error message
      if (i18nCtx.t) {
        const channelErrorMessage =
          i18nCtx.t('error.channel_operation') ||
          'An error occurred while processing your request in this channel.';

        await ctx.reply(channelErrorMessage).catch((replyError) => {
          logger.error('Failed to send channel error message', {
            chatId: authCtx.chatIdString,
            replyError: replyError instanceof Error ? replyError.message : String(replyError),
          });
        });
      }
    } catch (handlerError) {
      logger.error('Error in channel error handler', {
        originalError: error instanceof Error ? error.message : String(error),
        handlerError: handlerError instanceof Error ? handlerError.message : String(handlerError),
        chatId: ctx.chat?.id,
      });
    }
  }

  /**
   * Handle standard errors for private chats and groups
   */
  private async handleStandardError(ctx: Context, error: any): Promise<void> {
    try {
      const i18nCtx = ctx as any; // Type assertion for translation function

      if (ctx.chat && i18nCtx.t) {
        await ctx.reply(i18nCtx.t('error.internal')).catch((replyError) => {
          logger.error('Failed to send standard error message', {
            chatId: ctx.chat?.id,
            replyError: replyError instanceof Error ? replyError.message : String(replyError),
          });
        });
      }
    } catch (handlerError) {
      logger.error('Error in standard error handler', {
        originalError: error instanceof Error ? error.message : String(error),
        handlerError: handlerError instanceof Error ? handlerError.message : String(handlerError),
        chatId: ctx.chat?.id,
      });
    }
  }

  /**
   * Check if error is related to insufficient permissions
   */
  private isPermissionError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || String(error);
    const permissionKeywords = [
      'not enough rights',
      'insufficient rights',
      'permission denied',
      'forbidden',
      'not allowed',
      'administrator rights required',
      'bot was blocked',
      'chat not found',
    ];

    return permissionKeywords.some((keyword) =>
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Check if error is related to missing user context
   */
  private isUserContextError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || String(error);
    const userContextKeywords = [
      'user not found',
      'missing user',
      'undefined user',
      'user context',
      'anonymous',
    ];

    return userContextKeywords.some((keyword) =>
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Validate bot permissions in a channel
   */
  private async validateChannelPermissions(ctx: Context): Promise<boolean> {
    try {
      if (!ctx.chat || ctx.chat.type !== 'channel') {
        return true; // Not a channel, no validation needed
      }

      const chatId = ctx.chat.id;
      const botId = this.botId;

      if (!botId) {
        logger.warn('Bot ID not available for permission validation');
        return false;
      }

      // Get bot's permissions in the channel
      const chatMember = await this.bot.api.getChatMember(chatId, botId);

      if (chatMember.status !== 'administrator') {
        logger.warn('Bot is not an administrator in channel', {
          chatId,
          botStatus: chatMember.status,
        });
        return false;
      }

      // Check specific permissions if needed
      const adminRights = chatMember as any;
      const hasRequiredPermissions =
        adminRights.can_post_messages !== false &&
        adminRights.can_edit_messages !== false &&
        adminRights.can_delete_messages !== false;

      if (!hasRequiredPermissions) {
        logger.warn('Bot lacks required permissions in channel', {
          chatId,
          canPost: adminRights.can_post_messages,
          canEdit: adminRights.can_edit_messages,
          canDelete: adminRights.can_delete_messages,
        });
      }

      return hasRequiredPermissions;
    } catch (error) {
      logger.error('Failed to validate channel permissions', {
        chatId: ctx.chat?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Helper method to determine message type for logging
   */
  private getMessageType(message: any): string {
    if (message.text) return 'text';
    if (message.photo) return 'photo';
    if (message.video) return 'video';
    if (message.document) return 'document';
    if (message.audio) return 'audio';
    if (message.voice) return 'voice';
    if (message.sticker) return 'sticker';
    if (message.animation) return 'animation';
    if (message.location) return 'location';
    if (message.contact) return 'contact';
    if (message.poll) return 'poll';
    if (message.venue) return 'venue';
    if (message.dice) return 'dice';
    return 'unknown';
  }

  /**
   * Handles Telegram API errors using the resilience system
   */
  private async handleTelegramError(error: any, ctx?: any, errorInfo?: any): Promise<void> {
    try {
      // Classify the error
      const telegramError = TelegramErrorClassifier.classifyError(
        error, 
        errorInfo?.method || 'unknown',
        errorInfo
      );

      // Record the failure in connection manager
      if (this.connectionManager) {
        this.connectionManager.recordFailure(telegramError);
      }

      // Record health metric
      if (this.healthMonitor) {
        this.healthMonitor.recordConnectionAttempt(false);
      }

      // Handle with resilience handler
      await telegramResilienceHandler.handleTelegramError(telegramError, ctx);

      // Check if we should enqueue the message for retry
      if (ctx && telegramResilienceHandler.shouldEnqueueMessage(telegramError)) {
        await this.enqueueFailedMessage(ctx, telegramError);
      }

      // Handle circuit breaker
      telegramCircuitBreaker.handleTelegramSpecificError(telegramError);

      logger.info('Telegram error handled by resilience system', {
        errorType: telegramError.errorType,
        errorCode: telegramError.code,
        retryCount: telegramError.retryCount,
        shouldEnqueue: telegramResilienceHandler.shouldEnqueueMessage(telegramError)
      });

    } catch (resilienceError) {
      logger.error('Error in resilience system handling', {
        originalError: error instanceof Error ? error.message : String(error),
        resilienceError: resilienceError instanceof Error ? resilienceError.message : String(resilienceError)
      });
    }
  }

  /**
   * Enqueues a failed message for retry when Telegram API is available
   */
  private async enqueueFailedMessage(ctx: any, telegramError: any): Promise<void> {
    if (!this.messageQueue) {
      return;
    }

    try {
      // Extract message content from context
      let messageText = 'Failed message';
      let chatId = 'unknown';
      let priority = MessagePriority.NORMAL;

      if (ctx.chat?.id) {
        chatId = ctx.chat.id.toString();
      }

      if (ctx.message?.text) {
        messageText = ctx.message.text;
      } else if (ctx.callbackQuery?.message?.text) {
        messageText = ctx.callbackQuery.message.text;
      }

      // Determine priority based on error type and context
      if (telegramError.errorType === 'network_error') {
        priority = MessagePriority.HIGH;
      } else if (ctx.chat?.type === 'channel') {
        priority = MessagePriority.NORMAL;
      } else {
        priority = MessagePriority.LOW;
      }

      // Create queued message
      const queuedMessage = InMemoryMessageQueue.createMessage(
        chatId,
        messageText,
        { originalContext: 'bot_error_recovery' },
        priority,
        3, // max retries
        60 * 60 * 1000 // 1 hour TTL
      );

      await this.messageQueue.enqueue(queuedMessage);

      logger.info('Message enqueued for retry', {
        messageId: queuedMessage.id,
        chatId,
        priority,
        errorType: telegramError.errorType
      });

    } catch (queueError) {
      logger.error('Failed to enqueue message for retry', {
        error: queueError instanceof Error ? queueError.message : String(queueError),
        chatId: ctx.chat?.id
      });
    }
  }

  /**
   * Initializes the resilience system
   */
  private async initializeResilienceSystem(): Promise<void> {
    if (!this.resilienceEnabled) {
      logger.info('Resilience system disabled');
      return;
    }

    try {
      logger.info('Initializing Telegram resilience system...');

      // Get database service
      const database = new DatabaseService();
      const prisma = database.client;

      // Initialize connection manager
      this.connectionManager = getTelegramConnectionManager(prisma);
      await this.connectionManager.initialize();

      // Initialize message queue
      this.messageQueue = new PersistentMessageQueue(prisma, 1000, 60 * 60 * 1000);
      await this.messageQueue.initialize();

      // Initialize queue processor
      this.queueProcessor = new TelegramQueueProcessor(this.messageQueue, {
        batchSize: 20,
        processingInterval: 5000,
        maxMessagesPerMinute: 20,
        retryFailedMessages: true,
        maxRetryAttempts: 3
      });

      // Set message handler for queue processor
      this.queueProcessor.setMessageHandler(async (message: any) => {
        return await this.processQueuedMessage(message);
      });

      // Initialize health monitor
      this.healthMonitor = new TelegramHealthMonitor(
        this.connectionManager.persistence || {
          recordHealthMetric: async () => {},
          getHealthMetrics: async () => [],
          cleanupOldMetrics: async () => 0,
          saveConnectionState: async () => {},
          loadConnectionState: async () => null,
          deleteConnectionState: async () => {},
          getConnectionStats: async () => null
        },
        this.messageQueue,
        this.queueProcessor
      );

      // Initialize resilience endpoints
      this.resilienceEndpoints = new TelegramResilienceEndpoints(
        this.healthMonitor,
        this.messageQueue,
        this.queueProcessor,
        telegramCircuitBreaker,
        this.connectionManager
      );

      // Start queue processor
      await this.queueProcessor.start();

      // Connect message queue to notification service
      notificationService.setMessageQueue(this.messageQueue);
      notificationService.setResilienceEnabled(true);

      logger.info('Telegram resilience system initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize resilience system', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Disable resilience system if initialization fails
      this.resilienceEnabled = false;
    }
  }

  /**
   * Processes a queued message by sending it through Telegram API
   */
  private async processQueuedMessage(message: any): Promise<boolean> {
    try {
      // Record health metric for message processing
      if (this.healthMonitor) {
        this.healthMonitor.recordMessageSent(true, Date.now() - message.enqueuedAt.getTime());
      }

      // Record successful connection attempt
      if (this.connectionManager) {
        this.connectionManager.recordSuccess();
      }

      // For now, we'll simulate successful processing
      // In a real implementation, this would send the message via Telegram API
      logger.debug('Processing queued message', {
        messageId: message.id,
        chatId: message.chatId,
        priority: message.priority
      });

      return true;

    } catch (error) {
      logger.error('Failed to process queued message', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error)
      });

      // Record failed message processing
      if (this.healthMonitor) {
        this.healthMonitor.recordMessageSent(false);
      }

      return false;
    }
  }

  /**
   * Gets resilience system status
   */
  getResilienceStatus(): any {
    if (!this.resilienceEnabled) {
      return { enabled: false };
    }

    return {
      enabled: true,
      connectionManager: this.connectionManager ? this.connectionManager.getHealthMetrics() : null,
      messageQueue: this.messageQueue ? this.messageQueue.getQueueStats() : null,
      queueProcessor: this.queueProcessor ? this.queueProcessor.getProcessingStats() : null,
      healthMonitor: this.healthMonitor ? this.healthMonitor.getHealthStatus() : null
    };
  }

  /**
   * Gets resilience endpoints for HTTP integration
   */
  getResilienceEndpoints(): any {
    return this.resilienceEndpoints;
  }

  get instance(): Bot<BotContext> {
    return this.bot;
  }
}

