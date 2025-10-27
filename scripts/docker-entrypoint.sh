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

# Check for specific known migration issues (duplicate columns, etc.)
if echo "$MIGRATE_STATUS" | grep -q "20251024174900_add_notification_timestamps.*failed"; then
  echo "⚠️  Known issue: duplicate columns in migration 20251024174900"
  echo "🔧 Marking this migration as applied (columns already exist)"
  npx prisma migrate resolve --applied 20251024174900_add_notification_timestamps --schema=./prisma/schema.prisma || true
fi

# Try to deploy migrations
DEPLOY_OUTPUT=$(npx prisma migrate deploy --schema=./prisma/schema.prisma 2>&1)
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -eq 0 ]; then
  echo "✅ Migrations applied successfully"
else
  echo "$DEPLOY_OUTPUT"
  echo "⚠️  Migrations failed, attempting fallback..."
  
  # Check if the error is about duplicate columns
  if echo "$DEPLOY_OUTPUT" | grep -q "duplicate column"; then
    echo "🔍 Detected duplicate column error"
    FAILED_MIG=$(echo "$DEPLOY_OUTPUT" | grep "Migration name:" | sed 's/.*Migration name: //' || echo "")
    if [ -n "$FAILED_MIG" ]; then
      echo "🔧 Marking duplicate column migration as applied: $FAILED_MIG"
      npx prisma migrate resolve --applied "$FAILED_MIG" --schema=./prisma/schema.prisma || true
      
      # Try deploying again
      echo "🔄 Retrying migration deployment..."
      npx prisma migrate deploy --schema=./prisma/schema.prisma || echo "⚠️  Second attempt failed, continuing anyway..."
    fi
  fi
  
  echo "🔄 Continuing with startup despite migration errors..."
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma

# Start the application
echo "🎯 Starting RSS Skull Bot..."
exec node dist/main.js
