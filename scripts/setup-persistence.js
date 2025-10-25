import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function setupPersistence() {
  try {
    console.log('🔧 Configurando persistência do banco de dados...');
    
    // Verificar se o diretório de dados existe
    const dataDir = './prisma/data';
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Diretório de dados criado');
    }
    
    // Verificar se o banco existe
    const dbPath = './prisma/data/development.db';
    const dbExists = fs.existsSync(dbPath);
    
    if (!dbExists) {
      console.log('🗄️ Banco de dados não encontrado, criando...');
      await prisma.$executeRaw`SELECT 1`; // Força criação do banco
      console.log('✅ Banco de dados criado');
    } else {
      console.log('✅ Banco de dados encontrado');
    }
    
    // Verificar estrutura do banco
    console.log('🔍 Verificando estrutura do banco...');
    
    const tables = await prisma.$queryRaw`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `;
    
    console.log(`📊 Tabelas encontradas: ${tables.length}`);
    tables.forEach(table => {
      console.log(`  - ${table.name}`);
    });
    
    // Verificar dados existentes
    const feeds = await prisma.feed.findMany();
    const chats = await prisma.chat.findMany();
    
    console.log(`📈 Dados atuais:`);
    console.log(`  - Chats: ${chats.length}`);
    console.log(`  - Feeds: ${feeds.length}`);
    
    if (feeds.length === 0) {
      console.log('⚠️ Nenhum feed encontrado. Você precisará adicionar seus feeds novamente.');
      console.log('💡 Dica: Use o comando /addfeed no bot para adicionar feeds');
    }
    
    console.log('✅ Configuração de persistência concluída!');
    
  } catch (error) {
    console.error('❌ Erro ao configurar persistência:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupPersistence();
