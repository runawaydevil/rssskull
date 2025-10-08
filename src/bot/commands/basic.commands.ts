import {
  BaseCommandHandler,
  type CommandContext,
  type CommandHandler,
  CommandSchemas,
} from '../handlers/command.handler.js';

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
    const welcomeMessage = `${ctx.t('welcome.title')}\n\n${ctx.t('welcome.help')}`;
    await ctx.reply(welcomeMessage);
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
