import { PrismaClient } from '@prisma/client';

async function checkDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Verificando banco de dados...');
    
    // Verificar chats
    const chats = await prisma.chat.findMany();
    console.log(`💬 Total de chats: ${chats.length}`);
    
    // Verificar feeds
    const feeds = await prisma.feed.findMany();
    console.log(`📊 Total de feeds: ${feeds.length}`);
    
    if (feeds.length > 0) {
      console.log('✅ Feeds encontrados:');
      feeds.forEach(feed => {
        console.log(`  - ${feed.name} (${feed.url})`);
      });
    } else {
      console.log('❌ Nenhum feed encontrado no banco de dados');
    }
    
    // Verificar configurações
    const settings = await prisma.chatSettings.findMany();
    console.log(`⚙️ Total de configurações: ${settings.length}`);
    
    // Verificar estatísticas
    const stats = await prisma.statistic.findMany();
    console.log(`📈 Total de estatísticas: ${stats.length}`);
    
    // Verificar dedupe
    const dedupe = await prisma.itemDedupe.findMany();
    console.log(`🔄 Total de itens deduplicados: ${dedupe.length}`);
    
  } catch (error) {
    console.error('❌ Erro ao verificar banco de dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
