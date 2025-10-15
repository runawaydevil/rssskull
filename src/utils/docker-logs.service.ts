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
      const { stdout } = await execAsync(
        `docker logs --tail ${lines} rss-skull-bot 2>&1`,
        { timeout: 10000 }
      );

      return this.parseLogs(stdout);
    } catch (error) {
      logger.error('Failed to get Docker logs:', error);
      throw new Error('Failed to retrieve logs from Docker container');
    }
  }

  /**
   * Get recent error logs from Docker container
   */
  async getErrorLogs(lines: number = 50): Promise<LogEntry[]> {
    try {
      const { stdout } = await execAsync(
        `docker logs --tail ${lines * 2} rss-skull-bot 2>&1 | grep -i -E "(error|warn|failed|exception)" | tail -${lines}`,
        { timeout: 10000 }
      );

      return this.parseLogs(stdout);
    } catch (error) {
      logger.error('Failed to get Docker error logs:', error);
      throw new Error('Failed to retrieve error logs from Docker container');
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
