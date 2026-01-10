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
    
    // Skip obviously invalid values
    if (dateStr === 'null' || dateStr === 'undefined' || dateStr === '' || 
        dateStr === '-infinity' || dateStr === 'infinity' || dateStr === 'NaN') {
      logger.warn(`Skipping invalid date value: ${dateStr}`);
      return undefined;
    }
    
    // Handle Atom 1.0 ISO 8601 format specifically
    // Format: 2025-10-11T03:30:00Z or 2025-10-11T03:30:00-03:00
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/)) {
      logger.debug(`Parsing Atom 1.0 ISO 8601 date: ${dateStr}`);
    }
    
    // Try multiple parsing approaches with fallback
    let timestamp: number;
    
    // First try: Date.parse (handles most standard formats)
    timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) {
      // Second try: Parse as timestamp (number)
      const numTimestamp = parseInt(dateStr, 10);
      if (!isNaN(numTimestamp)) {
        timestamp = numTimestamp;
        logger.debug(`Parsing as timestamp: ${dateStr}`);
      } else {
        // Third try: Try to fix common malformed dates
        const fixedDateStr = fixMalformedDate(dateStr);
        if (fixedDateStr !== dateStr) {
          logger.debug(`Attempting to fix malformed date: ${dateStr} -> ${fixedDateStr}`);
          timestamp = Date.parse(fixedDateStr);
        } else {
          logger.warn(`Invalid date format: ${dateStr}`);
          return undefined;
        }
      }
    }
    
    if (isNaN(timestamp)) {
      logger.warn(`Invalid date format after all attempts: ${dateStr}`);
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
 * Attempt to fix common malformed date formats
 */
function fixMalformedDate(dateStr: string): string {
  // Fix common Reddit date issues
  // Example: "2012-12-04T0-2:38:00-08:00" -> "2012-12-04T02:38:00-08:00"
  let fixed = dateStr;
  
  // Fix malformed hour: T0-2 -> T02
  fixed = fixed.replace(/T(\d)-(\d):/, 'T0$1$2:');
  
  // Fix malformed hour: T-2 -> T02
  fixed = fixed.replace(/T-(\d):/, 'T0$1:');
  
  // Fix missing leading zeros in time components
  fixed = fixed.replace(/T(\d):(\d):(\d)/, (_, h, m, s) => {
    const hour = h.padStart(2, '0');
    const minute = m.padStart(2, '0');
    const second = s.padStart(2, '0');
    return `T${hour}:${minute}:${second}`;
  });
  
  return fixed;
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
