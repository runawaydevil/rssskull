import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function backupDatabase() {
  try {
    console.log('💾 Fazendo backup do banco de dados...');
    
    // Backup de todos os dados
    const backup = {
      chats: await prisma.chat.findMany({
        include: {
          settings: true,
          feeds: {
            include: {
              filters: true
            }
          },
          statistics: true
        }
      }),
      itemDedupe: await prisma.itemDedupe.findMany()
    };
    
    const backupFile = `backup-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    
    console.log(`✅ Backup salvo em: ${backupFile}`);
    console.log(`📊 Dados salvos:`);
    console.log(`  - Chats: ${backup.chats.length}`);
    console.log(`  - Feeds: ${backup.chats.reduce((sum, chat) => sum + chat.feeds.length, 0)}`);
    console.log(`  - Configurações: ${backup.chats.filter(chat => chat.settings).length}`);
    console.log(`  - Estatísticas: ${backup.chats.reduce((sum, chat) => sum + chat.statistics.length, 0)}`);
    console.log(`  - Dedupe: ${backup.itemDedupe.length}`);
    
  } catch (error) {
    console.error('❌ Erro ao fazer backup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function restoreDatabase(backupFile) {
  try {
    if (!fs.existsSync(backupFile)) {
      console.error(`❌ Arquivo de backup não encontrado: ${backupFile}`);
      return;
    }
    
    console.log(`🔄 Restaurando banco de dados de: ${backupFile}`);
    
    const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    
    // Limpar dados existentes
    await prisma.itemDedupe.deleteMany();
    await prisma.statistic.deleteMany();
    await prisma.feedFilter.deleteMany();
    await prisma.feed.deleteMany();
    await prisma.chatSettings.deleteMany();
    await prisma.chat.deleteMany();
    
    // Restaurar chats e dados relacionados
    for (const chat of backup.chats) {
      await prisma.chat.create({
        data: {
          id: chat.id,
          type: chat.type,
          title: chat.title,
          createdAt: new Date(chat.createdAt),
          updatedAt: new Date(chat.updatedAt),
          settings: chat.settings ? {
            create: {
              chatId: chat.settings.chatId,
              language: chat.settings.language,
              checkInterval: chat.settings.checkInterval,
              maxFeeds: chat.settings.maxFeeds,
              enableFilters: chat.settings.enableFilters,
              messageTemplate: chat.settings.messageTemplate,
              timezone: chat.settings.timezone,
              rateLimitEnabled: chat.settings.rateLimitEnabled,
              maxRequestsPerMinute: chat.settings.maxRequestsPerMinute,
              minDelayMs: chat.settings.minDelayMs,
              cacheEnabled: chat.settings.cacheEnabled,
              cacheTTLMinutes: chat.settings.cacheTTLMinutes,
              retryEnabled: chat.settings.retryEnabled,
              maxRetries: chat.settings.maxRetries,
              timeoutSeconds: chat.settings.timeoutSeconds
            }
          } : undefined,
          feeds: {
            create: chat.feeds.map(feed => ({
              id: feed.id,
              name: feed.name,
              url: feed.url,
              rssUrl: feed.rssUrl,
              lastItemId: feed.lastItemId,
              lastNotifiedAt: feed.lastNotifiedAt ? new Date(feed.lastNotifiedAt) : null,
              lastSeenAt: feed.lastSeenAt ? new Date(feed.lastSeenAt) : null,
              checkIntervalMinutes: feed.checkIntervalMinutes,
              maxAgeMinutes: feed.maxAgeMinutes,
              enabled: feed.enabled,
              failures: feed.failures,
              lastCheck: feed.lastCheck ? new Date(feed.lastCheck) : null,
              createdAt: new Date(feed.createdAt),
              updatedAt: new Date(feed.updatedAt),
              filters: {
                create: feed.filters.map(filter => ({
                  id: filter.id,
                  type: filter.type,
                  pattern: filter.pattern,
                  isRegex: filter.isRegex
                }))
              }
            }))
          },
          statistics: {
            create: chat.statistics.map(stat => ({
              id: stat.id,
              feedId: stat.feedId,
              action: stat.action,
              count: stat.count,
              date: new Date(stat.date)
            }))
          }
        }
      });
    }
    
    // Restaurar dedupe
    for (const item of backup.itemDedupe) {
      await prisma.itemDedupe.create({
        data: {
          id: item.id,
          itemId: item.itemId,
          feedId: item.feedId,
          seenAt: new Date(item.seenAt),
          expiresAt: new Date(item.expiresAt)
        }
      });
    }
    
    console.log('✅ Banco de dados restaurado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao restaurar banco de dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Verificar argumentos da linha de comando
const args = process.argv.slice(2);
const command = args[0];
const backupFile = args[1];

if (command === 'backup') {
  backupDatabase();
} else if (command === 'restore' && backupFile) {
  restoreDatabase(backupFile);
} else {
  console.log('📋 Uso:');
  console.log('  node scripts/backup-database.js backup');
  console.log('  node scripts/backup-database.js restore <arquivo-backup>');
}
