#!/bin/bash

# Script de monitoramento para RSS Skull Bot
# Salve como monitor.sh no servidor

echo "🔍 Monitorando RSS Skull Bot v0.5.0..."

# Verificar status dos containers
echo "📊 Status dos containers:"
docker-compose ps

# Verificar logs recentes
echo "📝 Logs recentes (últimas 20 linhas):"
docker-compose logs --tail=20 rss-skull-bot

# Verificar saúde do bot
echo "🏥 Health check:"
if curl -f http://localhost:8916/health; then
    echo "✅ Bot está funcionando corretamente"
else
    echo "❌ Bot não está respondendo"
fi

# Verificar uso de recursos
echo "💻 Uso de recursos:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
