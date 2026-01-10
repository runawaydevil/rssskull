import type { MessageEntity } from 'grammy/types';
import type {
  MentionContext,
  MentionProcessorConfig,
  ProcessedMention,
} from '../bot/types/index.js';
import { logger } from './logger/logger.service.js';

/**
 * Utility class for processing bot mentions in Telegram messages
 */
export class MentionProcessor {
  private config: MentionProcessorConfig;

  constructor(config: MentionProcessorConfig) {
    this.config = config;
  }

  /**
   * Check if the bot is mentioned in the message entities
   */
  isBotMentioned(entities: MessageEntity[]): boolean {
    if (!entities || entities.length === 0) {
      return false;
    }

    return entities.some((entity) => {
      if (entity.type === 'mention') {
        // For @username mentions, we need to check the text
        return true; // Will be validated in extractMentionCommand
      }

      if (entity.type === 'text_mention' && 'user' in entity) {
        // For text mentions, check the user ID
        return entity.user?.id === this.config.botId;
      }

      return false;
    });
  }

  /**
   * Extract mention command and context from message text and entities
   */
  extractMentionCommand(text: string, entities: MessageEntity[]): MentionContext {
    const mentionContext: MentionContext = {
      isMentioned: false,
    };

    if (!text || !entities || entities.length === 0) {
      return mentionContext;
    }

    try {
      // Find bot mentions in entities
      const botMentions = this.findBotMentions(text, entities);

      if (botMentions.length === 0) {
        return mentionContext;
      }

      // Process the first bot mention found
      const mention = botMentions[0];
      if (mention) {
        mentionContext.isMentioned = true;
        mentionContext.mentionText = mention.text;

        // Extract command and arguments from the mention text
        const commandInfo = this.parseCommandFromMention(mention.text);
        if (commandInfo) {
          mentionContext.commandFromMention = commandInfo.command;
          mentionContext.argsFromMention = commandInfo.args;
        }

        logger.debug('Mention processed successfully', {
          mentionText: mention.text,
          command: mentionContext.commandFromMention,
          argsCount: mentionContext.argsFromMention?.length || 0,
        });
      }

      return mentionContext;
    } catch (error) {
      logger.error('Error processing mention', {
        error: error instanceof Error ? error.message : String(error),
        textLength: text.length,
        entitiesCount: entities.length,
      });

      return mentionContext;
    }
  }

  /**
   * Find all bot mentions in the message entities
   */
  private findBotMentions(text: string, entities: MessageEntity[]): ProcessedMention[] {
    const mentions: ProcessedMention[] = [];

    for (const entity of entities) {
      if (entity.type !== 'mention' && entity.type !== 'text_mention') {
        continue;
      }

      const mentionText = text.substring(entity.offset, entity.offset + entity.length);

      if (entity.type === 'mention') {
        // Handle @username mentions
        const username = mentionText.replace('@', '');
        const comparison =
          this.config.caseSensitive === false
            ? username.toLowerCase() === this.config.botUsername.toLowerCase()
            : username === this.config.botUsername;

        if (comparison) {
          mentions.push({
            type: 'mention',
            offset: entity.offset,
            length: entity.length,
            username,
            text: this.extractFullMentionText(text, entity.offset),
          });
        }
      } else if (entity.type === 'text_mention' && 'user' in entity) {
        // Handle text mentions (user ID based)
        if (entity.user?.id === this.config.botId) {
          mentions.push({
            type: 'text_mention',
            offset: entity.offset,
            length: entity.length,
            userId: entity.user.id,
            text: this.extractFullMentionText(text, entity.offset),
          });
        }
      }
    }

    return mentions;
  }

  /**
   * Extract the full mention text including any following command/text
   */
  private extractFullMentionText(text: string, mentionOffset: number): string {
    // Find the end of the current line or message
    const fromMention = text.substring(mentionOffset);
    const lineEnd = fromMention.indexOf('\n');

    if (lineEnd === -1) {
      // No newline found, take the rest of the message
      return fromMention.trim();
    }
    // Take until the newline
    return fromMention.substring(0, lineEnd).trim();
  }

  /**
   * Parse command and arguments from mention text
   */
  private parseCommandFromMention(mentionText: string): { command: string; args: string[] } | null {
    // Remove the mention part and get the remaining text
    const parts = mentionText.split(/\s+/);

    if (parts.length < 2) {
      // No command after mention
      return null;
    }

    // Skip the mention part (first element) and look for command
    const potentialCommand = parts[1];

    if (!potentialCommand || !potentialCommand.startsWith('/')) {
      // Not a command, just regular text after mention
      return null;
    }

    // Extract command name (remove the /)
    const command = potentialCommand.substring(1).toLowerCase();

    // Extract arguments (everything after the command)
    const args = parts.slice(2);

    return { command, args };
  }

  /**
   * Create a mention processor instance with bot configuration
   */
  static create(botUsername: string, botId: number, caseSensitive = false): MentionProcessor {
    return new MentionProcessor({
      botUsername,
      botId,
      caseSensitive,
    });
  }
}

/**
 * Utility functions for mention processing
 */
export const MentionUtils = {
  /**
   * Check if a message contains any mentions
   */
  hasMentions(entities?: MessageEntity[]): boolean {
    if (!entities) return false;
    return entities.some((entity) => entity.type === 'mention' || entity.type === 'text_mention');
  },

  /**
   * Extract all mention entities from a message
   */
  extractMentionEntities(entities?: MessageEntity[]): MessageEntity[] {
    if (!entities) return [];
    return entities.filter((entity) => entity.type === 'mention' || entity.type === 'text_mention');
  },

  /**
   * Get mention text from message using entity information
   */
  getMentionText(text: string, entity: MessageEntity): string {
    return text.substring(entity.offset, entity.offset + entity.length);
  },
};
