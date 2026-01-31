// src/adapters/postgres.adapter.spec.ts

import { PostgresAdapter } from './postgres.adapter';
import { PostgresDatabaseConfig, PostgresTransactionContext } from '../contracts/database.contracts';

// Mock knex
const mockTrx = {
    raw: jest.fn().mockResolvedValue(undefined),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 1, name: 'test' }]),
    first: jest.fn().mockResolvedValue({ id: 1, name: 'test' }),
};

const mockKnexInstance = jest.fn((_tableName: string) => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereNot: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNotIn: jest.fn().mockReturnThis(),
    whereILike: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    modify: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 1, name: 'test' }]),
    first: jest.fn().mockResolvedValue({ id: 1, name: 'test' }),
})) as unknown as ReturnType<typeof import('knex').default>;

// Add transaction method to mock
(mockKnexInstance as unknown as { transaction: jest.Mock }).transaction = jest.fn(
    async (callback: (trx: typeof mockTrx) => Promise<unknown>, _options?: unknown) => {
        return callback(mockTrx);
    },
);

(mockKnexInstance as unknown as { destroy: jest.Mock }).destroy = jest.fn().mockResolvedValue(undefined);

jest.mock('knex', () => {
    return jest.fn(() => mockKnexInstance);
});

describe('PostgresAdapter', () => {
    let adapter: PostgresAdapter;
    const mockConfig: PostgresDatabaseConfig = {
        type: 'postgres',
        connectionString: 'postgresql://localhost:5432/testdb',
    };

    beforeEach(() => {
        adapter = new PostgresAdapter(mockConfig);
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await adapter.disconnect();
    });

    describe('constructor', () => {
        it('should create adapter instance', () => {
            expect(adapter).toBeDefined();
            expect(adapter).toBeInstanceOf(PostgresAdapter);
        });
    });

    describe('isConnected', () => {
        it('should return false when not connected', () => {
            expect(adapter.isConnected()).toBe(false);
        });

        it('should return true when connected', () => {
            adapter.connect();
            expect(adapter.isConnected()).toBe(true);
        });
    });

    describe('connect', () => {
        it('should create Knex instance', () => {
            const knex = adapter.connect();
            expect(knex).toBeDefined();
        });

        it('should reuse existing connection', () => {
            const knex1 = adapter.connect();
            const knex2 = adapter.connect();
            expect(knex1).toBe(knex2);
        });
    });

    describe('disconnect', () => {
        it('should destroy Knex instance', async () => {
            adapter.connect();
            await adapter.disconnect();
            expect(adapter.isConnected()).toBe(false);
        });
    });

    describe('getKnex', () => {
        it('should throw when not connected', () => {
            expect(() => adapter.getKnex()).toThrow('PostgreSQL not connected');
        });

        it('should return Knex instance when connected', () => {
            adapter.connect();
            expect(adapter.getKnex()).toBeDefined();
        });
    });

    describe('createRepository', () => {
        beforeEach(() => {
            adapter.connect();
        });

        it('should create a repository with all CRUD methods', () => {
            const repo = adapter.createRepository({
                table: 'users',
                primaryKey: 'id',
                columns: ['id', 'name', 'email'],
            });

            expect(repo).toBeDefined();
            expect(typeof repo.create).toBe('function');
            expect(typeof repo.findById).toBe('function');
            expect(typeof repo.findAll).toBe('function');
            expect(typeof repo.findPage).toBe('function');
            expect(typeof repo.updateById).toBe('function');
            expect(typeof repo.deleteById).toBe('function');
            expect(typeof repo.count).toBe('function');
            expect(typeof repo.exists).toBe('function');
        });

        it('should use default primary key when not specified', () => {
            const repo = adapter.createRepository({
                table: 'users',
            });

            expect(repo).toBeDefined();
        });
    });

    describe('withTransaction', () => {
        beforeEach(() => {
            adapter.connect();
        });

        it('should execute callback within transaction', async () => {
            const mockCallback = jest.fn().mockResolvedValue({ success: true });

            const result = await adapter.withTransaction(mockCallback);

            expect(result).toEqual({ success: true });
            expect(mockCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    transaction: expect.any(Object),
                    createRepository: expect.any(Function),
                }),
            );
        });

        it('should set statement timeout in transaction', async () => {
            await adapter.withTransaction(async () => 'result', { timeout: 15000 });

            expect(mockTrx.raw).toHaveBeenCalledWith('SET LOCAL statement_timeout = 15000');
        });

        it('should provide transaction context with createRepository', async () => {
            let capturedContext: PostgresTransactionContext | undefined;

            await adapter.withTransaction(async (ctx) => {
                capturedContext = ctx;
                return 'done';
            });

            expect(capturedContext).toBeDefined();
            expect(capturedContext!.transaction).toBeDefined();
            expect(typeof capturedContext!.createRepository).toBe('function');
        });

        it('should propagate errors from callback', async () => {
            const error = new Error('Test error');

            await expect(
                adapter.withTransaction(async () => {
                    throw error;
                }),
            ).rejects.toThrow('Test error');
        });

        it('should support isolation levels', async () => {
            const mockTransaction = (mockKnexInstance as unknown as { transaction: jest.Mock }).transaction;

            await adapter.withTransaction(
                async () => 'result',
                { isolationLevel: 'serializable' },
            );

            expect(mockTransaction).toHaveBeenCalledWith(
                expect.any(Function),
                { isolationLevel: 'serializable' },
            );
        });

        it('should use default isolation level when not specified', async () => {
            const mockTransaction = (mockKnexInstance as unknown as { transaction: jest.Mock }).transaction;

            await adapter.withTransaction(async () => 'result');

            expect(mockTransaction).toHaveBeenCalledWith(
                expect.any(Function),
                { isolationLevel: 'read committed' },
            );
        });
    });
});
