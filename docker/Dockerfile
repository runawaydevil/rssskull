# Multi-stage build for RSS Skull Bot (Python)
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency files
COPY requirements.txt pyproject.toml ./

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs -m -d /home/nodejs nodejs

# Set working directory
WORKDIR /app

# Copy Python environment from builder
COPY --from=builder --chown=nodejs:nodejs /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder --chown=nodejs:nodejs /usr/local/bin /usr/local/bin

# Copy application code
COPY --chown=nodejs:nodejs app/ ./app/
COPY --chown=nodejs:nodejs run.py ./
COPY --chown=nodejs:nodejs pyproject.toml ./

# Create data directory
RUN mkdir -p /app/data /home/nodejs/.npm && \
    chown nodejs:nodejs /app/data /home/nodejs/.npm && \
    chown -R nodejs:nodejs /home/nodejs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8916

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=10 \
    CMD curl -f http://localhost:8916/health || exit 1

# Run application
CMD ["python", "run.py"]

