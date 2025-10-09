#!/bin/bash

# RSS Skull Bot v2 - Git Setup Script
# This script prepares the project for Git repository

set -e

echo "🚀 Setting up RSS Skull Bot v2 for Git repository..."

# Initialize git if not already initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
    echo "✅ Git repository initialized"
else
    echo "📦 Git repository already exists"
fi

# Add remote origin if provided
if [ ! -z "$1" ]; then
    echo "🔗 Adding remote origin: $1"
    git remote add origin "$1" 2>/dev/null || git remote set-url origin "$1"
    echo "✅ Remote origin configured"
fi

# Create initial commit if no commits exist
if ! git rev-parse HEAD >/dev/null 2>&1; then
    echo "📝 Creating initial commit..."
    
    # Add all files
    git add .
    
    # Create initial commit
    git commit -m "🎉 Initial commit: RSS Skull Bot v2

- Modern TypeScript architecture with grammY and Fastify
- Bilingual support (Portuguese/English)
- Smart URL conversion (Reddit, YouTube)
- Advanced filtering system with regex support
- Background job processing with BullMQ + Redis
- Production-ready Docker deployment
- Comprehensive migration tools from v1
- Full test coverage and documentation

Tech Stack:
- Node.js 20+ with TypeScript 5.6+
- grammY (Telegram bot framework)
- Fastify (web server)
- Prisma + SQLite (database)
- BullMQ + Redis (job queue)
- Docker + Nginx (deployment)
- Vitest (testing)
- Biome (linting/formatting)"
    
    echo "✅ Initial commit created"
else
    echo "📝 Repository already has commits"
fi

echo ""
echo "🎉 Git setup completed!"
echo ""
echo "Next steps:"
echo "1. Push to repository: git push -u origin main"
echo "2. Create development branch: git checkout -b develop"
echo "3. Start developing: npm run dev"
echo ""
echo "Repository is ready for: https://github.com/runawaydevil/rssskull.git"