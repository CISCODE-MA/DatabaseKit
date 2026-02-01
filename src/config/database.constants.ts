// src/config/database.constants.ts

/**
 * Injection token for the main DatabaseService instance.
 * Use with @Inject(DATABASE_TOKEN) or @InjectDatabase() decorator.
 */
export const DATABASE_TOKEN = 'DATABASE_KIT_DEFAULT';

/**
 * Injection token for DatabaseKit module options.
 * Used internally for async configuration.
 */
export const DATABASE_OPTIONS_TOKEN = 'DATABASE_KIT_OPTIONS';

/**
 * Environment variable names used by DatabaseKit.
 */
export const ENV_KEYS = {
  /** MongoDB connection string */
  MONGO_URI: 'MONGO_URI',
  /** PostgreSQL connection string */
  POSTGRES_URI: 'DATABASE_URL',
  /** Database type ('mongo' or 'postgres') */
  DATABASE_TYPE: 'DATABASE_TYPE',
  /** Connection pool size */
  POOL_SIZE: 'DATABASE_POOL_SIZE',
  /** Connection timeout in milliseconds */
  CONNECTION_TIMEOUT: 'DATABASE_CONNECTION_TIMEOUT',
} as const;

/**
 * Default configuration values.
 */
export const DEFAULTS = {
  /** Default page size for pagination */
  PAGE_SIZE: 10,
  /** Maximum allowed page size */
  MAX_PAGE_SIZE: 100,
  /** Default connection pool size */
  POOL_SIZE: 10,
  /** Default connection timeout in milliseconds */
  CONNECTION_TIMEOUT: 5000,
  /** Default server selection timeout for MongoDB */
  SERVER_SELECTION_TIMEOUT: 5000,
} as const;
