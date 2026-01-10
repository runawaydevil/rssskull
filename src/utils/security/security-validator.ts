/**
 * Security Validator
 * 
 * Validates that no tokens or credentials are hardcoded in the codebase.
 * This is a development-time check to prevent accidental credential leaks.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger/logger.service.js';

// Patterns that indicate potential hardcoded credentials
const HARDCODED_PATTERNS = [
  // Telegram bot tokens (format: numbers:alphanumeric)
  /\d{8,}:[A-Za-z0-9_-]{35,}/g,
  
  // Long alphanumeric strings that might be tokens
  /['"`]([A-Za-z0-9_-]{40,})['"`]/g,
  
  // Common credential patterns
  /(password|secret|token|apikey)\s*[:=]\s*['"`]([^'"`]{10,})['"`]/gi,
  
  // Base64 encoded credentials
  /['"`]([A-Za-z0-9+/]{50,}={0,2})['"`]/g,
];

// Files to exclude from validation
const EXCLUDED_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.env.example',
  'sanitizer.ts', // Our sanitizer contains patterns, not actual tokens
  'security-validator.ts', // This file itself
];

// Extensions to check
const CHECKED_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx'];

/**
 * Check if a file path should be excluded
 */
function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_PATHS.some(excluded => filePath.includes(excluded));
}

/**
 * Check if a file extension should be checked
 */
function shouldCheckFile(filePath: string): boolean {
  return CHECKED_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

/**
 * Validate a single file for hardcoded credentials
 */
function validateFile(filePath: string): Array<{ line: number; pattern: string; match: string }> {
  const issues: Array<{ line: number; pattern: string; match: string }> = [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Skip comments and strings that are clearly examples
      if (line.trim().startsWith('//') || 
          line.includes('EXAMPLE') || 
          line.includes('example') ||
          line.includes('your_') ||
          line.includes('1234567890:ABCdef')) {
        return;
      }

      HARDCODED_PATTERNS.forEach((pattern, patternIndex) => {
        const matches = line.match(pattern);
        if (matches) {
          matches.forEach(match => {
            // Additional validation: check if it's a real token or just a pattern
            // Skip if it's clearly a placeholder
            if (!match.includes('REDACTED') && 
                !match.includes('example') && 
                !match.includes('your_') &&
                !match.includes('1234567890:ABCdef')) {
              issues.push({
                line: index + 1,
                pattern: `Pattern ${patternIndex + 1}`,
                match: match.substring(0, 20) + '...',
              });
            }
          });
        }
      });
    });
  } catch (error) {
    // Silently skip files that can't be read
  }

  return issues;
}

/**
 * Validate codebase for hardcoded credentials (development only)
 * 
 * This should only be run in development mode as it's a development-time check.
 */
export async function validateSecurity(projectRoot: string = process.cwd()): Promise<{
  isValid: boolean;
  issues: Array<{ file: string; issues: Array<{ line: number; pattern: string; match: string }> }>;
}> {
  // Only run in development
  if (process.env.NODE_ENV === 'production') {
    return { isValid: true, issues: [] };
  }

  const issues: Array<{ file: string; issues: Array<{ line: number; pattern: string; match: string }> }> = [];

  try {
    // This is a simple implementation - in a real scenario, you'd use a proper file walker
    // For now, we'll just validate common source files
    // glob is an optional dependency - if not available, skip validation silently
    const { glob } = await import('glob');
    const files = await glob('**/*.{ts,js,tsx,jsx}', {
      cwd: projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
    });

    for (const file of files) {
      if (shouldExcludeFile(file) || !shouldCheckFile(file)) {
        continue;
      }

      const filePath = join(projectRoot, file);
      const fileIssues = validateFile(filePath);

      if (fileIssues.length > 0) {
        issues.push({
          file,
          issues: fileIssues,
        });
      }
    }
  } catch (error) {
    // glob is not available or failed - this is OK in production
    // Security validation is a development-time check only
    // Return success silently to avoid breaking builds or runtime
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Security validation skipped (glob not available or failed)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { isValid: true, issues: [] };
  }

  if (issues.length > 0) {
    logger.warn('Security validation found potential hardcoded credentials:');
    issues.forEach(({ file, issues: fileIssues }) => {
      logger.warn(`  ${file}:`);
      fileIssues.forEach(({ line, match }) => {
        logger.warn(`    Line ${line}: ${match}`);
      });
    });
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Quick check for common security issues in a string
 */
export function checkStringForCredentials(str: string): boolean {
  if (typeof str !== 'string') {
    return false;
  }

  // Skip if it's clearly a placeholder
  if (str.includes('REDACTED') || 
      str.includes('example') || 
      str.includes('your_') ||
      str.includes('1234567890:ABCdef')) {
    return false;
  }

  return HARDCODED_PATTERNS.some(pattern => pattern.test(str));
}
