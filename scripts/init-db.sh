#!/bin/bash
set -e

echo "🔄 Initializing RSS Skull Bot database..."

# Create data directory
mkdir -p /app/data

# Set database URL
export DATABASE_URL="file:/app/data/production.db"

echo "📊 Database URL: $DATABASE_URL"

# Check if database exists
if [ -f "/app/data/production.db" ]; then
    echo "🗑️ Removing existing database..."
    rm -f /app/data/production.db
fi

echo "🔄 Running database migrations..."
npx prisma migrate reset --force --schema=./prisma/schema.prisma

echo "✅ Database migrations completed!"

echo "🔄 Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma

echo "✅ Prisma client generated!"

echo "🚀 Starting RSS Skull Bot..."
exec node dist/main.js
