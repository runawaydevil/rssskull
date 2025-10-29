import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addSampleFeeds() {
  try {
    console.log('📝 Adicionando feeds de exemplo...');
    
    // Criar um chat de exemplo
    const chatId = '123456789'; // Substitua pelo seu chat ID real
    
    const chat = await prisma.chat.upsert({
      where: { id: chatId },
      update: {},
      create: {
        id: chatId,
        type: 'private',
        title: 'Meu Chat RSS',
        settings: {
          create: {
            language: 'pt',
            checkInterval: 120,
            maxFeeds: 50,
            enableFilters: true,
            timezone: 'America/Sao_Paulo',
            rateLimitEnabled: true,
            maxRequestsPerMinute: 3,
            minDelayMs: 200000,
            cacheEnabled: true,
            cacheTTLMinutes: 20,
            retryEnabled: true,
            maxRetries: 3,
            timeoutSeconds: 10
          }
        }
      }
    });
    
    console.log(`✅ Chat criado: ${chat.title}`);
    
    // Feeds de exemplo (Reddit)
    const sampleFeeds = [
      {
        name: 'Reddit - OpenSignups',
        url: 'https://reddit.com/r/openedsignups/.rss',
        rssUrl: 'https://reddit.com/r/openedsignups/.rss',
        checkIntervalMinutes: 20,
        maxAgeMinutes: 1440
      },
      {
        name: 'Reddit - Trackers',
        url: 'https://reddit.com/r/trackers/.rss',
        rssUrl: 'https://reddit.com/r/trackers/.rss',
        checkIntervalMinutes: 20,
        maxAgeMinutes: 1440
      },
      {
        name: 'Reddit - UsenetInvites',
        url: 'https://reddit.com/r/usenetinvites/.rss',
        rssUrl: 'https://reddit.com/r/usenetinvites/.rss',
        checkIntervalMinutes: 20,
        maxAgeMinutes: 1440
      },
      {
        name: 'Reddit - 90_Discount',
        url: 'https://reddit.com/r/90_Discount/.rss',
        rssUrl: 'https://reddit.com/r/90_Discount/.rss',
        checkIntervalMinutes: 20,
        maxAgeMinutes: 1440
      }
    ];
    
    for (const feedData of sampleFeeds) {
      const feed = await prisma.feed.create({
        data: {
          chatId: chatId,
          name: feedData.name,
          url: feedData.url,
          rssUrl: feedData.rssUrl,
          checkIntervalMinutes: feedData.checkIntervalMinutes,
          maxAgeMinutes: feedData.maxAgeMinutes,
          enabled: true
        }
      });
      
      console.log(`✅ Feed adicionado: ${feed.name}`);
    }
    
    console.log('🎉 Feeds de exemplo adicionados com sucesso!');
    console.log('💡 Agora você pode testar o bot com esses feeds');
    
  } catch (error) {
    console.error('❌ Erro ao adicionar feeds de exemplo:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addSampleFeeds();
