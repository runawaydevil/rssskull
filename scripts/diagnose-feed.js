#!/usr/bin/env node
/**
 * Script para diagnosticar feeds do Reddit
 * Uso: node scripts/diagnose-feed.js [feed-name-or-url]
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:./prisma/data/production.db',
    },
  },
});

async function diagnoseFeed(feedNameOrUrl) {
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
      try {
        const urlObj = new URL(feed.rssUrl);
        const hostname = urlObj.hostname.toLowerCase();
        const hasReddit = hostname.includes('reddit');
        const isComBr = hostname.includes('reddit.com.br');
        const isRedditCom = hostname === 'reddit.com' || hostname === 'www.reddit.com';
        
        console.log(`   Hostname: ${hostname}`);
        console.log(`   Contém 'reddit': ${hasReddit ? '✅' : '❌'}`);
        console.log(`   É reddit.com.br: ${isComBr ? '⚠️ Sim (domínio diferente)' : '❌ Não'}`);
        console.log(`   É reddit.com oficial: ${isRedditCom ? '✅ Sim' : '❌ Não'}`);
        
        // Extrair subreddit
        const subredditMatch = feed.rssUrl.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)/i);
        const subreddit = subredditMatch ? subredditMatch[1] : null;
        console.log(`   Subreddit: ${subreddit || '❌ Não encontrado'}`);
      } catch (e) {
        console.log(`   ❌ Erro ao analisar URL: ${e.message}`);
      }

      console.log('');
    }

    console.log('─'.repeat(80));
    console.log('\n✅ Diagnóstico completo');
    console.log('\n💡 Dicas:');
    console.log('   - Se URL contém reddit.com.br, é um domínio diferente (não oficial)');
    console.log('   - Apenas reddit.com ou www.reddit.com são detectados como Reddit oficial');
    console.log('   - Feeds privados requerem OAuth configurado (REDDIT_CLIENT_ID, etc)');
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

