import { logger } from '../utils/logger/logger.service.js';
import { type RSSItem, rssService } from './rss.service.js';

export interface FeedCheckResult {
  success: boolean;
  newItems: RSSItem[];
  lastItemId?: string;
  error?: string;
  nextCheckDelay?: number; // milliseconds until next check
  totalItemsCount?: number; // total items found before filtering
}

export class ParserService {
  private readonly defaultCheckInterval = 5 * 60 * 1000; // 5 minutes
  private readonly failureDelayMultiplier = 2;
  private readonly maxFailureDelay = 60 * 60 * 1000; // 1 hour

  /**
   * Check a feed for new items and handle deduplication
   */
  async checkFeed(
    feedUrl: string,
    lastItemId?: string,
    failureCount = 0
  ): Promise<FeedCheckResult> {
    try {
      logger.debug(`Checking feed for new items: ${feedUrl}`);

      // Get new items from the RSS feed (this now returns total count too)
      const result = await rssService.getNewItems(feedUrl, lastItemId);
      const newItems = result.items;
      const totalItemsCount = result.totalItemsCount;

      // Determine the new last item ID
      // ALWAYS update lastItemId to track the current state of the feed
      // Priority: lastItemIdToSave (first time) > first new item > firstItemId (current top item) > existing lastItemId
      // IMPORTANT: Always pass a valid lastItemId - if feed has items, use firstItemId even with no new items
      let newLastItemId: string | undefined;
      
      if (result.lastItemIdToSave) {
        // First time processing - use the reference item
        newLastItemId = result.lastItemIdToSave;
        logger.debug(`🔍 Setting lastItemId from first time: ${newLastItemId}`);
      } else if (newItems.length > 0) {
        // Has new items - use the first new item
        newLastItemId = newItems[0]?.id;
        logger.debug(`🔍 Setting lastItemId from new items: ${newLastItemId}`);
      } else if (result.firstItemId) {
        // No new items but feed has items - update to current first item to track feed state
        newLastItemId = result.firstItemId;
        logger.debug(`🔍 Updating lastItemId to current feed state: ${newLastItemId} (no new items)`);
      } else {
        // Feed is empty or firstItemId is undefined - keep existing lastItemId
        newLastItemId = lastItemId;
        logger.debug(`🔍 Keeping existing lastItemId: ${newLastItemId}`);
      }

      // Calculate next check delay (reset to default on success)
      const nextCheckDelay = this.defaultCheckInterval;

      logger.info(`Feed check completed: ${feedUrl} - ${newItems.length} new items`);

      return {
        success: true,
        newItems,
        lastItemId: newLastItemId,
        nextCheckDelay,
        totalItemsCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Feed check failed: ${feedUrl} - ${errorMessage}`);

      // Calculate exponential backoff delay for failures
      const nextCheckDelay = Math.min(
        this.defaultCheckInterval * this.failureDelayMultiplier ** failureCount,
        this.maxFailureDelay
      );

      return {
        success: false,
        newItems: [],
        lastItemId,
        error: errorMessage,
        nextCheckDelay,
      };
    }
  }

  /**
   * Validate if a URL is a valid RSS feed
   */
  async validateFeed(url: string): Promise<boolean> {
    return await rssService.validateFeedUrl(url);
  }

  /**
   * Get a preview of feed items (for testing/validation)
   */
  async previewFeed(url: string, maxItems = 5): Promise<RSSItem[]> {
    try {
      const result = await rssService.fetchFeed(url);

      if (!result.success || !result.feed) {
        return [];
      }

      return result.feed.items.slice(0, maxItems);
    } catch (error) {
      logger.error(`Failed to preview feed ${url}:`, error);
      return [];
    }
  }

  /**
   * Deduplicate items based on their IDs
   */
  deduplicateItems(items: RSSItem[]): RSSItem[] {
    const seen = new Set<string>();
    const deduplicated: RSSItem[] = [];

    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        deduplicated.push(item);
      }
    }

    const duplicatesRemoved = items.length - deduplicated.length;
    if (duplicatesRemoved > 0) {
      logger.debug(`Removed ${duplicatesRemoved} duplicate items`);
    }

    return deduplicated;
  }

  /**
   * Filter items by date (only items newer than the given date)
   */
  filterItemsByDate(items: RSSItem[], sinceDate: Date): RSSItem[] {
    return items.filter((item) => {
      if (!item.pubDate) {
        // If no pubDate, assume it's new
        return true;
      }
      return item.pubDate > sinceDate;
    });
  }

  /**
   * Sort items by publication date (newest first)
   */
  sortItemsByDate(items: RSSItem[]): RSSItem[] {
    return [...items].sort((a, b) => {
      // Items without dates go to the end
      if (!a.pubDate && !b.pubDate) return 0;
      if (!a.pubDate) return 1;
      if (!b.pubDate) return -1;

      // Newest first
      return b.pubDate.getTime() - a.pubDate.getTime();
    });
  }

  /**
   * Process items with full deduplication and sorting
   */
  processItems(items: RSSItem[]): RSSItem[] {
    // First deduplicate
    let processed = this.deduplicateItems(items);

    // Then sort by date
    processed = this.sortItemsByDate(processed);

    return processed;
  }
}

// Singleton instance
export const parserService = new ParserService();
