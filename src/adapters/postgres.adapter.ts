import { Injectable, Logger } from '@nestjs/common';
import knex, { Knex } from 'knex';

import {
  PostgresDatabaseConfig,
  PostgresEntityConfig,
  PostgresTransactionContext,
  Repository,
  PageResult,
  PageOptions,
  TransactionOptions,
  TransactionCallback,
  HealthCheckResult,
  DATABASE_KIT_CONSTANTS,
} from '../contracts/database.contracts';
import {
  shapePage,
  addCreatedAtTimestamp,
  addUpdatedAtTimestamp,
  createErrorHealthResult,
  createSuccessHealthResult,
} from '../utils/adapter.utils';

type FilterOps = Record<string, unknown>;

const comparisonHandlers: Array<{
  key: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
  apply: (qb: Knex.QueryBuilder, column: string, value: unknown) => void;
}> = [
  {
    key: 'eq',
    apply: (qb, column, value) => {
      qb.where(column, value as any);
    },
  },
  {
    key: 'ne',
    apply: (qb, column, value) => {
      qb.whereNot(column, value as any);
    },
  },
  {
    key: 'gt',
    apply: (qb, column, value) => {
      qb.where(column, '>', value as any);
    },
  },
  {
    key: 'gte',
    apply: (qb, column, value) => {
      qb.where(column, '>=', value as any);
    },
  },
  {
    key: 'lt',
    apply: (qb, column, value) => {
      qb.where(column, '<', value as any);
    },
  },
  {
    key: 'lte',
    apply: (qb, column, value) => {
      qb.where(column, '<=', value as any);
    },
  },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function coerceLikeValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
}

function normalizeSortDirection(dir: unknown): 'asc' | 'desc' {
  if (typeof dir === 'number') {
    return dir === -1 ? 'desc' : 'asc';
  }
  if (typeof dir === 'string') {
    return dir.toLowerCase() === 'desc' ? 'desc' : 'asc';
  }
  return 'asc';
}

function applyPostgresFilter(
  qb: Knex.QueryBuilder,
  filter: Record<string, unknown>,
  assertFieldAllowed: (field: string) => void,
): void {
  Object.entries(filter).forEach(([column, value]) => {
    assertFieldAllowed(column);

    if (!isPlainObject(value)) {
      qb.where(column, value as any);
      return;
    }

    const ops = value as FilterOps;

    comparisonHandlers.forEach(({ key, apply }) => {
      const opValue = ops[key];
      if (opValue !== undefined) {
        apply(qb, column, opValue);
      }
    });

    if (ops.in !== undefined) {
      const values = Array.isArray(ops.in) ? ops.in : [ops.in];
      qb.whereIn(column, values as readonly any[]);
    }

    if (ops.nin !== undefined) {
      const values = Array.isArray(ops.nin) ? ops.nin : [ops.nin];
      qb.whereNotIn(column, values as readonly any[]);
    }

    const likeValue = coerceLikeValue(ops.like);
    if (likeValue !== null) {
      qb.whereILike(column, likeValue);
    }

    if (ops.isNull === true) qb.whereNull(column);
    if (ops.isNotNull === true) qb.whereNotNull(column);
  });
}

function applyPostgresSort(
  qb: Knex.QueryBuilder,
  sort: string | Record<string, unknown> | undefined,
  assertFieldAllowed: (field: string) => void,
): void {
  if (!sort) return;

  if (typeof sort === 'string') {
    const parts = sort
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      const direction = part.startsWith('-') ? 'desc' : 'asc';
      const column = part.replace(/^[-+]/, '');
      assertFieldAllowed(column);
      qb.orderBy(column, direction);
    }
    return;
  }

  Object.entries(sort).forEach(([column, dir]) => {
    assertFieldAllowed(column);
    qb.orderBy(column, normalizeSortDirection(dir));
  });
}

type PostgresRepoParams<T> = {
  kx: Knex;
  table: string;
  pk: string;
  baseFilter: Record<string, unknown>;
  notDeletedFilter: Record<string, unknown>;
  softDeleteEnabled: boolean;
  softDeleteField: string;
  addCreatedAt: <D extends Record<string, unknown>>(data: D) => D;
  addUpdatedAt: <D extends Record<string, unknown>>(data: D) => D;
  hooks?: PostgresEntityConfig<T>['hooks'];
  applyFilter: (qb: Knex.QueryBuilder, filter: Record<string, unknown>) => void;
  applySort: (
    qb: Knex.QueryBuilder,
    sort?: string | Record<string, unknown>,
  ) => void;
};

