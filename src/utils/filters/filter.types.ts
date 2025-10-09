export interface FeedFilter {
  id: string;
  feedId: string;
  type: 'include' | 'exclude';
  pattern: string;
  isRegex: boolean;
}

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

export interface FilterValidationResult {
  valid: boolean;
  error?: string;
}

export interface FilterStats {
  totalFilters: number;
  includeFilters: number;
  excludeFilters: number;
  regexFilters: number;
}

export const MAX_FILTERS_PER_FEED = 10;
export const MAX_PATTERN_LENGTH = 500;
