#!/bin/bash

echo "🚀 RSS Skull Bot - Deploy Script"
echo "================================="

# Check if we want to preserve data
if [ "$1" = "--clean" ]; then
    echo "⚠️  CLEAN DEPLOY - All data will be lost!"
    echo "This will remove all feeds, settings, and backups."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Removing all data..."
        docker-compose down -v
        docker-compose up -d --build
        echo "✅ Clean deployment completed!"
    else
        echo "❌ Deployment cancelled."
        exit 1
    fi
else
    echo "📦 PRESERVE DATA DEPLOY - All data will be kept!"
    echo "This will update the bot while keeping all feeds and settings."
    echo ""
    
    # Create backups directory if it doesn't exist
    mkdir -p ./backups
    
    # Stop containers gracefully
    echo "🛑 Stopping containers..."
    docker-compose down
    
    # Build and start with data preservation
    echo "🔨 Building and starting containers..."
    docker-compose up -d --build
    
    echo "✅ Deployment completed with data preservation!"
    echo ""
    echo "📊 Check status:"
    echo "docker-compose ps"
    echo ""
    echo "📋 View logs:"
    echo "docker-compose logs -f rss-skull-bot"
    echo ""
    echo "💾 Database location:"
    echo "Docker volume: app_data"
    echo "Local backups: ./backups/"
fi