type PostgresHookHandlers<T> = {
  runBeforeCreate: (data: Partial<T>) => Promise<Partial<T>>;
  runAfterCreate: (entity: T) => Promise<void>;
  runBeforeUpdate: (data: Partial<T>) => Promise<Partial<T>>;
  runAfterUpdate: (entity: T | null) => Promise<void>;
  runBeforeDelete: (id: string | number) => Promise<void>;
  runAfterDelete: (success: boolean) => Promise<void>;
};

function createPostgresHookHandlers<T>(
  hooks?: PostgresEntityConfig<T>['hooks'],
): PostgresHookHandlers<T> {
  return {
    runBeforeCreate: async (data) => {
      if (hooks?.beforeCreate) {
        const result = await hooks.beforeCreate({
          data,
          operation: 'create',
          isBulk: false,
        });
        return result ?? data;
      }
      return data;
    },
    runAfterCreate: async (entity) => {
      if (hooks?.afterCreate) {
        await hooks.afterCreate(entity);
      }
    },
    runBeforeUpdate: async (data) => {
      if (hooks?.beforeUpdate) {
        const result = await hooks.beforeUpdate({
          data,
          operation: 'update',
          isBulk: false,
        });
        return result ?? data;
      }
      return data;
    },
    runAfterUpdate: async (entity) => {
      if (hooks?.afterUpdate) {
        await hooks.afterUpdate(entity);
      }
    },
    runBeforeDelete: async (id) => {
      if (hooks?.beforeDelete) {
        await hooks.beforeDelete(id);
      }
    },
    runAfterDelete: async (success) => {
      if (hooks?.afterDelete) {
        await hooks.afterDelete(success);
      }
    },
  };
}

function createPostgresReadMethods<T>(params: PostgresRepoParams<T>) {
  const {
    kx,
    table,
    pk,
    baseFilter,
    notDeletedFilter,
    applyFilter,
    applySort,
  } = params;

  return {
    async findById(id: string | number): Promise<T | null> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter };
      const qb = kx(table)
        .select('*')
        .where({ [pk]: id });
      applyFilter(qb, mergedFilter);
      const row = await qb.first();
      return (row as T) || null;
    },

    async findAll(filter: Record<string, unknown> = {}): Promise<T[]> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };
      const qb = kx(table).select('*');
      applyFilter(qb, mergedFilter);
      const rows = await qb;
      return rows as T[];
    },

    async findOne(filter: Record<string, unknown>): Promise<T | null> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };
      const qb = kx(table).select('*');
      applyFilter(qb, mergedFilter);
      const row = await qb.first();
      return (row as T) || null;
    },

    async findPage(options: PageOptions = {}): Promise<PageResult<T>> {
      const { filter = {}, page = 1, limit = 10, sort } = options;
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };

      const offset = Math.max(0, (page - 1) * limit);
      const qb = kx(table).select('*');
      applyFilter(qb, mergedFilter);
      applySort(qb, sort);

      const data = (await qb.clone().limit(limit).offset(offset)) as T[];

      const countRow = await kx(table)
        .count<{ count: string }[]>({ count: '*' })
        .modify((q) => applyFilter(q, mergedFilter));
      const total = Number(countRow[0]?.count || 0);

      return shapePage(data, page, limit, total);
    },

    async count(filter: Record<string, unknown> = {}): Promise<number> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };
      const [{ count }] = await kx(table)
        .count<{ count: string }[]>({ count: '*' })
        .modify((q) => applyFilter(q, mergedFilter));
      return Number(count || 0);
    },

    async exists(filter: Record<string, unknown> = {}): Promise<boolean> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };
      const row = await kx(table)
        .select([pk])
        .modify((q) => applyFilter(q, mergedFilter))
        .first();
      return !!row;
    },

    async distinct<K extends keyof T>(
      field: K,
      filter: Record<string, unknown> = {},
    ): Promise<T[K][]> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };
      const qb = kx(table)
        .distinct(String(field))
        .modify((q) => applyFilter(q, mergedFilter));
      const rows = await qb;
      return rows.map(
        (row: Record<string, unknown>) => row[String(field)] as T[K],
      );
    },

    async select<K extends keyof T>(
      filter: Record<string, unknown>,
      fields: K[],
    ): Promise<Pick<T, K>[]> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };
      const qb = kx(table)
        .select(fields.map(String))
        .modify((q) => applyFilter(q, mergedFilter));
      const rows = await qb;
      return rows as Pick<T, K>[];
    },
  };
}

