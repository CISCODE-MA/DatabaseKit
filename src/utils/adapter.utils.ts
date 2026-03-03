import type {
  PageResult,
  HealthCheckResult,
} from '../contracts/database.contracts';

/**
 * Shared adapter utilities to reduce code duplication.
 * These functions are used by both MongoAdapter and PostgresAdapter.
 */

/**
 * Shapes paginated data into a consistent PageResult format.
 * Used by both MongoDB and PostgreSQL adapters.
 *
 * @param data - Array of data items
 * @param page - Current page number (1-indexed)
 * @param limit - Items per page
 * @param total - Total number of items
 * @returns Formatted page result
 */
export function shapePage<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): PageResult<T> {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return { data, page, limit, total, pages };
}

/**
 * Adds createdAt timestamp to data if timestamps are enabled.
 *
 * @param data - Data object to add timestamp to
 * @param enabled - Whether timestamps are enabled
 * @param field - Name of the createdAt field
 * @returns Data with timestamp added if enabled
 */
export function addCreatedAtTimestamp<T extends Record<string, unknown>>(
  data: T,
  enabled: boolean,
  field: string,
): T {
  return addTimestamp(data, enabled, field);
}

/**
 * Adds updatedAt timestamp to data if timestamps are enabled.
 *
 * @param data - Data object to add timestamp to
 * @param enabled - Whether timestamps are enabled
 * @param field - Name of the updatedAt field
 * @returns Data with timestamp added if enabled
 */
export function addUpdatedAtTimestamp<T extends Record<string, unknown>>(
  data: T,
  enabled: boolean,
  field: string,
): T {
  return addTimestamp(data, enabled, field);
}

/**
 * Adds a timestamp to a specific field when enabled.
 */
function addTimestamp<T extends Record<string, unknown>>(
  data: T,
  enabled: boolean,
  field: string,
): T {
  if (!enabled) {
    return data;
  }

  return { ...data, [field]: new Date() };
}

/**
 * Creates a consistent error health check result.
 * Used when health check fails or connection is not established.
 *
 * @param type - Database type ('mongo' | 'postgres')
 * @param error - Error message
 * @param startTime - Start time to calculate response time
 * @returns Health check result indicating failure
 */
export function createErrorHealthResult(
  type: 'mongo' | 'postgres',
  error: string,
  startTime: number,
): HealthCheckResult {
  return {
    healthy: false,
    responseTimeMs: Date.now() - startTime,
    type,
    error,
  };
}

/**
 * Creates a successful health check result.
 *
 * @param type - Database type ('mongo' | 'postgres')
 * @param startTime - Start time to calculate response time
 * @param details - Optional additional details
 * @returns Health check result indicating success
 */
export function createSuccessHealthResult(
  type: 'mongo' | 'postgres',
  startTime: number,
  details?: Record<string, unknown>,
): HealthCheckResult {
  const result: HealthCheckResult = {
    healthy: true,
    responseTimeMs: Date.now() - startTime,
    type,
  };

  if (details) {
    result.details = details;
  }

  return result;
}
