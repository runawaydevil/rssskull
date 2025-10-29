import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function autoBackup() {
  try {
    console.log('🔄 Fazendo backup automático...');
    
    // Criar diretório de backups se não existir
    const backupDir = './backups';
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Backup de todos os dados
    const backup = {
      timestamp: new Date().toISOString(),
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
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
    
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    
    // Manter apenas os últimos 10 backups
    const backupFiles = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('backup-') && file.endsWith('.json'))
      .sort()
      .reverse();
    
    if (backupFiles.length > 10) {
      const filesToDelete = backupFiles.slice(10);
      filesToDelete.forEach(file => {
        fs.unlinkSync(path.join(backupDir, file));
        console.log(`🗑️ Backup antigo removido: ${file}`);
      });
    }
    
    console.log(`✅ Backup salvo: ${backupFile}`);
    console.log(`📊 Dados salvos:`);
    console.log(`  - Chats: ${backup.chats.length}`);
    console.log(`  - Feeds: ${backup.chats.reduce((sum, chat) => sum + chat.feeds.length, 0)}`);
    console.log(`  - Configurações: ${backup.chats.filter(chat => chat.settings).length}`);
    console.log(`  - Estatísticas: ${backup.chats.reduce((sum, chat) => sum + chat.statistics.length, 0)}`);
    console.log(`  - Dedupe: ${backup.itemDedupe.length}`);
    
  } catch (error) {
    console.error('❌ Erro no backup automático:', error);
  } finally {
    await prisma.$disconnect();
  }
}

autoBackup();