function createPostgresWriteMethods<T>(
  params: PostgresRepoParams<T>,
  hooks: PostgresHookHandlers<T>,
) {
  const {
    kx,
    table,
    pk,
    baseFilter,
    notDeletedFilter,
    softDeleteEnabled,
    softDeleteField,
    addCreatedAt,
    addUpdatedAt,
    applyFilter,
  } = params;

  return {
    async create(data: Partial<T>): Promise<T> {
      let processedData = await hooks.runBeforeCreate(data);
      processedData = addCreatedAt(
        processedData as Record<string, unknown>,
      ) as Partial<T>;

      const [row] = await kx(table).insert(processedData).returning('*');
      const entity = row as T;

      await hooks.runAfterCreate(entity);

      return entity;
    },

    async updateById(
      id: string | number,
      update: Partial<T>,
    ): Promise<T | null> {
      let processedUpdate = await hooks.runBeforeUpdate(update);
      processedUpdate = addUpdatedAt(
        processedUpdate as Record<string, unknown>,
      ) as Partial<T>;

      const mergedFilter = { ...baseFilter, ...notDeletedFilter };
      const qb = kx(table).where({ [pk]: id });
      applyFilter(qb, mergedFilter);
      const [row] = await qb.update(processedUpdate).returning('*');
      const entity = (row as T) || null;

      await hooks.runAfterUpdate(entity);

      return entity;
    },

    async deleteById(id: string | number): Promise<boolean> {
      await hooks.runBeforeDelete(id);

      const mergedFilter = { ...baseFilter, ...notDeletedFilter };
      let success: boolean;

      if (softDeleteEnabled) {
        const qb = kx(table).where({ [pk]: id });
        applyFilter(qb, mergedFilter);
        const affectedRows = await qb.update({
          [softDeleteField]: new Date(),
        });
        success = affectedRows > 0;
      } else {
        const qb = kx(table).where({ [pk]: id });
        applyFilter(qb, mergedFilter);
        const affectedRows = await qb.delete();
        success = affectedRows > 0;
      }

      await hooks.runAfterDelete(success);

      return success;
    },
  };
}

function createPostgresBulkMethods<T>(params: PostgresRepoParams<T>) {
  const {
    kx,
    table,
    baseFilter,
    notDeletedFilter,
    softDeleteEnabled,
    softDeleteField,
    addCreatedAt,
    addUpdatedAt,
    applyFilter,
  } = params;

  return {
    async insertMany(data: Partial<T>[]): Promise<T[]> {
      if (data.length === 0) return [];

      const timestampedData = data.map((item) =>
        addCreatedAt(item as Record<string, unknown>),
      );

      const rows = await kx(table).insert(timestampedData).returning('*');

      return rows as T[];
    },

    async updateMany(
      filter: Record<string, unknown>,
      update: Partial<T>,
    ): Promise<number> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };
      const timestampedUpdate = addUpdatedAt(update as Record<string, unknown>);

      const affectedRows = await kx(table)
        .modify((q) => applyFilter(q, mergedFilter))
        .update(timestampedUpdate);

      return affectedRows;
    },

    async deleteMany(filter: Record<string, unknown>): Promise<number> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };

      if (softDeleteEnabled) {
        const affectedRows = await kx(table)
          .modify((q) => applyFilter(q, mergedFilter))
          .update({ [softDeleteField]: new Date() });
        return affectedRows;
      }

      const affectedRows = await kx(table)
        .modify((q) => applyFilter(q, mergedFilter))
        .delete();

      return affectedRows;
    },
  };
}

