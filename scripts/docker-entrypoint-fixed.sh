#!/bin/sh

echo "🚀 Starting RSS Skull Bot (Fixed Version)..."

# Create data directory
mkdir -p /app/data

# Set database URL
export DATABASE_URL='file:/app/data/production.db'

# Check if database exists
if [ ! -f /app/data/production.db ]; then
  echo "📝 Database doesn't exist, creating it..."
  touch /app/data/production.db
fi

# Try migrations with timeout
echo "📋 Applying database migrations..."
timeout 30 npx prisma migrate deploy --schema=./prisma/schema.prisma 2>/dev/null || {
  echo "⚠️ Migration timeout or failed, continuing..."
}

# Verify Prisma client
if [ ! -d "/app/node_modules/.prisma/client" ]; then
  echo "🔧 Prisma client missing, trying to generate..."
  timeout 30 npx prisma generate --schema=./prisma/schema.prisma 2>/dev/null || {
    echo "⚠️ Prisma generate failed, but continuing..."
  }
fi

# Start the application
echo "🎯 Starting RSS Skull Bot..."
exec node dist/main.js