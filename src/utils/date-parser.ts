import { logger } from './logger/logger.service.js';

/**
 * Safely parse a date string, handling invalid formats
 */
export function parseDate(dateString: any): Date | undefined {
  if (!dateString) return undefined;
  
  try {
    // Check if it's a valid date string before parsing
    if (typeof dateString !== 'string' && typeof dateString !== 'number') {
      logger.warn(`Invalid date type: ${typeof dateString}`, { dateString });
      return undefined;
    }
    
    const dateStr = String(dateString).trim();
    
    // Handle Atom 1.0 ISO 8601 format specifically
    // Format: 2025-10-11T03:30:00Z or 2025-10-11T03:30:00-03:00
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/)) {
      logger.debug(`Parsing Atom 1.0 ISO 8601 date: ${dateStr}`);
    }
    
    // Use Date.parse for better validation
    const timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) {
      logger.warn(`Invalid date format: ${dateStr}`);
      return undefined;
    }
    
    const date = new Date(timestamp);
    
    // Double check the date is valid
    if (isNaN(date.getTime())) {
      logger.warn(`Invalid date after parsing: ${dateStr}`);
      return undefined;
    }
    
    // Log successful parsing for debugging
    logger.debug(`Successfully parsed date: ${dateStr} -> ${date.toISOString()}`);
    
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
