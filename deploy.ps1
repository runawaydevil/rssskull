# RSS Skull Bot - Deploy Script (PowerShell)
param(
    [switch]$Clean
)

Write-Host "🚀 RSS Skull Bot - Deploy Script" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

if ($Clean) {
    Write-Host "⚠️  CLEAN DEPLOY - All data will be lost!" -ForegroundColor Red
    Write-Host "This will remove all feeds, settings, and backups." -ForegroundColor Red
    $confirm = Read-Host "Are you sure? (y/N)"
    
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Write-Host "🗑️  Removing all data..." -ForegroundColor Yellow
        docker-compose down -v
        docker-compose up -d --build
        Write-Host "✅ Clean deployment completed!" -ForegroundColor Green
    } else {
        Write-Host "❌ Deployment cancelled." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "📦 PRESERVE DATA DEPLOY - All data will be kept!" -ForegroundColor Green
    Write-Host "This will update the bot while keeping all feeds and settings." -ForegroundColor Green
    Write-Host ""
    
    # Create backups directory if it doesn't exist
    if (!(Test-Path "./backups")) {
        New-Item -ItemType Directory -Path "./backups"
        Write-Host "📁 Created backups directory" -ForegroundColor Blue
    }
    
    # Stop containers gracefully
    Write-Host "🛑 Stopping containers..." -ForegroundColor Yellow
    docker-compose down
    
    # Build and start with data preservation
    Write-Host "🔨 Building and starting containers..." -ForegroundColor Yellow
    docker-compose up -d --build
    
    Write-Host "✅ Deployment completed with data preservation!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Check status:" -ForegroundColor Cyan
    Write-Host "docker-compose ps" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 View logs:" -ForegroundColor Cyan
    Write-Host "docker-compose logs -f rss-skull-bot" -ForegroundColor White
    Write-Host ""
    Write-Host "💾 Database location:" -ForegroundColor Cyan
    Write-Host "Docker volume: app_data" -ForegroundColor White
    Write-Host "Local backups: ./backups/" -ForegroundColor White
}
