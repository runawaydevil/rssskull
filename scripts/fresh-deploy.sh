#!/bin/bash
# Fresh deployment script - removes old volumes and rebuilds

echo "🧹 Stopping existing containers..."
docker compose down

echo "🗑️  Removing old volumes..."
docker volume rm rssskull_app_data rssskull_redis_data 2>/dev/null || true

echo "🔨 Building and starting containers..."
docker compose up -d --build

echo "✅ Fresh deployment complete!"
echo "📋 Check logs with: docker compose logs -f rss-skull-bot"

