#!/bin/bash
# Script para fazer push para ambos os repositórios Git

echo "🚀 Fazendo push para GitHub e Forgejo..."

# Push para GitHub
echo "📤 Push para GitHub..."
git push origin main
if [ $? -eq 0 ]; then
    echo "✅ GitHub: Push realizado com sucesso!"
else
    echo "❌ GitHub: Falha no push"
fi

# Push das tags para GitHub
echo "🏷️ Push das tags para GitHub..."
git push origin --tags
if [ $? -eq 0 ]; then
    echo "✅ GitHub: Tags enviadas com sucesso!"
else
    echo "❌ GitHub: Falha no push das tags"
fi

# Push para Forgejo
echo "📤 Push para Forgejo..."
git push forgejo main
if [ $? -eq 0 ]; then
    echo "✅ Forgejo: Push realizado com sucesso!"
else
    echo "❌ Forgejo: Falha no push (verifique as credenciais)"
    echo "💡 Dica: Configure suas credenciais do Forgejo primeiro"
fi

# Push das tags para Forgejo
echo "🏷️ Push das tags para Forgejo..."
git push forgejo --tags
if [ $? -eq 0 ]; then
    echo "✅ Forgejo: Tags enviadas com sucesso!"
else
    echo "❌ Forgejo: Falha no push das tags"
fi

echo ""
echo "🎯 Resumo:"
echo "✅ GitHub: https://github.com/runawaydevil/rssskull"
echo "⚠️ Forgejo: https://git.teu.cool/pablo/rssskull.git (configure credenciais)"
echo ""
echo "📋 Para configurar credenciais do Forgejo:"
echo "1. git config --global credential.helper store"
echo "2. git push forgejo main (e digite suas credenciais)"
echo "3. Ou use SSH: git remote set-url forgejo git@git.teu.cool:pablo/rssskull.git"


