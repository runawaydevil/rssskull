#!/bin/bash

echo "🔄 Rebuilding RSS Skull Bot (FEED-ONLY MODE)..."

# Stop current containers
docker compose down

# Rebuild and start
docker compose up -d --build

# Wait for startup
sleep 5

# Show logs
docker compose logs -f rss-skull-bot