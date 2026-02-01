// src/utils/pagination.utils.ts

import { PageOptions, PageResult, DATABASE_KIT_CONSTANTS } from '../contracts/database.contracts';

/**
 * Utility functions for pagination operations.
 */

/**
 * Normalizes pagination options with defaults and constraints.
 * 
 * @param options - The input pagination options
 * @returns Normalized options with validated values
 */
export function normalizePaginationOptions<T = Record<string, unknown>>(
  options: PageOptions<T> = {},
): Required<PageOptions<T>> {
  const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = DATABASE_KIT_CONSTANTS;

  let page = options.page ?? 1;
  let limit = options.limit ?? DEFAULT_PAGE_SIZE;

  // Ensure page is at least 1
  if (page < 1) page = 1;

  // Ensure limit is within bounds
  if (limit < 1) limit = 1;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  return {
    filter: options.filter ?? ({} as T),
    page,
    limit,
    sort: options.sort ?? {},
  };
}

/**
 * Calculates pagination metadata from total count.
 * 
 * @param total - Total number of items
 * @param page - Current page number
 * @param limit - Items per page
 * @returns Pagination metadata
 */
export function calculatePagination(
  total: number,
  page: number,
  limit: number,
): { pages: number; hasNext: boolean; hasPrev: boolean } {
  const pages = Math.max(1, Math.ceil(total / limit));
  const hasNext = page < pages;
  const hasPrev = page > 1;

  return { pages, hasNext, hasPrev };
}

/**
 * Creates a page result object.
 * 
 * @param data - Array of items for the current page
 * @param page - Current page number
 * @param limit - Items per page
 * @param total - Total number of items
 * @returns Complete page result
 */
export function createPageResult<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): PageResult<T> {
  const pages = Math.max(1, Math.ceil(total / limit));

  return {
    data,
    page,
    limit,
    total,
    pages,
  };
}

/**
 * Parses a sort string into an object.
 * Supports formats like "-createdAt,name" or "+updatedAt,-title"
 * 
 * @param sortString - Comma-separated sort fields with optional +/- prefix
 * @returns Object with field names as keys and 'asc' | 'desc' as values
 * 
 * @example
 * ```typescript
 * parseSortString('-createdAt,name');
 * // Returns: { createdAt: 'desc', name: 'asc' }
 * ```
 */
export function parseSortString(
  sortString: string,
): Record<string, 'asc' | 'desc'> {
  const result: Record<string, 'asc' | 'desc'> = {};

  if (!sortString) return result;

  const fields = sortString.split(',').map((f) => f.trim()).filter(Boolean);

  for (const field of fields) {
    if (field.startsWith('-')) {
      result[field.slice(1)] = 'desc';
    } else if (field.startsWith('+')) {
      result[field.slice(1)] = 'asc';
    } else {
      result[field] = 'asc';
    }
  }

  return result;
}

/**
 * Calculates the offset for a given page and limit.
 * 
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 * @returns Offset value for database query
 */
export function calculateOffset(page: number, limit: number): number {
  return Math.max(0, (page - 1) * limit);
}
