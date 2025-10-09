import type { Context, NextFunction } from 'grammy';
import { logger } from '../../utils/logger/logger.service.js';
import type { MentionAwareContext } from '../types/index.js';

export interface AuthContext extends Context, MentionAwareContext {
  chatIdString: string;
  userId: number;
  isGroup: boolean;
  isPrivate: boolean;
  isChannel: boolean;
  isAnonymousAdmin?: boolean; // New field for channel admin posts
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
      const chatType = ctx.chat?.type;

      if (!chatId) {
        logger.warn('Missing chat information in update', {
          chatId,
          userId,
          updateId: ctx.update.update_id,
          chatType,
        });
        return;
      }

      // Determine chat type
      const isPrivate = chatType === 'private';
      const isGroup = chatType === 'group' || chatType === 'supergroup';
      const isChannel = chatType === 'channel';

      // Handle anonymous admin posts in channels
      const isAnonymousAdmin = isChannel && !userId;

      // For channels, userId might be undefined (anonymous admin posts)
      // We'll use a default userId for channels to allow processing
      const effectiveUserId = userId || (isChannel ? 0 : undefined);

      // Only block processing if we're missing user info in non-channel contexts
      // Channels can have anonymous admin posts which should still be processed
      if (!effectiveUserId && !isChannel) {
        logger.warn('Missing user information in non-channel update', {
          chatId,
          userId,
          chatType,
          updateId: ctx.update.update_id,
        });
        return;
      }

      // Extend context with auth information
      Object.assign(ctx, {
        chatIdString: chatId,
        userId: effectiveUserId,
        isGroup,
        isPrivate,
        isChannel,
        isAnonymousAdmin,
      });

      // Enhanced logging for channel interactions
      if (isChannel) {
        logger.info('Channel interaction processed', {
          chatId,
          userId: effectiveUserId,
          isAnonymousAdmin,
          updateId: ctx.update.update_id,
          messageType: ctx.message ? 'message' : ctx.callbackQuery ? 'callback' : 'other',
          hasText: !!ctx.message?.text,
          textPreview: ctx.message?.text?.substring(0, 50),
        });
      } else {
        logger.debug('Auth middleware processed', {
          chatId,
          userId: effectiveUserId,
          chatType,
          isPrivate,
          isGroup,
          isChannel,
        });
      }

      await next();
    } catch (error) {
      logger.error('Auth middleware error:', error, {
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        chatType: ctx.chat?.type,
        updateId: ctx.update.update_id,
      });
      throw error;
    }
  };
}
