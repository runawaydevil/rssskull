import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger/logger.service.js';

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType?: string;
  scope?: string;
}

export class TokenManagerService {
  private prisma: PrismaClient;
  private refreshLocks = new Map<string, Promise<TokenData | null>>();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get valid access token, refreshing if needed
   */
  async getValidToken(provider: string): Promise<string | null> {
    try {
      const authState = await this.prisma.authState.findUnique({
        where: { provider }
      });

      if (!authState?.accessToken) {
        logger.warn(`No token found for provider: ${provider}`);
        return null;
      }

      // Check if token is still valid (5 minutes buffer)
      const now = new Date();
      const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      if (authState.expiresAt && authState.expiresAt.getTime() - now.getTime() > bufferTime) {
        logger.debug(`Token for ${provider} is still valid`);
        return authState.accessToken;
      }

      // Token expired or about to expire, try to refresh
      logger.info(`Token for ${provider} expired or about to expire, attempting refresh`);
      const refreshedToken = await this.refreshToken(provider, authState.refreshToken || undefined);
      
      return refreshedToken?.accessToken || null;
    } catch (error) {
      // Error is sanitized by logger automatically
      logger.error(`Error getting valid token for ${provider}:`, error);
      return null;
    }
  }

  /**
   * Store token data in database
   */
  async storeToken(provider: string, tokenData: TokenData): Promise<void> {
    try {
      await this.prisma.authState.upsert({
        where: { provider },
        update: {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          tokenType: tokenData.tokenType,
          scope: tokenData.scope,
          updatedAt: new Date(),
        },
        create: {
          provider,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          tokenType: tokenData.tokenType,
          scope: tokenData.scope,
        },
      });

      logger.info(`Token stored for provider: ${provider}`);
    } catch (error) {
      // Error is sanitized by logger automatically
      logger.error(`Error storing token for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Refresh token using refresh token
   */
  private async refreshToken(provider: string, refreshToken?: string): Promise<TokenData | null> {
    if (!refreshToken) {
      logger.warn(`No refresh token available for ${provider}`);
      return null;
    }

    // Check if refresh is already in progress
    const existingRefresh = this.refreshLocks.get(provider);
    if (existingRefresh) {
      logger.debug(`Refresh already in progress for ${provider}, waiting...`);
      return existingRefresh;
    }

    // Start refresh process
    const refreshPromise = this.performRefresh(provider, refreshToken);
    this.refreshLocks.set(provider, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      this.refreshLocks.delete(provider);
    }
  }

  /**
   * Perform actual token refresh
   */
  private async performRefresh(provider: string, _refreshToken: string): Promise<TokenData | null> {
    try {
      // This is a generic implementation - each provider should implement its own refresh logic
      logger.info(`Refreshing token for ${provider}...`);
      
      // For Reddit, we would implement the refresh logic here
      // For now, return null to indicate refresh failed
      logger.warn(`Token refresh not implemented for ${provider}`);
      return null;
    } catch (error) {
      // Error is sanitized by logger automatically
      logger.error(`Error refreshing token for ${provider}:`, error);
      return null;
    }
  }

  /**
   * Clear token for provider
   */
  async clearToken(provider: string): Promise<void> {
    try {
      await this.prisma.authState.delete({
        where: { provider }
      });
      
      logger.info(`Token cleared for provider: ${provider}`);
    } catch (error) {
      logger.error(`Error clearing token for ${provider}:`, error);
    }
  }

  /**
   * Get token info without refreshing
   */
  async getTokenInfo(provider: string): Promise<{
    hasToken: boolean;
    expiresAt: Date | null;
    isExpired: boolean;
  }> {
    try {
      const authState = await this.prisma.authState.findUnique({
        where: { provider },
        select: { expiresAt: true }
      });

      if (!authState) {
        return { hasToken: false, expiresAt: null, isExpired: true };
      }

      const now = new Date();
      const isExpired = authState.expiresAt ? authState.expiresAt <= now : true;

      return {
        hasToken: true,
        expiresAt: authState.expiresAt,
        isExpired,
      };
    } catch (error) {
      logger.error(`Error getting token info for ${provider}:`, error);
      return { hasToken: false, expiresAt: null, isExpired: true };
    }
  }
}
