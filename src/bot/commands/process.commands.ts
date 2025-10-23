import { database } from '../../database/database.service.js';
import { feedQueueService } from '../../jobs/index.js';
import { feedIntervalService } from '../../utils/feed-interval.service.js';
import {
  BaseCommandHandler,
  type CommandContext,
  type CommandHandler,
  CommandSchemas,
} from '../handlers/command.handler.js';
import { logger } from '../../utils/logger/logger.service.js';

/**
 * Secret command to reset database (admin only)
 */
export class ResetDatabaseCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new ResetDatabaseCommand();
    return {
      name: 'resetdb',
      aliases: ['resetdatabase'],
      description: 'Reset database (admin only)',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    try {
      // Check if user is admin (you can customize this logic)
      const isAdmin = ctx.from?.id === 123456789; // Replace with your Telegram user ID
      
      if (!isAdmin) {
        await ctx.reply('❌ **Acesso Negado**\n\nApenas administradores podem usar este comando.');
        return;
      }

      await ctx.reply('⚠️ **ATENÇÃO: Reset do Banco de Dados**\n\n' +
        'Esta ação irá:\n' +
        '• Apagar TODOS os feeds\n' +
        '• Apagar TODAS as configurações\n' +
        '• Apagar TODAS as estatísticas\n\n' +
        'Digite `/confirmreset` para confirmar ou `/cancelreset` para cancelar.');

      // Store confirmation state (you might want to use Redis for this)
      logger.warn(`Database reset requested by admin user ${ctx.from?.id} in chat ${ctx.chatIdString}`);

    } catch (error) {
      logger.error('Failed to initiate database reset', { error, chatId: ctx.chatIdString });
      await ctx.reply('❌ Erro ao iniciar reset do banco de dados.');
    }
  }
}

/**
 * Confirmation command for database reset
 */
export class ConfirmResetCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new ConfirmResetCommand();
    return {
      name: 'confirmreset',
      aliases: [],
      description: 'Confirm database reset',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    try {
      // Check if user is admin
      const isAdmin = ctx.from?.id === 123456789; // Replace with your Telegram user ID
      
      if (!isAdmin) {
        await ctx.reply('❌ **Acesso Negado**\n\nApenas administradores podem usar este comando.');
        return;
      }

      await ctx.reply('🔄 **Resetando banco de dados...**\n\n⏳ Aguarde, isso pode levar alguns segundos...');

      // Reset database
      await database.client.feed.deleteMany({});
      await database.client.chatSettings.deleteMany({});
      await database.client.feedFilter.deleteMany({});
      await database.client.statistic.deleteMany({});
      await database.client.chat.deleteMany({});

      logger.info(`Database reset completed by admin user ${ctx.from?.id}`);

      await ctx.reply('✅ **Banco de dados resetado com sucesso!**\n\n' +
        'Todos os dados foram apagados:\n' +
        '• Feeds removidos\n' +
        '• Configurações resetadas\n' +
        '• Estatísticas apagadas\n\n' +
        'O bot está pronto para uso novamente.');

    } catch (error) {
      logger.error('Failed to reset database', { error, chatId: ctx.chatIdString });
      await ctx.reply('❌ Erro ao resetar banco de dados.');
    }
  }
}

/**
 * Cancel database reset command
 */
export class CancelResetCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new CancelResetCommand();
    return {
      name: 'cancelreset',
      aliases: [],
      description: 'Cancel database reset',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    await ctx.reply('✅ **Reset cancelado**\n\nNenhuma alteração foi feita no banco de dados.');
  }
}

/**
 * Secret command to process feeds immediately
 * This command is not listed in help and is for admin/debug purposes
 */
