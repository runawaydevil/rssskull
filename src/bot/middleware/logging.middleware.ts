import type { Context, NextFunction } from 'grammy';
import { logger } from '../../utils/logger/logger.service.js';

/**
 * Logging middleware that tracks bot interactions and performance
 */
export function loggingMiddleware() {
  return async (ctx: Context, next: NextFunction) => {
    const start = Date.now();
    const updateId = ctx.update.update_id;
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    const messageText = ctx.message?.text || ctx.callbackQuery?.data;

    // Log incoming update
    logger.debug('Incoming update', {
      updateId,
      chatId,
      userId,
      messageText: messageText?.substring(0, 100), // Truncate long messages
      updateType: getUpdateType(ctx),
    });

    try {
      await next();

      const duration = Date.now() - start;

      // Log successful processing
      logger.debug('Update processed successfully', {
        updateId,
        chatId,
        userId,
        duration,
      });

      // Log performance warning for slow operations
      if (duration > 1000) {
        logger.warn('Slow update processing detected', {
          updateId,
          chatId,
          duration,
        });
      }
    } catch (error) {
      const duration = Date.now() - start;

      // Log error with context
      logger.error('Update processing failed', {
        updateId,
        chatId,
        userId,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  };
}

/**
 * Determine the type of update for logging purposes
 */
function getUpdateType(ctx: Context): string {
  if (ctx.message) {
    if (ctx.message.text?.startsWith('/')) return 'command';
    if (ctx.message.text) return 'text_message';
    if (ctx.message.document) return 'document';
    if (ctx.message.photo) return 'photo';
    return 'message';
  }

  if (ctx.callbackQuery) return 'callback_query';
  if (ctx.inlineQuery) return 'inline_query';
  if (ctx.editedMessage) return 'edited_message';

  return 'unknown';
}
