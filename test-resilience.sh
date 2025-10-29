#!/bin/bash

# Script para testar o Sistema de Resiliência do RSS Skull Bot
# Execute este script após o bot estar rodando para verificar se tudo está funcionando

echo "🛡️ Testando Sistema de Resiliência do RSS Skull Bot"
echo "=================================================="

HOST=${HOST:-localhost}
PORT=${PORT:-8916}
BASE_URL="http://${HOST}:${PORT}"

# Função para fazer requisições HTTP
make_request() {
    local url=$1
    local timeout=${2:-10}
    
    if command -v curl >/dev/null 2>&1; then
        curl -f -s --max-time "$timeout" "$url" 2>/dev/null
    else
        echo "❌ curl não encontrado. Instale curl para executar este teste."
        exit 1
    fi
}

echo ""
echo "1️⃣ Testando conectividade básica..."
HEALTH_RESPONSE=$(make_request "${BASE_URL}/health")
if [ $? -eq 0 ]; then
    echo "✅ Bot está respondendo"
    
    # Verifica se o sistema de resiliência está ativo
    if echo "$HEALTH_RESPONSE" | grep -q "resilience"; then
        echo "✅ Sistema de resiliência detectado no /health"
    else
        echo "⚠️ Sistema de resiliência não detectado no /health"
    fi
else
    echo "❌ Bot não está respondendo em ${BASE_URL}/health"
    echo "   Verifique se o bot está rodando e acessível na porta ${PORT}"
    exit 1
fi

echo ""
echo "2️⃣ Testando endpoint de estatísticas de resiliência..."
RESILIENCE_RESPONSE=$(make_request "${BASE_URL}/resilience-stats")
if [ $? -eq 0 ]; then
    echo "✅ Endpoint /resilience-stats está funcionando"
    
    # Extrai métricas importantes
    if echo "$RESILIENCE_RESPONSE" | grep -q "successRate"; then
        SUCCESS_RATE=$(echo "$RESILIENCE_RESPONSE" | grep -o '"successRate":[0-9.]*' | cut -d':' -f2)
        echo "📊 Taxa de Sucesso: ${SUCCESS_RATE}"
    fi
    
    if echo "$RESILIENCE_RESPONSE" | grep -q "totalMessages"; then
        QUEUE_SIZE=$(echo "$RESILIENCE_RESPONSE" | grep -o '"totalMessages":[0-9]*' | cut -d':' -f2)
        echo "📬 Mensagens na Fila: ${QUEUE_SIZE}"
    fi
else
    echo "❌ Endpoint /resilience-stats não está funcionando"
fi

echo ""
echo "3️⃣ Testando endpoint de métricas detalhadas..."
METRICS_RESPONSE=$(make_request "${BASE_URL}/metrics")
if [ $? -eq 0 ]; then
    echo "✅ Endpoint /metrics está funcionando"
    
    # Verifica alertas ativos
    if echo "$METRICS_RESPONSE" | grep -q '"alerts"'; then
        echo "📊 Sistema de alertas está ativo"
        
        # Verifica alertas específicos
        if echo "$METRICS_RESPONSE" | grep -q '"connectionDown":true'; then
            echo "🚨 ALERTA: Conexão com Telegram está down"
        fi
        
        if echo "$METRICS_RESPONSE" | grep -q '"highErrorRate":true'; then
            echo "🚨 ALERTA: Taxa de erro alta detectada"
        fi
        
        if echo "$METRICS_RESPONSE" | grep -q '"queueOverflow":true'; then
            echo "🚨 ALERTA: Overflow na fila de mensagens"
        fi
    fi
else
    echo "❌ Endpoint /metrics não está funcionando"
fi

echo ""
echo "4️⃣ Verificando configuração de resiliência..."

# Verifica se as variáveis de ambiente estão configuradas
if [ -f ".env" ]; then
    echo "✅ Arquivo .env encontrado"
    
    if grep -q "TELEGRAM_RESILIENCE_ENABLED=true" .env; then
        echo "✅ Sistema de resiliência habilitado"
    else
        echo "⚠️ Sistema de resiliência pode estar desabilitado"
    fi
    
    if grep -q "MESSAGE_QUEUE_ENABLED=true" .env; then
        echo "✅ Fila de mensagens habilitada"
    else
        echo "⚠️ Fila de mensagens pode estar desabilitada"
    fi
else
    echo "⚠️ Arquivo .env não encontrado"
fi

echo ""
echo "5️⃣ Testando capacidade de resposta sob carga..."
echo "   Fazendo 5 requisições rápidas para testar rate limiting..."

for i in {1..5}; do
    RESPONSE=$(make_request "${BASE_URL}/health" 5)
    if [ $? -eq 0 ]; then
        echo "   ✅ Requisição $i: OK"
    else
        echo "   ❌ Requisição $i: Falhou"
    fi
    sleep 0.5
done

echo ""
echo "📊 RESUMO DO TESTE"
echo "=================="

# Faz uma última verificação completa
FINAL_HEALTH=$(make_request "${BASE_URL}/health")
if [ $? -eq 0 ]; then
    STATUS=$(echo "$FINAL_HEALTH" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    echo "🎯 Status Final: $STATUS"
    
    if [ "$STATUS" = "ok" ]; then
        echo "🎉 SUCESSO: Sistema de resiliência está funcionando perfeitamente!"
        echo ""
        echo "📋 Próximos passos:"
        echo "   • Monitore os logs para ver a resiliência em ação"
        echo "   • Acesse ${BASE_URL}/resilience-stats para estatísticas"
        echo "   • Use ${BASE_URL}/metrics para monitoramento detalhado"
        echo ""
        echo "🔍 Durante problemas 502, você verá logs como:"
        echo "   [WARN] Telegram API error: 502 Bad Gateway"
        echo "   [INFO] Retry attempt 3/15 in 4s"
        echo "   [INFO] Message enqueued for retry"
        echo "   [INFO] Connection recovered from downtime"
    else
        echo "⚠️ Sistema está respondendo mas com status: $STATUS"
    fi
else
    echo "❌ FALHA: Sistema não está respondendo adequadamente"
fi

echo ""
echo "🛡️ Teste de resiliência concluído!"