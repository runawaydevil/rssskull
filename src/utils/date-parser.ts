import { logger } from './logger/logger.service.js';

/**
 * Safely parse a date string, handling invalid formats
 */
export function parseDate(dateString: any): Date | undefined {
  if (!dateString) return undefined;
  
  try {
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      logger.warn(`Invalid date format: ${dateString}`);
      return undefined;
    }
    
    return date;
  } catch (error) {
    logger.warn(`Error parsing date: ${dateString}`, error);
    return undefined;
  }
}

/**
 * Format a date for display
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
