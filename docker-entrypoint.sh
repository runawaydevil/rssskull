#!/bin/sh

echo "🚀 Starting RSS Skull Bot (Python)..."

# Create data directory if it doesn't exist
mkdir -p /app/data

# Set database URL if not already set
export DATABASE_URL=${DATABASE_URL:-file:/app/data/production.db}

# Wait for Redis to be ready (if not disabled)
if [ "${DISABLE_REDIS}" != "true" ]; then
    echo "⏳ Waiting for Redis to be ready..."
    until nc -z ${REDIS_HOST:-redis} ${REDIS_PORT:-6379} 2>/dev/null; do
        echo "Waiting for Redis..."
        sleep 1
    done
    echo "✅ Redis is ready"
fi

# Start the application
echo "🎯 Starting RSS Skull Bot..."
exec python run.py

