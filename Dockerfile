# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY biome.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client with correct binary targets
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build the application
RUN npm run build

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:20-slim AS production

# Add metadata labels
LABEL org.opencontainers.image.title="RSS Skull Bot"
LABEL org.opencontainers.image.description="Modern, high-performance RSS to Telegram bot with channel support and bilingual commands"
LABEL org.opencontainers.image.version="0.02.5"
LABEL org.opencontainers.image.authors="Pablo Murad <runawaydevil@pm.me>"
LABEL org.opencontainers.image.url="https://github.com/runawaydevil/rssskull"
LABEL org.opencontainers.image.source="https://github.com/runawaydevil/rssskull"
LABEL org.opencontainers.image.documentation="https://github.com/runawaydevil/rssskull/blob/main/README.md"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="runawaydevil"

# Install curl and OpenSSL for health checks and Prisma compatibility
RUN apt-get update && apt-get install -y curl openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8916

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8916/health || exit 1

# Copy entrypoint script
COPY --chown=nodejs:nodejs scripts/docker-entrypoint.sh ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh

# Start the application
CMD ["./scripts/docker-entrypoint.sh"]