#!/bin/bash
# Script para resetar o banco de dados Docker

echo "🔄 Resetando banco de dados RSS Skull Bot..."

# Parar os containers
echo "⏹️ Parando containers..."
docker-compose -f docker-compose.prod.yml down

# Remover volumes de dados
echo "🗑️ Removendo volumes de dados..."
docker volume rm rssskull_app_prod_data 2>/dev/null || echo "Volume app_prod_data não encontrado"
docker volume rm rssskull_redis_prod_data 2>/dev/null || echo "Volume redis_prod_data não encontrado"

# Remover imagens antigas (opcional)
echo "🧹 Removendo imagens antigas..."
docker image rm rss-skull-bot:0.2.1 2>/dev/null || echo "Imagem não encontrada"

# Reconstruir e iniciar
echo "🏗️ Reconstruindo e iniciando..."
docker-compose -f docker-compose.prod.yml up -d --build

echo "✅ Reset do banco de dados concluído!"
echo "📊 O banco de dados foi completamente limpo e reinicializado."
echo "🚀 O bot está rodando com banco de dados vazio."
