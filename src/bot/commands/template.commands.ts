import { TemplateService } from '../../services/template.service.js';
import { logger } from '../../utils/logger/logger.service.js';
import {
  BaseCommandHandler,
  type CommandContext,
  type CommandHandler,
  CommandSchemas,
} from '../handlers/command.handler.js';

/**
 * Template command handler for template management and preview
 */
export class TemplateCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new TemplateCommand();
    return {
      name: 'template',
      aliases: [],
      description: 'Template management and preview',
      schema: CommandSchemas.optionalArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        await ctx.reply(ctx.t('template.help'), { parse_mode: 'Markdown' });
        return;
      }

      const [action, ...params] = args;

      if (!action) {
        await ctx.reply(ctx.t('template.help'), { parse_mode: 'Markdown' });
        return;
      }

      switch (action.toLowerCase()) {
        case 'preview':
          await this.previewTemplate(ctx, params);
          break;

        case 'examples':
        case 'exemplos':
          await this.showExamples(ctx);
          break;

        case 'variables':
        case 'variaveis':
          await this.showVariables(ctx);
          break;

        default:
          await ctx.reply(ctx.t('template.help'), { parse_mode: 'Markdown' });
          break;
      }
    } catch (error) {
      logger.error('Template command error', { error, chatId: ctx.chat?.id });
      await ctx.reply(ctx.t('error.internal'));
    }
  }

  private async previewTemplate(ctx: CommandContext, params: string[]): Promise<void> {
    if (params.length === 0) {
      await ctx.reply(ctx.t('template.help'), { parse_mode: 'Markdown' });
      return;
    }

    const template = params.join(' ');

    try {
      // Validate template first
      const validationErrors = TemplateService.validateTemplate(template);
      if (validationErrors.length > 0) {
        const errorMessage = validationErrors.map((err) => err.message).join('\n');
        await ctx.reply(`❌ Template validation failed:\n${errorMessage}`);
        return;
      }

      // Generate preview
      const preview = TemplateService.previewTemplate(template);

      const message = [
        ctx.t('template.preview_title'),
        '',
        ctx.t('template.preview_result', { result: preview }),
      ].join('\n');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Template preview error', { error, template });
      await ctx.reply(ctx.t('error.internal'));
    }
  }

  private async showExamples(ctx: CommandContext): Promise<void> {
    try {
      const examples = TemplateService.getTemplateExamples();

      const message = [
        ctx.t('template.examples_title'),
        '',
        ...examples.map((example) =>
          ctx.t('template.example_item', {
            name: example.name,
            description: example.description,
            template: example.template,
          })
        ),
      ].join('\n\n');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Template examples error', { error });
      await ctx.reply(ctx.t('error.internal'));
    }
  }

  private async showVariables(ctx: CommandContext): Promise<void> {
    try {
      const variables = TemplateService.getAvailableVariables();

      const message = [
        ctx.t('template.variables_title'),
        '',
        ...variables.map((variable) =>
          ctx.t('template.variable_item', {
            name: variable.name,
            description: variable.description,
          })
        ),
      ].join('\n');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Template variables error', { error });
      await ctx.reply(ctx.t('error.internal'));
    }
  }
}
