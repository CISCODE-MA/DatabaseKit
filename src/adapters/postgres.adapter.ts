// src/adapters/postgres.adapter.ts

import knex, { Knex } from 'knex';
import { Injectable, Logger } from '@nestjs/common';
import {
    PostgresDatabaseConfig,
    PostgresEntityConfig,
    Repository,
    PageResult,
    PageOptions,
} from '../contracts/database.contracts';

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

            this.knexInstance = knex({
                client: 'pg',
                connection: this.config.connectionString,
                pool: { min: 0, max: 10 },
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
     * Creates a repository for a PostgreSQL table.
     * The repository provides a standardized CRUD interface.
     * 
     * @param cfg - Configuration for the entity/table
     * @returns Repository instance with CRUD methods
     */
    createRepository<T = unknown>(cfg: PostgresEntityConfig): Repository<T> {
        const kx = this.getKnex();
        const table = cfg.table;
        const pk = cfg.primaryKey || 'id';
        const allowed = cfg.columns || [];
        const baseFilter = cfg.defaultFilter || {};

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
        ): void => {
            Object.entries(filter).forEach(([key, value]) => {
                assertFieldAllowed(key);

                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    const ops = value as Record<string, unknown>;

                    if (ops.eq !== undefined) qb.where(key, ops.eq);
                    if (ops.ne !== undefined) qb.whereNot(key, ops.ne);
                    if (ops.gt !== undefined) qb.where(key, '>', ops.gt);
                    if (ops.gte !== undefined) qb.where(key, '>=', ops.gte);
                    if (ops.lt !== undefined) qb.where(key, '<', ops.lt);
                    if (ops.lte !== undefined) qb.where(key, '<=', ops.lte);
                    if (ops.in) qb.whereIn(key, ops.in as readonly string[]);
                    if (ops.nin) qb.whereNotIn(key, ops.nin as readonly string[]);
                    if (ops.like) qb.whereILike(key, `${ops.like}`);
                    if (ops.isNull === true) qb.whereNull(key);
                    if (ops.isNotNull === true) qb.whereNotNull(key);
                } else {
                    qb.where(key, value as string | number | boolean);
                }
            });
        };

        const applySort = (
            qb: Knex.QueryBuilder,
            sort?: string | Record<string, unknown>,
        ): void => {
            if (!sort) return;

            if (typeof sort === 'string') {
                const parts = sort.split(',');
                for (const p of parts) {
                    const dir = p.startsWith('-') ? 'desc' : 'asc';
                    const col = p.replace(/^[-+]/, '');
                    assertFieldAllowed(col);
                    qb.orderBy(col, dir);
                }
            } else {
                Object.entries(sort).forEach(([col, dir]) => {
                    assertFieldAllowed(col);
                    const direction =
                        dir === -1 || String(dir).toLowerCase() === 'desc' ? 'desc' : 'asc';
                    qb.orderBy(col, direction);
                });
            }
        };

        const shapePage = (
            data: T[],
            page: number,
            limit: number,
            total: number,
        ): PageResult<T> => {
            const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
            return { data, page, limit, total, pages };
        };

        const repo: Repository<T> = {
            async create(data: Partial<T>): Promise<T> {
                const [row] = await kx(table).insert(data).returning('*');
                return row as T;
            },

            async findById(id: string | number): Promise<T | null> {
                const row = await kx(table)
                    .select('*')
                    .where({ [pk]: id, ...baseFilter })
                    .first();
                return (row as T) || null;
            },

            async findAll(filter: Record<string, unknown> = {}): Promise<T[]> {
                const mergedFilter = { ...baseFilter, ...filter };
                const qb = kx(table).select('*');
                applyFilter(qb, mergedFilter);
                const rows = await qb;
                return rows as T[];
            },

            async findPage(options: PageOptions = {}): Promise<PageResult<T>> {
                const { filter = {}, page = 1, limit = 10, sort } = options;
                const mergedFilter = { ...baseFilter, ...filter };

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

            async updateById(id: string | number, update: Partial<T>): Promise<T | null> {
                const [row] = await kx(table)
                    .where({ [pk]: id })
                    .update(update)
                    .returning('*');
                return (row as T) || null;
            },

            async deleteById(id: string | number): Promise<boolean> {
                const [row] = await kx(table)
                    .where({ [pk]: id })
                    .delete()
                    .returning('*');
                return !!row;
            },

            async count(filter: Record<string, unknown> = {}): Promise<number> {
                const mergedFilter = { ...baseFilter, ...filter };
                const [{ count }] = await kx(table)
                    .count<{ count: string }[]>({ count: '*' })
                    .modify((q) => applyFilter(q, mergedFilter));
                return Number(count || 0);
            },

            async exists(filter: Record<string, unknown> = {}): Promise<boolean> {
                const mergedFilter = { ...baseFilter, ...filter };
                const row = await kx(table)
                    .select([pk])
                    .modify((q) => applyFilter(q, mergedFilter))
                    .first();
                return !!row;
            },
        };

        return repo;
    }
}
