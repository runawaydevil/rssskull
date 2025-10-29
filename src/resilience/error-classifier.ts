import { TelegramError, TelegramErrorType } from './types.js';
import { logger } from '../utils/logger/logger.service.js';

/**
 * Classifies Telegram API errors and creates TelegramError objects
 */
export class TelegramErrorClassifier {
  /**
   * Classifies a raw error into a TelegramError with proper type
   */
  static classifyError(error: any, method: string = 'unknown', payload: any = null): TelegramError {
    const timestamp = new Date();
    
    // Handle grammY errors
    if (error?.error_code && error?.description) {
      const code = error.error_code;
      const description = error.description;
      
      const telegramError: TelegramError = {
        code,
        description,
        method,
        payload,
        timestamp,
        retryCount: 0,
        errorType: this.getErrorType(code, description),
        originalError: error
      };

      logger.error('Telegram API error classified', {
        code,
        description,
        method,
        errorType: telegramError.errorType,
        timestamp: timestamp.toISOString()
      });

      return telegramError;
    }

    // Handle network errors
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT') {
      const telegramError: TelegramError = {
        code: 0,
        description: `Network error: ${error.code} - ${error.message}`,
        method,
        payload,
        timestamp,
        retryCount: 0,
        errorType: error.code === 'ETIMEDOUT' ? TelegramErrorType.TIMEOUT : TelegramErrorType.CONNECTION_REFUSED,
        originalError: error
      };

      logger.error('Network error classified', {
        networkCode: error.code,
        message: error.message,
        method,
        errorType: telegramError.errorType
      });

      return telegramError;
    }

    // Handle generic errors
    const telegramError: TelegramError = {
      code: 0,
      description: error?.message || 'Unknown error',
      method,
      payload,
      timestamp,
      retryCount: 0,
      errorType: TelegramErrorType.NETWORK_ERROR,
      originalError: error
    };

    logger.error('Generic error classified as network error', {
      message: error?.message,
      method,
      errorType: telegramError.errorType
    });

    return telegramError;
  }

  /**
   * Determines the error type based on HTTP status code and description
   */
  private static getErrorType(code: number, _description: string): TelegramErrorType {
    // Rate limiting
    if (code === 429) {
      return TelegramErrorType.RATE_LIMITED;
    }

    // Network errors (Bad Gateway, Service Unavailable, Gateway Timeout)
    if (code === 502 || code === 503 || code === 504) {
      return TelegramErrorType.NETWORK_ERROR;
    }

    // Server errors (5xx)
    if (code >= 500 && code < 600) {
      return TelegramErrorType.SERVER_ERROR;
    }

    // Client errors (4xx) - except 408 (Request Timeout)
    if (code >= 400 && code < 500) {
      if (code === 408) {
        return TelegramErrorType.TIMEOUT;
      }
      return TelegramErrorType.CLIENT_ERROR;
    }

    // Default to network error for unknown codes
    return TelegramErrorType.NETWORK_ERROR;
  }

  /**
   * Checks if an error is recoverable based on its type
   */
  static isRecoverable(error: TelegramError): boolean {
    switch (error.errorType) {
      case TelegramErrorType.NETWORK_ERROR:
      case TelegramErrorType.RATE_LIMITED:
      case TelegramErrorType.SERVER_ERROR:
      case TelegramErrorType.TIMEOUT:
      case TelegramErrorType.CONNECTION_REFUSED:
        return true;
      case TelegramErrorType.CLIENT_ERROR:
        // Only 408 Request Timeout is recoverable among client errors
        return error.code === 408;
      default:
        return false;
    }
  }

  /**
   * Extracts retry delay from Retry-After header for rate limiting
   */
  static getRetryAfterDelay(error: TelegramError): number | null {
    if (error.errorType !== TelegramErrorType.RATE_LIMITED) {
      return null;
    }

    // Try to extract from error parameters (grammY format)
    const originalError = error.originalError as any;
    if (originalError?.parameters?.retry_after) {
      return originalError.parameters.retry_after * 1000; // Convert to milliseconds
    }

    // Default delay for rate limiting if no Retry-After header
    return 60000; // 1 minute
  }
}