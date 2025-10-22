# Script PowerShell para resetar o banco de dados Docker

Write-Host "🔄 Resetando banco de dados RSS Skull Bot..." -ForegroundColor Yellow

# Parar os containers
Write-Host "⏹️ Parando containers..." -ForegroundColor Blue
docker-compose -f docker-compose.prod.yml down

# Remover volumes de dados
Write-Host "🗑️ Removendo volumes de dados..." -ForegroundColor Red
docker volume rm rssskull_app_prod_data 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Volume app_prod_data não encontrado" -ForegroundColor Gray }

docker volume rm rssskull_redis_prod_data 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Volume redis_prod_data não encontrado" -ForegroundColor Gray }

# Remover imagens antigas (opcional)
Write-Host "🧹 Removendo imagens antigas..." -ForegroundColor Magenta
docker image rm rss-skull-bot:0.2.1 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Imagem não encontrada" -ForegroundColor Gray }

# Reconstruir e iniciar
Write-Host "🏗️ Reconstruindo e iniciando..." -ForegroundColor Green
docker-compose -f docker-compose.prod.yml up -d --build

Write-Host "✅ Reset do banco de dados concluído!" -ForegroundColor Green
Write-Host "📊 O banco de dados foi completamente limpo e reinicializado." -ForegroundColor Cyan
Write-Host "🚀 O bot está rodando com banco de dados vazio." -ForegroundColor Cyan
