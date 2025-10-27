#!/bin/sh

echo "🚀 Starting RSS Skull Bot..."

# Create data directory and set database URL
mkdir -p /app/data
export DATABASE_URL='file:/app/data/production.db'

# Apply migrations (works for both new and existing databases)
echo "📋 Applying database migrations..."

# First, check migration status
MIGRATE_STATUS=$(npx prisma migrate status --schema=./prisma/schema.prisma 2>&1 || true)
echo "$MIGRATE_STATUS"

# Check if there are failed migrations
if echo "$MIGRATE_STATUS" | grep -q "failed"; then
  echo "⚠️  Found failed migrations, attempting to resolve..."
  # The last failed migration is usually the one causing issues
  # Mark it as rolled back and then we can reapply
  FAILED_MIG=$(echo "$MIGRATE_STATUS" | grep "failed" | tail -1 | awk '{print $1}' || echo "")
  if [ -n "$FAILED_MIG" ]; then
    echo "🔧 Marking migration as rolled back: $FAILED_MIG"
    npx prisma migrate resolve --rolled-back "$FAILED_MIG" --schema=./prisma/schema.prisma || true
  fi
fi

# Try to deploy migrations
if npx prisma migrate deploy --schema=./prisma/schema.prisma; then
  echo "✅ Migrations applied successfully"
else
  echo "⚠️  Migrations failed, attempting fallback..."
  # If deploy still fails, try to ignore the error and continue
  # The database might already be in the correct state
  echo "🔄 Continuing with startup despite migration errors..."
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma

# Start the application
echo "🎯 Starting RSS Skull Bot..."
exec node dist/main.js
