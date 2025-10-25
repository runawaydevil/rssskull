#!/bin/bash
set -e

echo "🚀 Starting RSS Skull Bot..."

# Create data directory and set database URL
mkdir -p /app/data
export DATABASE_URL='file:/app/data/production.db'

# Apply migrations (works for both new and existing databases)
echo "📋 Applying database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma

# Start the application
echo "🎯 Starting RSS Skull Bot..."
exec node dist/main.js