export class ProcessFeedsCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new ProcessFeedsCommand();
    return {
      name: 'processar',
      aliases: [],
      description: 'Process all feeds immediately (secret command)',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    try {
      const processingMessage = await ctx.reply('🔄 **Processando feeds perdidos...**\n\n⏳ Verificando itens que o bot perdeu desde que ficou online...');

      // Get all enabled feeds for this chat
      const feeds = await database.client.feed.findMany({
        where: {
          chatId: ctx.chatIdString,
          enabled: true,
        },
        include: {
          filters: true,
        },
      });

      if (feeds.length === 0) {
        await ctx.reply('❌ **Nenhum feed encontrado**\n\nNão há feeds habilitados neste chat.');
        return;
      }

      let processedCount = 0;
      let errorCount = 0;
      let totalNewItems = 0;
      const feedResults: Array<{name: string, newItems: number, error?: string}> = [];

      // Process each feed immediately and wait for results
      for (const feed of feeds) {
        try {
          logger.info(`Processing feed immediately: ${feed.name} (${feed.id})`);
          
          // Get current lastItemId to compare later
          const originalLastItemId = feed.lastItemId;
          
          // Schedule immediate feed check (no delay)
          await feedQueueService.scheduleFeedCheck({
            feedId: feed.id,
            chatId: feed.chatId,
            feedUrl: feed.rssUrl,
            lastItemId: feed.lastItemId ?? undefined,
            failureCount: 0,
            forceProcessAll: true, // Always force process to catch missed items
          }, 0); // 0 delay = immediate processing

          // Wait a bit for processing to complete
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Check if feed was updated (new items found)
          const updatedFeed = await database.client.feed.findUnique({
            where: { id: feed.id },
            select: { lastItemId: true }
          });

          const newItemsCount = updatedFeed?.lastItemId !== originalLastItemId ? 1 : 0;
          totalNewItems += newItemsCount;
          
          feedResults.push({
            name: feed.name,
            newItems: newItemsCount
          });

          processedCount++;
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to process feed ${feed.name}:`, error);
          
          feedResults.push({
            name: feed.name,
            newItems: 0,
            error: errorMessage
          });
        }
      }

      // Update the processing message with results
      let resultMessage = `✅ **Processamento Concluído!**\n\n`;
      resultMessage += `📊 **Resumo:**\n`;
      resultMessage += `• Feeds processados: ${processedCount}/${feeds.length}\n`;
      resultMessage += `• Novos itens encontrados: ${totalNewItems}\n`;
      resultMessage += `• Erros: ${errorCount}\n\n`;

      if (totalNewItems > 0) {
        resultMessage += `🎉 **${totalNewItems} novo(s) item(ns) encontrado(s)!**\n\n`;
        resultMessage += `📋 **Detalhes por feed:**\n`;
        
        feedResults.forEach(result => {
          if (result.newItems > 0) {
            resultMessage += `• ✅ **${result.name}**: ${result.newItems} novo(s)\n`;
          } else if (result.error) {
            resultMessage += `• ❌ **${result.name}**: Erro\n`;
          } else {
            resultMessage += `• 📭 **${result.name}**: Nenhum novo\n`;
          }
        });
        
        resultMessage += `\n💡 **Nota:** Apenas itens publicados desde que o bot ficou online foram processados.`;
      } else if (errorCount > 0) {
        resultMessage += `⚠️ **Alguns feeds tiveram erros**\n\n`;
        resultMessage += `📋 **Detalhes:**\n`;
        
        feedResults.forEach(result => {
          if (result.error) {
            resultMessage += `• ❌ **${result.name}**: ${result.error}\n`;
          } else {
            resultMessage += `• 📭 **${result.name}**: Nenhum novo\n`;
          }
        });
        
        resultMessage += `\n💡 Verifique os logs para mais detalhes.`;
      } else {
        resultMessage += `📭 **Nenhum novo item encontrado**\n\n`;
        resultMessage += `📋 **Status dos feeds:**\n`;
        
        feedResults.forEach(result => {
          resultMessage += `• 📭 **${result.name}**: Atualizado\n`;
        });
        
        resultMessage += `\n💡 Todos os feeds estão atualizados. Tente novamente mais tarde.`;
      }

      // Edit the original message with results
      try {
        await ctx.api.editMessageText(
          ctx.chatId!,
          processingMessage.message_id,
          resultMessage,
          { parse_mode: 'Markdown' }
        );
      } catch (editError) {
        // If edit fails, send new message
        await ctx.reply(resultMessage, { parse_mode: 'Markdown' });
      }

      logger.info(`Manual feed processing completed for chat ${ctx.chatIdString}: ${processedCount}/${feeds.length} feeds processed, ${totalNewItems} new items found`);
    } catch (error) {
      logger.error('Failed to process feeds manually:', error);
      await ctx.reply('❌ **Erro no processamento**\n\nFalha ao processar os feeds. Tente novamente mais tarde.');
    }
  }
}

/**
 * Secret command to reset lastItemId of a specific feed
 */
export class ResetFeedCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new ResetFeedCommand();
    return {
      name: 'resetfeed',
      aliases: [],
      description: 'Reset lastItemId of a specific feed',
      schema: CommandSchemas.singleString,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: [string]): Promise<void> {
    const [feedName] = args;

    try {
      await ctx.reply(`🔄 **Resetando lastItemId do feed "${feedName}"...**\n\n⏳ Aguarde...`);

      // Find the specific feed
      const feed = await database.client.feed.findFirst({
        where: {
          chatId: ctx.chatIdString,
          name: feedName,
          enabled: true,
        },
        include: {
          filters: true,
        },
      });

      if (!feed) {
        await ctx.reply(`❌ **Feed não encontrado**\n\nO feed "${feedName}" não foi encontrado ou não está habilitado.`);
        return;
      }

      logger.info(`Resetting lastItemId for feed: ${feed.name} (${feed.id})`);

      // Reset lastItemId to null
      await database.client.feed.update({
        where: { id: feed.id },
        data: { lastItemId: null },
      });

      await ctx.reply(`✅ **lastItemId Resetado!**\n\n📰 **Feed:** ${feed.name}\n🔗 **URL:** ${feed.rssUrl}\n\n🔄 O próximo processamento irá detectar todos os itens como novos.`);
      
      logger.info(`Successfully reset lastItemId for feed: ${feed.name} (${feed.id})`);
    } catch (error) {
      logger.error(`Failed to reset lastItemId for feed "${feedName}":`, error);
      await ctx.reply(`❌ **Erro ao resetar lastItemId**\n\nErro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
}

/**
 * Secret command to process a specific feed immediately
 */
export class ProcessFeedCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new ProcessFeedCommand();
    return {
      name: 'processarfeed',
      aliases: ['processfeed'],
      description: 'Process specific feed immediately (secret command)',
      schema: CommandSchemas.singleString,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext, args: [string]): Promise<void> {
    const [feedName] = args;

    try {
      const processingMessage = await ctx.reply(`🔄 **Processando feed "${feedName}"...**\n\n⏳ Aguarde, verificando o feed...`);

      // Find the specific feed
      const feed = await database.client.feed.findFirst({
        where: {
          chatId: ctx.chatIdString,
          name: feedName,
          enabled: true,
        },
        include: {
          filters: true,
        },
      });

      if (!feed) {
        await ctx.reply(`❌ **Feed não encontrado**\n\nO feed "${feedName}" não foi encontrado ou não está habilitado.`);
        return;
      }

      logger.info(`Processing specific feed immediately: ${feed.name} (${feed.id})`);

      // Get current lastItemId to compare later
      const originalLastItemId = feed.lastItemId;

      // Schedule immediate feed check
      await feedQueueService.scheduleFeedCheck({
        feedId: feed.id,
        chatId: feed.chatId,
        feedUrl: feed.rssUrl,
        lastItemId: feed.lastItemId ?? undefined,
        failureCount: 0,
        forceProcessAll: !feed.lastItemId, // Force process all items if no lastItemId
      }, 0); // 0 delay = immediate processing

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if feed was updated (new items found)
      const updatedFeed = await database.client.feed.findUnique({
        where: { id: feed.id },
        select: { lastItemId: true }
      });

      const hasNewItems = updatedFeed?.lastItemId !== originalLastItemId;

      // Update the processing message with results
      let resultMessage = `✅ **Processamento Concluído!**\n\n`;
      resultMessage += `📰 **Feed:** ${feed.name}\n`;
      resultMessage += `🔗 **URL:** ${feed.rssUrl}\n\n`;

      if (hasNewItems) {
        resultMessage += `🎉 **Novo item encontrado!**\n\n`;
        resultMessage += `🚀 O novo item será enviado em breve!`;
      } else {
        resultMessage += `📭 **Nenhum novo item encontrado**\n\n`;
        resultMessage += `💡 O feed está atualizado. Tente novamente mais tarde.`;
      }

      // Edit the original message with results
      try {
        await ctx.api.editMessageText(
          ctx.chatId!,
          processingMessage.message_id,
          resultMessage,
          { parse_mode: 'Markdown' }
        );
      } catch (editError) {
        // If edit fails, send new message
        await ctx.reply(resultMessage, { parse_mode: 'Markdown' });
      }

      logger.info(`Manual feed processing completed for feed ${feed.name} in chat ${ctx.chatIdString}: ${hasNewItems ? 'new items found' : 'no new items'}`);
    } catch (error) {
      logger.error(`Failed to process feed ${feedName}:`, error);
      await ctx.reply('❌ **Erro no processamento**\n\nFalha ao processar o feed. Tente novamente mais tarde.');
    }
  }
}

/**
 * Reload feeds command - forces re-scheduling of all enabled feeds
 */
export class ReloadFeedsCommand extends BaseCommandHandler {
  static create(): CommandHandler {
    const instance = new ReloadFeedsCommand();
    return {
      name: 'reload',
      aliases: ['reloadfeeds', 'reagendar'],
      description: 'Force re-scheduling of all enabled feeds',
      schema: CommandSchemas.noArgs,
      handler: instance.validateAndExecute.bind(instance),
    };
  }

  protected async execute(ctx: CommandContext): Promise<void> {
    try {
      await ctx.reply('🔄 **Recarregando feeds...**\n\n⏳ Aguarde, isso pode levar alguns segundos...');

      // Get all enabled feeds for this chat
      const feeds = await database.client.feed.findMany({
        where: {
          chatId: ctx.chatIdString,
          enabled: true,
        },
        include: {
          filters: true,
        },
      });

      if (feeds.length === 0) {
        await ctx.reply('❌ **Nenhum feed habilitado**\n\nNão há feeds habilitados neste chat para recarregar.');
        return;
      }

      logger.info(`Starting feed reload for chat ${ctx.chatIdString}: ${feeds.length} feeds`);

      let scheduledCount = 0;
      let errorCount = 0;
      const errors: Array<{ name: string; error: string }> = [];

      // Clear existing jobs for these feeds first
      for (const feed of feeds) {
        try {
          await feedQueueService.removeRecurringFeedCheck(feed.id);
          logger.debug(`Removed existing job for feed ${feed.id}`);
        } catch (error) {
          // Ignore errors when removing non-existent jobs
          logger.debug(`No existing job to remove for feed ${feed.id}`);
        }
      }

      // Schedule all feeds with force=true to bypass duplicate checks
      for (const feed of feeds) {
        try {
          const intervalMinutes = feedIntervalService.getIntervalForUrl(feed.rssUrl);
          
          await feedQueueService.scheduleRecurringFeedCheck({
            feedId: feed.id,
            chatId: feed.chatId,
            feedUrl: feed.rssUrl,
            lastItemId: feed.lastItemId ?? undefined,
          }, intervalMinutes, true); // force=true to bypass duplicate checks

          scheduledCount++;
          logger.info(`Scheduled feed ${feed.name} (${feed.id}) with ${intervalMinutes}min interval`);
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push({ name: feed.name, error: errorMessage });
          logger.error(`Failed to schedule feed ${feed.name}:`, error);
        }
      }

      // Build result message
      let message = `✅ **Recarregamento Concluído!**\n\n`;
      message += `📊 **Resumo:**\n`;
      message += `• Feeds agendados: ${scheduledCount}/${feeds.length}\n`;
      message += `• Erros: ${errorCount}\n\n`;

      if (scheduledCount > 0) {
        message += `🔄 **Feeds agendados com sucesso:**\n`;
        feeds.forEach(feed => {
          if (!errors.find(e => e.name === feed.name)) {
            message += `• ✅ ${feed.name}\n`;
          }
        });
        
        if (errorCount > 0) {
          message += `\n❌ **Feeds com erro:**\n`;
          errors.forEach(({ name, error }) => {
            message += `• ${name}: ${error}\n`;
          });
        }
        
        message += `\n💡 Os feeds serão verificados periodicamente agora.`;
      } else {
        message += `❌ **Nenhum feed foi agendado!**\n\n`;
        message += `**Erros:**\n`;
        errors.forEach(({ name, error }) => {
          message += `• ${name}: ${error}\n`;
        });
        message += `\n💡 Verifique os logs para mais detalhes.`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });

      logger.info(`Feed reload completed for chat ${ctx.chatIdString}: ${scheduledCount}/${feeds.length} feeds scheduled`);
    } catch (error) {
      logger.error('Failed to reload feeds:', error);
      await ctx.reply('❌ **Erro ao recarregar feeds**\n\nErro: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    }
  }
}
