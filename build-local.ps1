# RSS Skull Bot - Local Build Script for Windows
# PowerShell script to build and test the bot locally

Write-Host "🚀 Building RSS Skull Bot locally..." -ForegroundColor Green

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Creating from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "📝 Please edit .env file with your bot token and other settings" -ForegroundColor Cyan
    Write-Host "   Then run this script again." -ForegroundColor Cyan
    exit 1
}

# Check if BOT_TOKEN is set
$envContent = Get-Content ".env" -Raw
if ($envContent -match "your_telegram_bot_token_here") {
    Write-Host "❌ Please set your BOT_TOKEN in .env file" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Installing dependencies..." -ForegroundColor Blue
npm install

Write-Host "🏗️  Building project..." -ForegroundColor Blue
npm run build

Write-Host "🐳 Building Docker image..." -ForegroundColor Blue
docker build -t rssskull:local .

Write-Host "✅ Build completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To run the bot:" -ForegroundColor Cyan
Write-Host "  docker-compose up -d" -ForegroundColor White
Write-Host ""
Write-Host "To check logs:" -ForegroundColor Cyan
Write-Host "  docker-compose logs -f rss-skull-bot" -ForegroundColor White
Write-Host ""
Write-Host "To stop the bot:" -ForegroundColor Cyan
Write-Host "  docker-compose down" -ForegroundColor White