function createPostgresAdvancedMethods<T>(params: PostgresRepoParams<T>) {
  const {
    kx,
    table,
    pk,
    baseFilter,
    notDeletedFilter,
    addCreatedAt,
    addUpdatedAt,
    applyFilter,
  } = params;

  return {
    async upsert(
      filter: Record<string, unknown>,
      data: Partial<T>,
    ): Promise<T> {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };

      const qb = kx(table).select('*');
      applyFilter(qb, mergedFilter);
      const existing = await qb.first();

      if (existing) {
        const timestampedUpdate = addUpdatedAt(data as Record<string, unknown>);
        const updateQb = kx(table).where({ [pk]: existing[pk] });
        const [row] = await updateQb.update(timestampedUpdate).returning('*');
        return row as T;
      }

      const timestampedData = addCreatedAt({ ...filter, ...data } as Record<
        string,
        unknown
      >);
      const [row] = await kx(table).insert(timestampedData).returning('*');
      return row as T;
    },
  };
}

function createPostgresSoftDeleteMethods<T>(params: PostgresRepoParams<T>) {
  const {
    kx,
    table,
    pk,
    baseFilter,
    notDeletedFilter,
    softDeleteEnabled,
    softDeleteField,
    applyFilter,
  } = params;

  if (!softDeleteEnabled) {
    return {
      softDelete: undefined,
      softDeleteMany: undefined,
      restore: undefined,
      restoreMany: undefined,
      findAllWithDeleted: undefined,
      findDeleted: undefined,
    };
  }

  return {
    softDelete: async (id: string | number): Promise<boolean> => {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter };
      const qb = kx(table).where({ [pk]: id });
      applyFilter(qb, mergedFilter);
      const affectedRows = await qb.update({
        [softDeleteField]: new Date(),
      });
      return affectedRows > 0;
    },

    softDeleteMany: async (
      filter: Record<string, unknown>,
    ): Promise<number> => {
      const mergedFilter = { ...baseFilter, ...notDeletedFilter, ...filter };
      const affectedRows = await kx(table)
        .modify((q) => applyFilter(q, mergedFilter))
        .update({ [softDeleteField]: new Date() });
      return affectedRows;
    },

    restore: async (id: string | number): Promise<T | null> => {
      const deletedFilter = { [softDeleteField]: { isNotNull: true } };
      const mergedFilter = { ...baseFilter, ...deletedFilter };
      const qb = kx(table).where({ [pk]: id });
      applyFilter(qb, mergedFilter);
      const [row] = await qb.update({ [softDeleteField]: null }).returning('*');
      return (row as T) || null;
    },

    restoreMany: async (filter: Record<string, unknown>): Promise<number> => {
      const deletedFilter = { [softDeleteField]: { isNotNull: true } };
      const mergedFilter = { ...baseFilter, ...deletedFilter, ...filter };
      const affectedRows = await kx(table)
        .modify((q) => applyFilter(q, mergedFilter))
        .update({ [softDeleteField]: null });
      return affectedRows;
    },

    findAllWithDeleted: async (
      filter: Record<string, unknown> = {},
    ): Promise<T[]> => {
      const mergedFilter = { ...baseFilter, ...filter };
      const qb = kx(table).select('*');
      applyFilter(qb, mergedFilter);
      const rows = await qb;
      return rows as T[];
    },

    findDeleted: async (filter: Record<string, unknown> = {}): Promise<T[]> => {
      const deletedFilter = { [softDeleteField]: { isNotNull: true } };
      const mergedFilter = { ...baseFilter, ...deletedFilter, ...filter };
      const qb = kx(table).select('*');
      applyFilter(qb, mergedFilter);
      const rows = await qb;
      return rows as T[];
    },
  };
}

/**
 * PostgreSQL adapter for DatabaseKit.
 * Handles PostgreSQL connection and repository creation via Knex.
 *
 * @example
 * ```typescript
 * const adapter = new PostgresAdapter({ type: 'postgres', connectionString: 'postgresql://...' });
 * adapter.connect();
 * const repo = adapter.createRepository({ table: 'users', primaryKey: 'id' });
 * ```
 */
@Injectable()
export class PostgresAdapter {
  private readonly logger = new Logger(PostgresAdapter.name);
  private readonly config: PostgresDatabaseConfig;
  private knexInstance?: Knex;

  constructor(config: PostgresDatabaseConfig) {
    this.config = config;
  }

