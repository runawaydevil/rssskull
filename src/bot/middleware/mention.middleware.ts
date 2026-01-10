import type { Context, NextFunction } from 'grammy';
import { logger } from '../../utils/logger/logger.service.js';
import { MentionProcessor } from '../../utils/mention.utils.js';
import type { AuthContext } from './auth.middleware.js';

/**
 * Mention processing middleware that detects bot mentions and extracts commands
 */
export function mentionMiddleware(botUsername: string, botId: number) {
  const mentionProcessor = MentionProcessor.create(botUsername, botId, false);

  return async (ctx: Context, next: NextFunction) => {
    try {
      // Only process text messages
      if (!ctx.message?.text || !ctx.message?.entities) {
        logger.debug('Mention middleware: No text or entities', {
          hasText: !!ctx.message?.text,
          hasEntities: !!ctx.message?.entities,
          chatType: ctx.chat?.type,
        });
        await next();
        return;
      }

      const text = ctx.message.text;
      const entities = ctx.message.entities;

      logger.debug('Mention middleware: Processing text message', {
        text: text.substring(0, 50),
        entitiesCount: entities.length,
        chatType: ctx.chat?.type,
      });

      // Process mentions and add to context
      const mentionContext = mentionProcessor.extractMentionCommand(text, entities);

      // Add mention context to the context object
      Object.assign(ctx, {
        mentionContext,
      });

      // Log mention processing for debugging
      if (mentionContext.isMentioned) {
        const authCtx = ctx as AuthContext;
        logger.info('Bot mentioned in message', {
          chatId: authCtx.chatIdString,
          userId: authCtx.userId,
          chatType: ctx.chat?.type,
          mentionText: mentionContext.mentionText,
          extractedCommand: mentionContext.commandFromMention,
          argsCount: mentionContext.argsFromMention?.length || 0,
        });
      }

      await next();
    } catch (error) {
      logger.error('Mention middleware error:', error, {
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        updateId: ctx.update.update_id,
      });

      // Continue processing even if mention processing fails
      await next();
    }
  };
}
