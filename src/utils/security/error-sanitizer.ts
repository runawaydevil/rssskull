/**
 * Error Sanitizer
 * 
 * Provides safe error messages for user-facing output
 * that never expose tokens, credentials, or sensitive data.
 */

import { sanitizeString, sanitizeError } from './sanitizer.js';

/**
 * Get a safe error message that can be shown to users
 * without exposing sensitive information
 */
export function getSafeErrorMessage(error: Error | unknown): string {
  if (!(error instanceof Error)) {
    return 'An error occurred';
  }

  // Sanitize the error message
  const sanitizedMessage = sanitizeString(error.message);

  // If the message is empty or only contains redacted content, provide generic message
  if (!sanitizedMessage || sanitizedMessage.trim().length === 0 || 
      sanitizedMessage === '[REDACTED_TOKEN]' || 
      sanitizedMessage.includes('[REDACTED')) {
    return 'An internal error occurred. Please try again later.';
  }

  // Return sanitized message
  return sanitizedMessage;
}

/**
 * Get safe error details for logging (includes sanitized stack trace)
 */
export function getSafeErrorDetails(error: Error | unknown): {
  message: string;
  name: string;
  stack?: string;
} {
  if (!(error instanceof Error)) {
    return {
      message: 'Non-error object thrown',
      name: 'UnknownError',
    };
  }

  const sanitized = sanitizeError(error);

  return {
    message: sanitized.message,
    name: sanitized.name,
    stack: sanitized.stack,
  };
}

/**
 * Create a safe error object from any error
 */
export function createSafeError(error: Error | unknown): Error {
  if (error instanceof Error) {
    return sanitizeError(error);
  }

  return new Error('An unknown error occurred');
}
