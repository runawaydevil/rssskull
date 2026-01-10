#!/usr/bin/env node
/**
 * Script para diagnosticar feeds do Reddit
 * Uso: node scripts/diagnose-feed.js [feed-name-or-url]
 * Ou: tsx scripts/diagnose-feed.ts [feed-name-or-url]
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../src/config/config.service.js';
import { redditService } from '../src/services/reddit.service.js';
import { classifySource } from '../src/utils/source-classifier.js';
import { extractSubreddit } from '../src/utils/url-sanitizer.js';
import { RSSService } from '../src/services/rss.service.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.database.url,
    },
  },
});

async function diagnoseFeed(feedNameOrUrl?: string) {
  try {
    console.log('🔍 Diagnóstico de Feeds do Reddit\n');

    // Buscar feed específico ou todos os feeds do Reddit
    let feeds;
    if (feedNameOrUrl) {
      // Buscar por nome ou URL
      feeds = await prisma.feed.findMany({
        where: {
          OR: [
            { name: { contains: feedNameOrUrl, mode: 'insensitive' } },
            { url: { contains: feedNameOrUrl } },
            { rssUrl: { contains: feedNameOrUrl } },
          ],
        },
        include: {
          filters: true,
          chat: {
            select: {
              id: true,
              type: true,
              title: true,
            },
          },
        },
        orderBy: {
          lastCheck: 'desc',
        },
      });
    } else {
      // Buscar todos os feeds que parecem ser do Reddit
      feeds = await prisma.feed.findMany({
        where: {
          OR: [
            { url: { contains: 'reddit' } },
            { rssUrl: { contains: 'reddit' } },
          ],
        },
        include: {
          filters: true,
          chat: {
            select: {
              id: true,
              type: true,
              title: true,
            },
          },
        },
        orderBy: {
          lastCheck: 'desc',
        },
      });
    }

    if (feeds.length === 0) {
      console.log('❌ Nenhum feed encontrado');
      if (feedNameOrUrl) {
        console.log(`   Buscando por: "${feedNameOrUrl}"`);
      } else {
        console.log('   Buscando feeds do Reddit...');
      }
      return;
    }

    console.log(`📋 Encontrados ${feeds.length} feed(s):\n`);

    for (const feed of feeds) {
      console.log('─'.repeat(80));
      console.log(`📰 Feed: ${feed.name} (${feed.id})`);
      console.log(`   URL Original: ${feed.url}`);
      console.log(`   RSS URL: ${feed.rssUrl}`);
      console.log(`   Chat: ${feed.chat.title || feed.chatId} (${feed.chat.type})`);
      console.log(`   Habilitado: ${feed.enabled ? '✅' : '❌'}`);
      console.log(`   Intervalo: ${feed.checkIntervalMinutes} minutos`);
      console.log(`   Max Age: ${feed.maxAgeMinutes} minutos`);
      console.log(`   Falhas: ${feed.failures}`);
      console.log(`   Último Check: ${feed.lastCheck?.toISOString() || 'Nunca'}`);
      console.log(`   Last Item ID: ${feed.lastItemId || 'Nenhum'}`);
      console.log(`   Last Notified: ${feed.lastNotifiedAt?.toISOString() || 'Nunca'}`);
      console.log(`   Filtros: ${feed.filters.length}`);

      // Análise de detecção
      console.log('\n   🔍 Análise de Detecção:');
      const sourceType = classifySource(feed.rssUrl);
      console.log(`   Classificação: ${sourceType}`);
      
      const isRedditUrl = redditService.isRedditUrl(feed.rssUrl);
      console.log(`   isRedditUrl(): ${isRedditUrl ? '✅ Sim' : '❌ Não'}`);
      
      const subreddit = extractSubreddit(feed.rssUrl);
      console.log(`   Subreddit extraído: ${subreddit || '❌ Não encontrado'}`);

      // Verificar se URL é problemática
      const rssService = new RSSService();
      const isProblematic = (rssService as any).isProblematicUrl?.(feed.rssUrl) ?? false;
      console.log(`   URL Problemática: ${isProblematic ? '⚠️ Sim' : '✅ Não'}`);

      // Testar fetch (se for Reddit)
      if (isRedditUrl && subreddit) {
        console.log('\n   🧪 Teste de Fetch:');
        try {
          console.log(`   Tentando buscar r/${subreddit}...`);
          const result = await redditService.fetchFeed(feed.rssUrl);
          
          if (result.success && result.feed) {
            console.log(`   ✅ Sucesso! ${result.feed.items.length} itens encontrados`);
            if (result.feed.items.length > 0) {
              const firstItem = result.feed.items[0];
              console.log(`   Primeiro item: "${firstItem?.title?.substring(0, 50)}..."`);
              console.log(`   ID: ${firstItem?.id}`);
              console.log(`   Data: ${firstItem?.pubDate?.toISOString()}`);
            }
          } else {
            console.log(`   ❌ Falhou: ${result.error}`);
          }
        } catch (error) {
          console.log(`   ❌ Erro: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      console.log('');
    }

    console.log('─'.repeat(80));
    console.log('\n✅ Diagnóstico completo');
  } catch (error) {
    console.error('❌ Erro durante diagnóstico:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar
const feedArg = process.argv[2];
diagnoseFeed(feedArg);

