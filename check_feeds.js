const { PrismaClient } = require('@prisma/client');

async function checkFeeds() {
  const prisma = new PrismaClient();
  
  try {
    const feeds = await prisma.feed.findMany({
      where: { chatId: '-1003110709154' },
      select: { id: true, name: true, chatId: true, rssUrl: true }
    });
    
    console.log('Feeds encontrados para chat -1003110709154:');
    console.log(JSON.stringify(feeds, null, 2));
    
    if (feeds.length === 0) {
      console.log('Nenhum feed encontrado para este chat.');
    }
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFeeds();
