#!/bin/bash
set -e

echo "🚀 Building RSS Skull Bot locally..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env file with your bot token and other settings"
    echo "   Then run this script again."
    exit 1
fi

# Check if BOT_TOKEN is set
if grep -q "your_telegram_bot_token_here" .env; then
    echo "❌ Please set your BOT_TOKEN in .env file"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🏗️  Building project..."
npm run build

echo "🐳 Building Docker image..."
docker build -t rssskull:local .

echo "✅ Build completed successfully!"
echo ""
echo "To run the bot:"
echo "  docker-compose up -d"
echo ""
echo "To check logs:"
echo "  docker-compose logs -f rss-skull-bot"
echo ""
echo "To stop the bot:"
echo "  docker-compose down"



