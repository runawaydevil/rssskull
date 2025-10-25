# syntax=docker/dockerfile:1.6
# Build stage
FROM node:20 AS builder

# Install build tools for native dependencies (sqlite3, prisma, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git pkg-config libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Configure npm settings for maximum performance and reliability
RUN npm config set fetch-timeout 300000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set maxsockets 15 && \
    npm config set progress false && \
    npm config set audit false && \
    npm config set fund false

WORKDIR /app

# Copy package files for better layer caching
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY biome.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --no-audit --no-fund

# Copy source code
COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client with correct binary targets
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build the application with optimizations
RUN npm run build

# Install only production dependencies
RUN npm ci --only=production --no-audit --no-fund

# Production stage
FROM node:20-slim AS production

# Add metadata labels
LABEL org.opencontainers.image.title="RSS Skull Bot"
LABEL org.opencontainers.image.description="Modern, high-performance RSS to Telegram bot with Reddit JSON API, deduplication, and bilingual commands"
LABEL org.opencontainers.image.version="0.5.0"
LABEL org.opencontainers.image.authors="Pablo Murad <runawaydevil@pm.me>"
LABEL org.opencontainers.image.url="https://github.com/runawaydevil/rssskull"
LABEL org.opencontainers.image.source="https://github.com/runawaydevil/rssskull"
LABEL org.opencontainers.image.documentation="https://github.com/runawaydevil/rssskull/blob/main/README.md"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="runawaydevil"

# Install curl and OpenSSL for health checks and Prisma compatibility
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

WORKDIR /app

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Copy entrypoint script if it exists
COPY --chown=nodejs:nodejs scripts/docker-entrypoint.sh ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8916

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8916/health || exit 1

# Start the application
CMD ["sh", "-c", "mkdir -p /app/data && export DATABASE_URL='file:/app/data/production.db' && npx prisma migrate deploy --schema=./prisma/schema.prisma && npx prisma generate --schema=./prisma/schema.prisma && node dist/main.js"]