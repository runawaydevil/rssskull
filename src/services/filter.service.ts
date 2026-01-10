import type { FeedFilter, PrismaClient } from '@prisma/client';
import { FeedRepository } from '../database/repositories/feed.repository.js';
import {
  type CreateFilterInput,
  FilterRepository,
  type UpdateFilterInput,
} from '../database/repositories/filter.repository.js';
import { filterService as filterUtils } from '../utils/filters/filter.service.js';
import type { FilterStats } from '../utils/filters/filter.types.js';
import { logger } from '../utils/logger/logger.service.js';
import {
  addFilterSchema,
  sanitizeFilterPattern,
  testFilterSchema,
  validateRegexPattern,
} from '../utils/validators/filter.schemas.js';

export interface AddFilterInput {
  feedId: string;
  type: 'include' | 'exclude';
  pattern: string;
  isRegex?: boolean;
}

export interface FilterManagementResult {
  success: boolean;
  filter?: FeedFilter;
  message: string;
  errors?: string[];
}

export interface FilterListResult {
  success: boolean;
  filters: FeedFilter[];
  stats: FilterStats;
  message?: string;
}

export class FilterService {
  private filterRepository: FilterRepository;
  private feedRepository: FeedRepository;

  constructor(prisma: PrismaClient) {
    this.filterRepository = new FilterRepository(prisma);
    this.feedRepository = new FeedRepository(prisma);
  }

  /**
   * Add a new filter to a feed with validation
   */
  async addFilter(input: AddFilterInput): Promise<FilterManagementResult> {
    try {
      // Validate input schema
      const validationResult = addFilterSchema.safeParse(input);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => e.message);
        return {
          success: false,
          message: errors.join(', '),
          errors,
        };
      }

      const validatedInput = validationResult.data;

      // Validate feed exists
      const feed = await this.feedRepository.findById(validatedInput.feedId);
      if (!feed) {
        return {
          success: false,
          message: 'Feed not found',
        };
      }

      // Get existing filters for validation
      const existingFilters = await this.filterRepository.findByFeedId(validatedInput.feedId);

      // Validate filter limit
      const limitValidation = filterUtils.validateFilterLimit(
        existingFilters.map((f) => ({
          id: f.id,
          feedId: f.feedId,
          type: f.type as 'include' | 'exclude',
          pattern: f.pattern,
          isRegex: f.isRegex,
        }))
      );
      if (!limitValidation.valid) {
        return {
          success: false,
          message: limitValidation.error || 'Filter limit exceeded',
        };
      }

      // Validate regex pattern if specified
      if (validatedInput.isRegex) {
        const regexValidation = validateRegexPattern(validatedInput.pattern);
        if (!regexValidation.valid) {
          return {
            success: false,
            message: regexValidation.error || 'Invalid regex pattern',
          };
        }
      }

      // Sanitize pattern
      const sanitizedPattern = sanitizeFilterPattern(validatedInput.pattern);

      // Check for duplicate filters
      const duplicate = await this.filterRepository.findDuplicate(
        validatedInput.feedId,
        validatedInput.type,
        sanitizedPattern
      );
      if (duplicate) {
        return {
          success: false,
          message: 'A filter with this pattern already exists for this feed',
        };
      }

      // Create the filter
      const filterData: CreateFilterInput = {
        feedId: validatedInput.feedId,
        type: validatedInput.type,
        pattern: sanitizedPattern,
        isRegex: validatedInput.isRegex,
      };

      const filter = await this.filterRepository.create(filterData);

      logger.info(
        `Filter added successfully: ${filter.type} "${filter.pattern}" for feed ${validatedInput.feedId}`
      );