  /**
   * Creates and returns the Knex instance for PostgreSQL.
   * Connection is lazy-loaded and cached for reuse.
   *
   * @param overrides - Additional Knex configuration overrides
   * @returns Knex instance
   */
  connect(overrides: Knex.Config = {}): Knex {
    if (!this.knexInstance) {
      this.logger.log('Creating PostgreSQL connection pool...');

      // Apply pool configuration from config
      const poolConfig = this.config.pool || {};
      const pool = {
        min: poolConfig.min ?? 0,
        max: poolConfig.max ?? 10,
        idleTimeoutMillis: poolConfig.idleTimeoutMs ?? 30000,
        acquireTimeoutMillis: poolConfig.acquireTimeoutMs ?? 60000,
      };

      this.knexInstance = knex({
        client: 'pg',
        connection: this.config.connectionString,
        pool,
        acquireConnectionTimeout: poolConfig.acquireTimeoutMs ?? 60000,
        ...overrides,
      });

      this.logger.log('PostgreSQL connection pool created');
    }

    return this.knexInstance;
  }

  /**
   * Gracefully destroys the connection pool.
   */
  async disconnect(): Promise<void> {
    if (this.knexInstance) {
      await this.knexInstance.destroy();
      this.knexInstance = undefined;
      this.logger.log('PostgreSQL connection pool destroyed');
    }
  }

  /**
   * Returns the Knex instance.
   * Throws if not connected.
   */
  getKnex(): Knex {
    if (!this.knexInstance) {
      throw new Error('PostgreSQL not connected. Call connect() first.');
    }
    return this.knexInstance;
  }

  /**
   * Checks if connected to PostgreSQL.
   */
  isConnected(): boolean {
    return !!this.knexInstance;
  }

  /**
   * Performs a health check on the PostgreSQL connection.
   * Executes a simple query to verify the database is responsive.
   *
   * @returns Health check result with status and response time
   *
   * @example
   * ```typescript
   * const health = await adapter.healthCheck();
   * if (!health.healthy) {
   *   console.error('Database unhealthy:', health.error);
   * }
   * ```
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      if (!this.knexInstance) {
        return createErrorHealthResult(
          'postgres',
          'Not connected to PostgreSQL',
          startTime,
        );
      }

      // Execute simple query to verify connection
      const result = await this.knexInstance.raw(
        'SELECT version(), current_database()',
      );
      const row = result.rows?.[0];

      // Get pool info if available
      const pool = (
        this.knexInstance.client as {
          pool?: { numUsed?: () => number; numFree?: () => number };
        }
      ).pool;

      return createSuccessHealthResult('postgres', startTime, {
        version: row?.version?.split(' ').slice(0, 2).join(' '),
        activeConnections: pool?.numUsed?.() ?? 0,
        poolSize: (pool?.numUsed?.() ?? 0) + (pool?.numFree?.() ?? 0),
      });
    } catch (error) {
      return createErrorHealthResult(
        'postgres',
        error instanceof Error ? error.message : 'Unknown error',
        startTime,
      );
    }
  }

  /**
   * Creates a repository for a PostgreSQL table.
   * The repository provides a standardized CRUD interface.
   *
   * @param cfg - Configuration for the entity/table
   * @param trx - Optional Knex transaction for transaction support
   * @returns Repository instance with CRUD methods
   */
  createRepository<T = unknown>(
    cfg: PostgresEntityConfig<T>,
    trx?: Knex.Transaction,
  ): Repository<T> {
    const kx = trx || this.getKnex();
    const table = cfg.table;
    const pk = cfg.primaryKey || 'id';
    const allowed = cfg.columns || [];
    const baseFilter = cfg.defaultFilter || {};
    const softDeleteEnabled = cfg.softDelete ?? false;
    const softDeleteField = cfg.softDeleteField ?? 'deleted_at';
    const timestampsEnabled = cfg.timestamps ?? false;
    const createdAtField = cfg.createdAtField ?? 'created_at';
    const updatedAtField = cfg.updatedAtField ?? 'updated_at';
    const hooks = cfg.hooks;

    const notDeletedFilter: Record<string, unknown> = softDeleteEnabled
      ? { [softDeleteField]: { isNull: true } }
      : {};

    const addCreatedAt = <D extends Record<string, unknown>>(data: D): D =>
      addCreatedAtTimestamp(data, timestampsEnabled, createdAtField);

    const addUpdatedAt = <D extends Record<string, unknown>>(data: D): D =>
      addUpdatedAtTimestamp(data, timestampsEnabled, updatedAtField);

    const assertFieldAllowed = (field: string): void => {
      if (allowed.length && !allowed.includes(field)) {
        throw new Error(
          `Field "${field}" is not allowed for table "${table}". Add it to columns[] in config.`,
        );
      }
    };

    const applyFilter = (
      qb: Knex.QueryBuilder,
      filter: Record<string, unknown>,
    ): void => applyPostgresFilter(qb, filter, assertFieldAllowed);

    const applySort = (
      qb: Knex.QueryBuilder,
      sort?: string | Record<string, unknown>,
    ): void => applyPostgresSort(qb, sort, assertFieldAllowed);

    const params: PostgresRepoParams<T> = {
      kx,
      table,
      pk,
      baseFilter,
      notDeletedFilter,
      softDeleteEnabled,
      softDeleteField,
      addCreatedAt,
      addUpdatedAt,
      hooks,
      applyFilter,
      applySort,
    };

    const hookHandlers = createPostgresHookHandlers<T>(hooks);

    return {
      ...createPostgresReadMethods<T>(params),
      ...createPostgresWriteMethods<T>(params, hookHandlers),
      ...createPostgresBulkMethods<T>(params),
      ...createPostgresAdvancedMethods<T>(params),
      ...createPostgresSoftDeleteMethods<T>(params),
    };
  }

