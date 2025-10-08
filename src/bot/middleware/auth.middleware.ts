import type { Context, NextFunction } from 'grammy';
import { logger } from '../../utils/logger/logger.service.js';

export interface AuthContext extends Context {
  chatIdString: string;
  userId: number;
  isGroup: boolean;
  isPrivate: boolean;
  isChannel: boolean;
}

/**
 * Authentication middleware that extracts and validates chat/user information
 */
export function authMiddleware() {
  return async (ctx: Context, next: NextFunction) => {
    try {
      // Extract chat and user information
      const chatId = ctx.chat?.id?.toString();
      const userId = ctx.from?.id;

      if (!chatId || !userId) {
        logger.warn('Missing chat or user information in update', {
          chatId,
          userId,
          updateId: ctx.update.update_id,
        });
        return;
      }

      // Determine chat type
      const chatType = ctx.chat?.type;
      const isPrivate = chatType === 'private';
      const isGroup = chatType === 'group' || chatType === 'supergroup';
      const isChannel = chatType === 'channel';

      // Extend context with auth information
      Object.assign(ctx, {
        chatIdString: chatId,
        userId,
        isGroup,
        isPrivate,
        isChannel,
      });

      logger.debug('Auth middleware processed', {
        chatId,
        userId,
        chatType,
        isPrivate,
        isGroup,
        isChannel,
      });

      await next();
    } catch (error) {
      logger.error('Auth middleware error:', error);
      throw error;
    }
  };
}
