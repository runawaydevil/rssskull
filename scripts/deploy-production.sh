#!/bin/bash
set -e

echo "🚀 Deploying RSS Skull Bot from GHCR..."

# Pull latest code
git pull origin main

# Pull latest Docker image from GHCR
echo "📦 Pulling latest image from GHCR..."
docker compose pull

# Stop and remove old containers
echo "🛑 Stopping old containers..."
docker compose down

# Start new containers
echo "▶️  Starting new containers..."
docker compose up -d

# Wait a bit for container to start
sleep 3

# Show logs
echo "📋 Recent logs:"
docker compose logs --tail=50 rss-skull-bot

echo "✅ Deploy complete!"
echo ""
echo "To monitor logs in real-time:"
echo "  docker compose logs -f rss-skull-bot"
