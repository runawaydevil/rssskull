#!/bin/sh
set -e

echo "Starting RSS Skull Bot v0.2.1..."

# Wait for database file to be accessible
echo "Ensuring database directory exists..."
mkdir -p /app/data

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

# Generate Prisma client if needed
echo "Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma

# Start the application
echo "Starting bot..."
exec node dist/main.js