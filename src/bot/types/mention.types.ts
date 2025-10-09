/**
 * Context information extracted from bot mentions in messages
 */
export interface MentionContext {
  /** Whether the bot was mentioned in the message */
  isMentioned: boolean;
  /** The full text of the mention (e.g., "@botname /help") */
  mentionText?: string;
  /** Command extracted from mention text (e.g., "/help") */
  commandFromMention?: string;
  /** Arguments extracted from mention text */
  argsFromMention?: string[];
}

/**
 * Extended context interface that includes mention processing capabilities
 */
export interface MentionAwareContext {
  /** Mention context information */
  mentionContext?: MentionContext;
}

/**
 * Telegram message entity types relevant to mention processing
 */
export type MentionEntityType = 'mention' | 'text_mention';

/**
 * Processed mention information from message entities
 */
export interface ProcessedMention {
  /** Type of mention entity */
  type: MentionEntityType;
  /** Offset in the message text */
  offset: number;
  /** Length of the mention */
  length: number;
  /** Username for @username mentions */
  username?: string;
  /** User ID for text mentions */
  userId?: number;
  /** The actual mention text from the message */
  text: string;
}

/**
 * Configuration for mention processing
 */
export interface MentionProcessorConfig {
  /** Bot's username (without @) */
  botUsername: string;
  /** Bot's user ID */
  botId: number;
  /** Whether to process mentions case-insensitively */
  caseSensitive?: boolean;
}
