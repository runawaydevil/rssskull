#!/bin/bash

# RSS Skull Bot v2 - Backup Script
# This script creates backups of the database and important data

set -e

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="rss-skull-backup-${TIMESTAMP}"
DATABASE_PATH="./prisma/production.db"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Create backup directory
create_backup_dir() {
    log "Creating backup directory..."
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
    success "Backup directory created: $BACKUP_DIR/$BACKUP_NAME"
}

# Backup database
backup_database() {
    log "Backing up database..."
    
    if [ -f "$DATABASE_PATH" ]; then
        cp "$DATABASE_PATH" "$BACKUP_DIR/$BACKUP_NAME/production.db"
        success "Database backed up successfully"
    else
        warning "Database file not found: $DATABASE_PATH"
    fi
}

# Backup configuration files
backup_config() {
    log "Backing up configuration files..."
    
    # Backup environment files (without sensitive data)
    if [ -f ".env.example" ]; then
        cp ".env.example" "$BACKUP_DIR/$BACKUP_NAME/"
    fi
    
    if [ -f ".env.production" ]; then
        cp ".env.production" "$BACKUP_DIR/$BACKUP_NAME/"
    fi
    
    # Backup Docker configurations
    cp docker-compose*.yml "$BACKUP_DIR/$BACKUP_NAME/" 2>/dev/null || true
    
    # Backup Nginx configuration
    if [ -d "nginx" ]; then
        cp -r nginx "$BACKUP_DIR/$BACKUP_NAME/" 2>/dev/null || true
    fi
    
    success "Configuration files backed up"
}

# Backup logs
backup_logs() {
    log "Backing up recent logs..."
    
    if [ -d "logs" ]; then
        # Only backup logs from last 7 days
        find logs -name "*.log" -mtime -7 -exec cp {} "$BACKUP_DIR/$BACKUP_NAME/" \; 2>/dev/null || true
        success "Recent logs backed up"
    else
        warning "Logs directory not found"
    fi
}

# Create backup archive
create_archive() {
    log "Creating backup archive..."
    
    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
    rm -rf "$BACKUP_NAME"
    
    success "Backup archive created: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
}

# Cleanup old backups (keep last 10)
cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    cd "$BACKUP_DIR"
    ls -t rss-skull-backup-*.tar.gz 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
    
    success "Old backups cleaned up (keeping last 10)"
}

# Get backup size
get_backup_size() {
    if [ -f "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" ]; then
        SIZE=$(du -h "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" | cut -f1)
        log "Backup size: $SIZE"
    fi
}

# Main backup process
main() {
    log "Starting RSS Skull Bot v2 backup process..."
    
    create_backup_dir
    backup_database
    backup_config
    backup_logs
    create_archive
    cleanup_old_backups
    get_backup_size
    
    success "🎉 Backup completed successfully!"
    log "Backup location: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
}

# Handle script arguments
case "${1:-backup}" in
    "backup")
        main
        ;;
    "restore")
        if [ -z "$2" ]; then
            error "Usage: $0 restore <backup-file>"
        fi
        
        BACKUP_FILE="$2"
        if [ ! -f "$BACKUP_FILE" ]; then
            error "Backup file not found: $BACKUP_FILE"
        fi
        
        log "Restoring from backup: $BACKUP_FILE"
        tar -xzf "$BACKUP_FILE" -C "$BACKUP_DIR"
        
        # Extract backup name from file
        RESTORE_NAME=$(basename "$BACKUP_FILE" .tar.gz)
        
        # Restore database
        if [ -f "$BACKUP_DIR/$RESTORE_NAME/production.db" ]; then
            cp "$BACKUP_DIR/$RESTORE_NAME/production.db" "$DATABASE_PATH"
            success "Database restored"
        fi
        
        success "🎉 Restore completed successfully!"
        ;;
    "list")
        log "Available backups:"
        ls -la "$BACKUP_DIR"/rss-skull-backup-*.tar.gz 2>/dev/null || echo "No backups found"
        ;;
    *)
        echo "Usage: $0 {backup|restore <file>|list}"
        echo ""
        echo "Commands:"
        echo "  backup          - Create a new backup"
        echo "  restore <file>  - Restore from backup file"
        echo "  list            - List available backups"
        exit 1
        ;;
esac