      return {
        success: true,
        filter,
        message: `${validatedInput.type} filter added successfully`,
      };
    } catch (error) {
      logger.error('Error adding filter:', error);
      return {
        success: false,
        message: 'Failed to add filter due to internal error',
      };
    }
  }

  /**
   * Remove a filter by ID
   */
  async removeFilter(filterId: string, feedId?: string): Promise<FilterManagementResult> {
    try {
      const filter = await this.filterRepository.findById(filterId);
      if (!filter) {
        return {
          success: false,
          message: 'Filter not found',
        };
      }

      // Optional: Verify the filter belongs to the specified feed
      if (feedId && filter.feedId !== feedId) {
        return {
          success: false,
          message: 'Filter does not belong to the specified feed',
        };
      }

      await this.filterRepository.delete(filterId);

      logger.info(`Filter removed successfully: ${filter.type} "${filter.pattern}" (${filterId})`);

      return {
        success: true,
        message: 'Filter removed successfully',
      };
    } catch (error) {
      logger.error('Error removing filter:', error);
      return {
        success: false,
        message: 'Failed to remove filter due to internal error',
      };
    }
  }

  /**
   * List all filters for a feed with statistics
   */
  async listFilters(feedId: string): Promise<FilterListResult> {
    try {
      // Validate feed exists
      const feed = await this.feedRepository.findById(feedId);
      if (!feed) {
        return {
          success: false,
          filters: [],
          stats: { totalFilters: 0, includeFilters: 0, excludeFilters: 0, regexFilters: 0 },
          message: 'Feed not found',
        };
      }

      const filters = await this.filterRepository.findByFeedId(feedId);
      const stats = filterUtils.getFilterStats(
        filters.map((f) => ({
          id: f.id,
          feedId: f.feedId,
          type: f.type as 'include' | 'exclude',
          pattern: f.pattern,
          isRegex: f.isRegex,
        }))
      );

      return {
        success: true,
        filters,
        stats,
      };
    } catch (error) {
      logger.error('Error listing filters:', error);
      return {
        success: false,
        filters: [],
        stats: { totalFilters: 0, includeFilters: 0, excludeFilters: 0, regexFilters: 0 },
        message: 'Failed to list filters due to internal error',
      };
    }
  }

  /**
   * Update a filter pattern
   */
  async updateFilter(
    filterId: string,
    pattern: string,
    isRegex?: boolean
  ): Promise<FilterManagementResult> {
    try {
      const filter = await this.filterRepository.findById(filterId);
      if (!filter) {
        return {
          success: false,
          message: 'Filter not found',
        };
      }

      // Validate new pattern
      const patternValidation = filterUtils.validateFilter(
        filter.type as 'include' | 'exclude',
        pattern,
        isRegex ?? filter.isRegex
      );
      if (!patternValidation.valid) {
        return {
          success: false,
          message: patternValidation.error || 'Invalid filter pattern',
        };
      }

      // Check for duplicate with new pattern (excluding current filter)
      const existingFilters = await this.filterRepository.findByFeedId(filter.feedId);
      const duplicate = existingFilters.find(
        (f) => f.id !== filterId && f.type === filter.type && f.pattern === pattern.trim()
      );

      if (duplicate) {
        return {
          success: false,
          message: 'A filter with this pattern already exists for this feed',
        };
      }

      const updateData: UpdateFilterInput = {
        pattern: pattern.trim(),
        ...(isRegex !== undefined && { isRegex }),
      };

      const updatedFilter = await this.filterRepository.update(filterId, updateData);

      logger.info(
        `Filter updated successfully: ${updatedFilter.type} "${updatedFilter.pattern}" (${filterId})`
      );

      return {
        success: true,
        filter: updatedFilter,
        message: 'Filter updated successfully',
      };
    } catch (error) {
      logger.error('Error updating filter:', error);
      return {
        success: false,
        message: 'Failed to update filter due to internal error',
      };
    }
  }

  /**
   * Remove all filters for a feed
   */
  async clearFilters(feedId: string): Promise<FilterManagementResult> {
    try {
      // Validate feed exists
      const feed = await this.feedRepository.findById(feedId);
      if (!feed) {
        return {
          success: false,
          message: 'Feed not found',
        };
      }

      const deletedCount = await this.filterRepository.deleteByFeedId(feedId);

      logger.info(`Cleared ${deletedCount} filters for feed ${feedId}`);

      return {
        success: true,
        message: `Cleared ${deletedCount} filter(s) successfully`,
      };
    } catch (error) {
      logger.error('Error clearing filters:', error);
      return {
        success: false,
        message: 'Failed to clear filters due to internal error',
      };
    }
  }

  /**
   * Test a filter pattern against sample text
   */
  async testFilter(
    type: 'include' | 'exclude',
    pattern: string,
    isRegex: boolean,
    sampleText: string
  ): Promise<{
    success: boolean;
    matches: boolean;
    message: string;
    error?: string;
  }> {
    try {
      // Validate input schema
      const validationResult = testFilterSchema.safeParse({ type, pattern, isRegex, sampleText });
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((e) => e.message);
        return {
          success: false,
          matches: false,
          message: 'Invalid input',
          error: errors.join(', '),
        };
      }

      const validatedInput = validationResult.data;

      // Validate regex pattern if specified
      if (validatedInput.isRegex) {
        const regexValidation = validateRegexPattern(validatedInput.pattern);
        if (!regexValidation.valid) {
          return {
            success: false,
            matches: false,
            message: 'Invalid regex pattern',
            error: regexValidation.error,
          };
        }
      }

      const mockFilter = {
        id: 'test',
        feedId: 'test',
        type: validatedInput.type,
        pattern: sanitizeFilterPattern(validatedInput.pattern),
        isRegex: validatedInput.isRegex,
      };

      const matches = filterUtils.testFilter(mockFilter, validatedInput.sampleText);

      return {
        success: true,
        matches,
        message: matches
          ? 'Pattern matches the sample text'
          : 'Pattern does not match the sample text',
      };
    } catch (error) {
      logger.error('Error testing filter:', error);
      return {
        success: false,
        matches: false,
        message: 'Failed to test filter',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get filter statistics for a feed
   */
  async getFilterStats(feedId: string): Promise<{
    success: boolean;
    stats?: FilterStats & {
      maxFilters: number;
      remainingSlots: number;
    };
    message?: string;
  }> {
    try {
      const filters = await this.filterRepository.findByFeedId(feedId);
      const baseStats = filterUtils.getFilterStats(
        filters.map((f) => ({
          id: f.id,
          feedId: f.feedId,
          type: f.type as 'include' | 'exclude',
          pattern: f.pattern,
          isRegex: f.isRegex,
        }))
      );

      const stats = {
        ...baseStats,
        maxFilters: 10, // MAX_FILTERS_PER_FEED from filter.types.ts
        remainingSlots: 10 - baseStats.totalFilters,
      };

      return {
        success: true,
        stats,
      };
    } catch (error) {
      logger.error('Error getting filter stats:', error);
      return {
        success: false,
        message: 'Failed to get filter statistics',
      };
    }
  }

  /**
   * Validate if a feed can have more filters added
   */
  async canAddFilter(feedId: string): Promise<{
    canAdd: boolean;
    reason?: string;
    currentCount: number;
    maxAllowed: number;
  }> {
    try {
      const currentCount = await this.filterRepository.countByFeedId(feedId);
      const maxAllowed = 10; // MAX_FILTERS_PER_FEED

      return {
        canAdd: currentCount < maxAllowed,
        reason:
          currentCount >= maxAllowed ? `Maximum ${maxAllowed} filters allowed per feed` : undefined,
        currentCount,
        maxAllowed,
      };
    } catch (error) {
      logger.error('Error checking filter limit:', error);
      return {
        canAdd: false,
        reason: 'Failed to check filter limit',
        currentCount: 0,
        maxAllowed: 10,
      };
    }
  }

  /**
   * Get the filter utility service for direct access to filtering logic
   */
  getFilterUtils() {
    return filterUtils;
  }
}
