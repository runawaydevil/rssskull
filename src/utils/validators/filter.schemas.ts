import { z } from 'zod';

/**
 * Schema for validating filter creation input
 */
export const addFilterSchema = z.object({
  feedId: z.string().min(1, 'Feed ID is required'),
  type: z.enum(['include', 'exclude'], {
    errorMap: () => ({ message: 'Filter type must be either "include" or "exclude"' }),
  }),
  pattern: z
    .string()
    .min(1, 'Filter pattern cannot be empty')
    .max(500, 'Filter pattern must be less than 500 characters')
    .transform((str) => str.trim()),
  isRegex: z.boolean().optional().default(false),
});

/**
 * Schema for validating filter update input
 */
export const updateFilterSchema = z.object({
  filterId: z.string().min(1, 'Filter ID is required'),
  pattern: z
    .string()
    .min(1, 'Filter pattern cannot be empty')
    .max(500, 'Filter pattern must be less than 500 characters')
    .transform((str) => str.trim()),
  isRegex: z.boolean().optional(),
});

/**
 * Schema for validating filter test input
 */
export const testFilterSchema = z.object({
  type: z.enum(['include', 'exclude']),
  pattern: z
    .string()
    .min(1, 'Filter pattern cannot be empty')
    .max(500, 'Filter pattern must be less than 500 characters')
    .transform((str) => str.trim()),
  isRegex: z.boolean().default(false),
  sampleText: z.string().min(1, 'Sample text is required for testing'),
});

/**
 * Schema for validating filter removal input
 */
export const removeFilterSchema = z.object({
  filterId: z.string().min(1, 'Filter ID is required'),
  feedId: z.string().min(1, 'Feed ID is required').optional(),
});

/**
 * Schema for validating filter list input
 */
export const listFiltersSchema = z.object({
  feedId: z.string().min(1, 'Feed ID is required'),
});

/**
 * Type exports for the schemas
 */
export type AddFilterInput = z.infer<typeof addFilterSchema>;
export type UpdateFilterInput = z.infer<typeof updateFilterSchema>;
export type TestFilterInput = z.infer<typeof testFilterSchema>;
export type RemoveFilterInput = z.infer<typeof removeFilterSchema>;
export type ListFiltersInput = z.infer<typeof listFiltersSchema>;

/**
 * Validate regex pattern
 */
export function validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
  try {
    new RegExp(pattern, 'i');
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Sanitize filter pattern by removing potentially dangerous characters
 */
export function sanitizeFilterPattern(pattern: string): string {
  return pattern
    .trim()
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
    .slice(0, 500); // Ensure max length
}
