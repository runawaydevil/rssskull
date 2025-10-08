import type { RSSItem } from '../../services/rss.service.js';
import { logger } from '../logger/logger.service.js';
import type {
  FeedFilter,
  FilterResult,
  FilterStats,
  FilterValidationResult,
} from './filter.types.js';
import { MAX_FILTERS_PER_FEED, MAX_PATTERN_LENGTH } from './filter.types.js';

export class FilterService {
  /**
   * Apply filters to RSS items
   * Returns only items that pass all filters
   */
  applyFilters(items: RSSItem[], filters: FeedFilter[]): RSSItem[] {
    if (!filters || filters.length === 0) {
      return items;
    }

    const includeFilters = filters.filter((f) => f.type === 'include');
    const excludeFilters = filters.filter((f) => f.type === 'exclude');

    logger.debug(
      `Applying ${filters.length} filters (${includeFilters.length} include, ${excludeFilters.length} exclude) to ${items.length} items`
    );

    const filteredItems = items.filter((item) => {
      // First apply include filters - if any exist, item must match at least one
      if (includeFilters.length > 0) {
        const includeResult = this.checkIncludeFilters(item, includeFilters);
        if (!includeResult.passed) {
          logger.debug(
            `Item "${item.title}" filtered out by include filters: ${includeResult.reason}`
          );
          return false;
        }
      }

      // Then apply exclude filters - item must not match any
      if (excludeFilters.length > 0) {
        const excludeResult = this.checkExcludeFilters(item, excludeFilters);
        if (!excludeResult.passed) {
          logger.debug(
            `Item "${item.title}" filtered out by exclude filters: ${excludeResult.reason}`
          );
          return false;
        }
      }

      return true;
    });

    logger.debug(
      `Filtering complete: ${filteredItems.length}/${items.length} items passed filters`
    );
    return filteredItems;
  }

  /**
   * Check if an item passes include filters
   * Item must match at least one include filter to pass
   */
  private checkIncludeFilters(item: RSSItem, includeFilters: FeedFilter[]): FilterResult {
    for (const filter of includeFilters) {
      if (this.matchesFilter(item, filter)) {
        return { passed: true };
      }
    }

    return {
      passed: false,
      reason: `No include filters matched`,
    };
  }

  /**
   * Check if an item passes exclude filters
   * Item must not match any exclude filter to pass
   */
  private checkExcludeFilters(item: RSSItem, excludeFilters: FeedFilter[]): FilterResult {
    for (const filter of excludeFilters) {
      if (this.matchesFilter(item, filter)) {
        return {
          passed: false,
          reason: `Matched exclude filter: ${filter.pattern}`,
        };
      }
    }

    return { passed: true };
  }

  /**
   * Check if an RSS item matches a specific filter
   */
  private matchesFilter(item: RSSItem, filter: FeedFilter): boolean {
    try {
      const searchText = this.getSearchableText(item);

      if (filter.isRegex) {
        const regex = new RegExp(filter.pattern, 'i'); // Case insensitive
        return regex.test(searchText);
      } else {
        // Simple string matching (case insensitive)
        return searchText.toLowerCase().includes(filter.pattern.toLowerCase());
      }
    } catch (error) {
      logger.warn(`Error matching filter "${filter.pattern}":`, error);
      return false;
    }
  }

  /**
   * Get searchable text from RSS item
   * Combines title, description, and categories for filtering
   */
  private getSearchableText(item: RSSItem): string {
    const parts = [
      item.title || '',
      item.description || '',
      item.author || '',
      ...(item.categories || []),
    ];

    return parts.join(' ').trim();
  }

  /**
   * Validate a filter pattern
   */
  validateFilter(
    type: 'include' | 'exclude',
    pattern: string,
    isRegex: boolean
  ): FilterValidationResult {
    // Check pattern length
    if (!pattern || pattern.trim().length === 0) {
      return {
        valid: false,
        error: 'Filter pattern cannot be empty',
      };
    }

    if (pattern.length > MAX_PATTERN_LENGTH) {
      return {
        valid: false,
        error: `Filter pattern too long (max ${MAX_PATTERN_LENGTH} characters)`,
      };
    }

    // Validate regex if specified
    if (isRegex) {
      try {
        new RegExp(pattern, 'i');
      } catch (error) {
        return {
          valid: false,
          error: `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    }

    // Validate filter type
    if (type !== 'include' && type !== 'exclude') {
      return {
        valid: false,
        error: 'Filter type must be either "include" or "exclude"',
      };
    }

    return { valid: true };
  }

  /**
   * Check if adding a new filter would exceed the limit
   */
  validateFilterLimit(existingFilters: FeedFilter[]): FilterValidationResult {
    if (existingFilters.length >= MAX_FILTERS_PER_FEED) {
      return {
        valid: false,
        error: `Maximum ${MAX_FILTERS_PER_FEED} filters allowed per feed`,
      };
    }

    return { valid: true };
  }

  /**
   * Get statistics about filters for a feed
   */
  getFilterStats(filters: FeedFilter[]): FilterStats {
    return {
      totalFilters: filters.length,
      includeFilters: filters.filter((f) => f.type === 'include').length,
      excludeFilters: filters.filter((f) => f.type === 'exclude').length,
      regexFilters: filters.filter((f) => f.isRegex).length,
    };
  }

  /**
   * Test a filter against sample text
   * Useful for testing filters before applying them
   */
  testFilter(filter: FeedFilter, sampleText: string): boolean {
    const mockItem: RSSItem = {
      id: 'test',
      title: sampleText,
      link: '',
      description: sampleText,
    };

    return this.matchesFilter(mockItem, filter);
  }
}

// Singleton instance
export const filterService = new FilterService();