  /**
   * Executes a callback within a PostgreSQL transaction.
   * All database operations within the callback are atomic.
   *
   * @param callback - Function to execute within the transaction
   * @param options - Transaction options including isolation level
   * @returns Result of the callback function
   * @throws Error if transaction fails after all retries
   *
   * @example
   * ```typescript
   * const result = await postgresAdapter.withTransaction(async (ctx) => {
   *   const usersRepo = ctx.createRepository<User>({ table: 'users' });
   *   const ordersRepo = ctx.createRepository<Order>({ table: 'orders' });
   *
   *   const [user] = await usersRepo.create({ name: 'John' });
   *   const [order] = await ordersRepo.create({ user_id: user.id, total: 100 });
   *
   *   return { user, order };
   * }, { isolationLevel: 'serializable' });
   * ```
   */
  async withTransaction<TResult>(
    callback: TransactionCallback<PostgresTransactionContext, TResult>,
    options: TransactionOptions = {},
  ): Promise<TResult> {
    const {
      isolationLevel = 'read committed',
      retries = 0,
      timeout = DATABASE_KIT_CONSTANTS.DEFAULT_TRANSACTION_TIMEOUT,
    } = options;

    const kx = this.getKnex();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await kx.transaction(
          async (trx) => {
            // Set statement timeout for the transaction
            await trx.raw(`SET LOCAL statement_timeout = ${timeout}`);

            const context: PostgresTransactionContext = {
              transaction: trx,
              createRepository: <T>(config: PostgresEntityConfig) =>
                this.createRepository<T>(config, trx),
            };

            return await callback(context);
          },
          { isolationLevel },
        );

        this.logger.debug(
          `Transaction committed successfully (attempt ${attempt + 1})`,
        );
        return result;
      } catch (error) {
        lastError = error as Error;

        this.logger.warn(
          `Transaction failed (attempt ${attempt + 1}/${retries + 1}): ${lastError.message}`,
        );

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable || attempt >= retries) {
          throw lastError;
        }

        // Exponential backoff before retry
        const backoffMs = Math.min(100 * Math.pow(2, attempt), 3000);
        await this.sleep(backoffMs);
      }
    }

    throw lastError || new Error('Transaction failed');
  }

  /**
   * Checks if a PostgreSQL error is retryable.
   */
  private isRetryableError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const pgError = error as { code?: string; routine?: string };

      // PostgreSQL serialization failure codes
      const retryableCodes = [
        '40001', // serialization_failure
        '40P01', // deadlock_detected
        '55P03', // lock_not_available
        '57P01', // admin_shutdown
        '57014', // query_canceled (timeout)
      ];

      if (pgError.code && retryableCodes.includes(pgError.code)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple sleep utility for retry backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
