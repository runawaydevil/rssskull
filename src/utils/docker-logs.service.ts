import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger/logger.service.js';

const execAsync = promisify(exec);

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  raw: string;
}

export class DockerLogsService {
  private readonly maxMessageLength = 4000; // Telegram message limit

  /**
   * Get recent logs from Docker container
   */
  async getRecentLogs(lines: number = 50): Promise<LogEntry[]> {
    try {
      // Try to get logs from Docker, but fallback to reading log files if Docker is not available
      let stdout = '';
      
      try {
        const result = await execAsync(
          `docker logs --tail ${lines} rss-skull-bot 2>&1`,
          { timeout: 10000 }
        );
        stdout = result.stdout;
      } catch (dockerError) {
        // Docker not available, try to read from log files
        logger.warn('Docker not available, trying to read from log files');
        
        try {
          const fs = await import('fs/promises');
          
          // Try to read from common log locations
          const logPaths = [
            '/app/logs/app.log',
            '/var/log/app.log',
            './logs/app.log',
            '/tmp/app.log'
          ];
          
          for (const logPath of logPaths) {
            try {
              const logContent = await fs.readFile(logPath, 'utf-8');
              const allLines = logContent.split('\n');
              const recentLines = allLines.slice(-lines);
              stdout = recentLines.join('\n');
              break;
            } catch (fileError) {
              // Continue to next path
            }
          }
          
          if (!stdout) {
            throw new Error('No log files found');
          }
        } catch (fileError) {
          throw new Error('Docker not available and no log files found');
        }
      }

      return this.parseLogs(stdout);
    } catch (error) {
      logger.error('Failed to get logs:', error);
      throw new Error('Failed to retrieve logs');
    }
  }

  /**
   * Get recent error logs from Docker container
   */
  async getErrorLogs(lines: number = 50): Promise<LogEntry[]> {
    try {
      let stdout = '';
      
      try {
        const result = await execAsync(
          `docker logs --tail ${lines * 2} rss-skull-bot 2>&1 | grep -i -E "(error|warn|failed|exception)" | tail -${lines}`,
          { timeout: 10000 }
        );
        stdout = result.stdout;
      } catch (dockerError) {
        // Docker not available, try to read from log files and filter
        logger.warn('Docker not available, trying to read error logs from files');
        
        try {
          const fs = await import('fs/promises');
          
          // Try to read from common log locations
          const logPaths = [
            '/app/logs/app.log',
            '/var/log/app.log',
            './logs/app.log',
            '/tmp/app.log'
          ];
          
          for (const logPath of logPaths) {
            try {
              const logContent = await fs.readFile(logPath, 'utf-8');
              const allLines = logContent.split('\n');
              const errorLines = allLines.filter(line => 
                /error|warn|failed|exception/i.test(line)
              ).slice(-lines);
              stdout = errorLines.join('\n');
              break;
            } catch (fileError) {
              // Continue to next path
            }
          }
          
          if (!stdout) {
            throw new Error('No error log files found');
          }
        } catch (fileError) {
          throw new Error('Docker not available and no error log files found');
        }
      }

      return this.parseLogs(stdout);
    } catch (error) {
      logger.error('Failed to get error logs:', error);
      throw new Error('Failed to retrieve error logs');
    }
  }

  /**
   * Parse raw log output into structured entries
   */
  private parseLogs(rawLogs: string): LogEntry[] {
    const lines = rawLogs.trim().split('\n');
    const entries: LogEntry[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // Try to parse structured logs with timestamps
      const timestampMatch = line.match(/^\[([^\]]+)\]/);
      if (timestampMatch && timestampMatch[1]) {
        const timestamp = timestampMatch[1];
        const remaining = line.substring(timestampMatch[0].length).trim();
        
        // Try to parse level
        const levelMatch = remaining.match(/^\[([A-Z]+)\]/);
        if (levelMatch && levelMatch[1]) {
          const level = levelMatch[1];
          const message = remaining.substring(levelMatch[0].length).trim();
          
          entries.push({
            timestamp,
            level,
            message,
            raw: line,
          });
          continue;
        }
      }

      // Fallback for unstructured logs
      entries.push({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: line,
        raw: line,
      });
    }

    return entries;
  }

  /**
   * Format logs for Telegram display
   */
  formatLogsForTelegram(entries: LogEntry[], title: string): string {
    if (entries.length === 0) {
      return `📋 **${title}**\n\n❌ Nenhum log encontrado.`;
    }

    let message = `📋 **${title}**\n\n`;
    let currentLength = message.length;

    for (const entry of entries) {
      const emoji = this.getLevelEmoji(entry.level);
      const timestamp = this.formatTimestamp(entry.timestamp);
      
      // Truncate message if too long
      let displayMessage = entry.message;
      if (displayMessage.length > 200) {
        displayMessage = displayMessage.substring(0, 197) + '...';
      }

      const logLine = `${emoji} \`${timestamp}\` ${displayMessage}\n`;
      
      // Check if adding this line would exceed Telegram's limit
      if (currentLength + logLine.length > this.maxMessageLength) {
        message += '\n... (logs truncados)';
        break;
      }
      
      message += logLine;
      currentLength += logLine.length;
    }

    return message;
  }

  /**
   * Get emoji for log level
   */
  private getLevelEmoji(level: string): string {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return '🔴';
      case 'WARN':
        return '🟡';
      case 'INFO':
        return '🔵';
      case 'DEBUG':
        return '⚪';
      default:
        return '📝';
    }
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timestamp.substring(11, 19); // Extract time part
    }
  }

}

// Singleton instance
export const dockerLogsService = new DockerLogsService();
