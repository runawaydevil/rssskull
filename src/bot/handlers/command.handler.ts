import type { Context } from 'grammy';
import { z } from 'zod';
import { logger } from '../../utils/logger/logger.service.js';

export interface CommandContext extends Context {
  chatIdString: string;
  userId: number;
  isGroup: boolean;
  isPrivate: boolean;
  isChannel: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  language: 'en' | 'pt';
}

export interface CommandHandler {
  name: string;
  aliases: string[];
  description: string;
  schema?: z.ZodSchema;
  handler: (ctx: CommandContext, args: string[]) => Promise<void>;
}

/**
 * Base class for command validation and error handling
 */
export abstract class BaseCommandHandler {
  protected async validateAndExecute(
    ctx: CommandContext,
    args: string[],
    schema?: z.ZodSchema,
    handler?: (ctx: CommandContext, validatedArgs: any) => Promise<void>
  ): Promise<void> {
    try {
      // Validate arguments if schema is provided
      let validatedArgs = args;
      if (schema) {
        const result = schema.safeParse(args);
        if (!result.success) {
          await ctx.reply(ctx.t('error.invalid_format'));
          logger.debug('Command validation failed', {
            chatId: ctx.chatIdString,
            command: ctx.message?.text,
            errors: result.error.errors,
          });
          return;
        }
        validatedArgs = result.data;
      }

      // Execute handler if provided, otherwise call the abstract execute method
      if (handler) {
        await handler(ctx, validatedArgs);
      } else {
        await this.execute(ctx, validatedArgs);
      }
    } catch (error) {
      logger.error('Command execution error', {
        chatId: ctx.chatIdString,
        userId: ctx.userId,
        command: ctx.message?.text,
        error: error instanceof Error ? error.message : String(error),
      });

      await ctx.reply(ctx.t('error.internal'));
    }
  }

  protected abstract execute(ctx: CommandContext, args: any): Promise<void>;
}

/**
 * Command router that manages command registration and execution
 */
export class CommandRouter {
  private commands = new Map<string, CommandHandler>();
  private aliases = new Map<string, string>();

  /**
   * Register a command handler
   */
  register(handler: CommandHandler): void {
    // Register main command name
    this.commands.set(handler.name, handler);

    // Register aliases
    for (const alias of handler.aliases) {
      this.aliases.set(alias, handler.name);
    }

    logger.debug('Command registered', {
      name: handler.name,
      aliases: handler.aliases,
    });
  }

  /**
   * Execute a command by name
   */
  async execute(ctx: CommandContext, commandName: string, args: string[]): Promise<boolean> {
    // Resolve alias to main command name
    const resolvedName = this.aliases.get(commandName) || commandName;
    const handler = this.commands.get(resolvedName);

    if (!handler) {
      return false; // Command not found
    }

    logger.debug('Executing command', {
      chatId: ctx.chatIdString,
      userId: ctx.userId,
      command: commandName,
      resolvedName,
      argsCount: args.length,
    });

    await handler.handler(ctx, args);
    return true;
  }

  /**
   * Get all registered commands
   */
  getCommands(): CommandHandler[] {
    return Array.from(this.commands.values());
  }

  /**
   * Check if a command exists
   */
  hasCommand(commandName: string): boolean {
    const resolvedName = this.aliases.get(commandName) || commandName;
    return this.commands.has(resolvedName);
  }
}

/**
 * Parse command text into command name and arguments
 */
export function parseCommand(text: string): { command: string; args: string[] } {
  const parts = text.trim().split(/\s+/);
  const command = (parts[0] || '').replace('/', '').toLowerCase();
  const args = parts.slice(1);

  return { command, args };
}

/**
 * Validation schemas for common command patterns
 */
export const CommandSchemas = {
  // No arguments required
  noArgs: z.array(z.string()).length(0),

  // Single string argument (required)
  singleString: z.array(z.string()).length(1),

  // Two string arguments (name and URL for feeds)
  nameAndUrl: z
    .array(z.string())
    .length(2)
    .refine(
      (args) => {
        const [name, url] = args;
        // Basic name validation
        if (!name || name.length < 1 || name.length > 50) return false;

        // Basic URL validation
        if (!url) return false;
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid name or URL format' }
    ),

  // Optional single string argument
  optionalString: z.array(z.string()).max(1),

  // Optional multiple arguments
  optionalArgs: z.array(z.string()),
};
