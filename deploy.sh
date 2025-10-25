#!/bin/bash

# Script de deploy para produção - RSS Skull Bot v0.5.0
# Salve como deploy.sh no servidor

set -e

echo "🚀 Iniciando deploy do RSS Skull Bot v0.5.0..."

# Verificar se o arquivo .env existe
if [ ! -f ".env" ]; then
    echo "❌ Arquivo .env não encontrado!"
    echo "📝 Copie o arquivo .env.production para .env e configure as variáveis"
    echo "   cp .env.production .env"
    echo "   nano .env"
    exit 1
fi

# Parar containers existentes
echo "📦 Parando containers existentes..."
docker-compose down || true

# Fazer backup do banco de dados
echo "💾 Fazendo backup do banco de dados..."
if [ -f "./data/production.db" ]; then
    cp ./data/production.db ./data/production.db.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Backup criado com sucesso"
fi

# Pull da imagem mais recente
echo "📥 Baixando imagem mais recente..."
docker-compose pull

# Iniciar containers
echo "🔄 Iniciando containers..."
docker-compose up -d

# Aguardar serviços ficarem prontos
echo "⏳ Aguardando serviços ficarem prontos..."
sleep 30

# Health check
echo "🏥 Verificando saúde dos serviços..."
if curl -f http://localhost:8916/health; then
    echo "✅ Deploy realizado com sucesso!"
    echo "🌐 Bot disponível em: http://localhost:8916"
    echo "📊 Redis disponível na porta: 6380"
else
    echo "❌ Falha no health check!"
    echo "🔄 Fazendo rollback..."
    docker-compose down
    exit 1
fi

echo "🎉 RSS Skull Bot v0.5.0 deployado com sucesso!"
