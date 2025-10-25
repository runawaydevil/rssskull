import { PrismaClient } from '@prisma/client';
import fs from 'fs';

async function checkBotDatabase() {
  console.log('🔍 Verificando configuração do banco de dados do bot...');
  
  // Verificar variáveis de ambiente
  console.log('📋 Variáveis de ambiente:');
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
  
  // Verificar se o arquivo de banco existe
  const dbPath = process.env.DATABASE_URL?.replace('file:', '');
  if (dbPath) {
    const dbExists = fs.existsSync(dbPath);
    console.log(`  Banco existe: ${dbExists ? '✅' : '❌'}`);
    console.log(`  Caminho: ${dbPath}`);
    
    if (dbExists) {
      const stats = fs.statSync(dbPath);
      console.log(`  Tamanho: ${stats.size} bytes`);
      console.log(`  Modificado: ${stats.mtime}`);
    }
  }
  
  // Testar conexão com Prisma
  const prisma = new PrismaClient();
  try {
    console.log('\n🔌 Testando conexão com Prisma...');
    
    const feeds = await prisma.feed.findMany();
    console.log(`✅ Conexão OK - ${feeds.length} feeds encontrados`);
    
    if (feeds.length > 0) {
      console.log('📊 Feeds no banco:');
      feeds.forEach(feed => {
        console.log(`  - ${feed.name} (${feed.url})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro na conexão:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBotDatabase();
