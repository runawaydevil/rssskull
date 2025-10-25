import { spawn } from 'child_process';
import fs from 'fs';

async function restartBot() {
  console.log('🔄 Reiniciando o bot...');
  
  // Verificar se há um processo do bot rodando
  console.log('🔍 Verificando processos Node.js...');
  
  try {
    // Tentar parar processos Node.js (isso pode não funcionar em Windows)
    console.log('⚠️ Para parar o bot manualmente:');
    console.log('1. Pressione Ctrl+C no terminal onde o bot está rodando');
    console.log('2. Ou feche o terminal');
    console.log('3. Depois execute: npm start');
    
    console.log('\n📋 Para iniciar o bot:');
    console.log('npm start');
    
    console.log('\n🔧 Verificando configuração...');
    
    // Verificar se o .env está correto
    const envContent = fs.readFileSync('.env', 'utf8');
    const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
    
    if (dbUrlMatch) {
      console.log(`✅ DATABASE_URL: ${dbUrlMatch[1]}`);
    } else {
      console.log('❌ DATABASE_URL não encontrado no .env');
    }
    
    // Verificar se o banco existe
    const dbPath = './prisma/data/development.db';
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      console.log(`✅ Banco existe: ${stats.size} bytes`);
    } else {
      console.log('❌ Banco não encontrado');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

restartBot();
