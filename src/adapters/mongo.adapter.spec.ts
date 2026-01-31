import { MongoAdapter } from './mongo.adapter';
import { MongoDatabaseConfig, MongoTransactionContext } from '../contracts/database.contracts';

// Mock mongoose
jest.mock('mongoose', () => {
    const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        abortTransaction: jest.fn().mockResolvedValue(undefined),
        endSession: jest.fn().mockResolvedValue(undefined),
    };

    const mockConnection = {
        readyState: 0,
        on: jest.fn(),
    };

    return {
        connect: jest.fn().mockResolvedValue({}),
        disconnect: jest.fn().mockResolvedValue(undefined),
        startSession: jest.fn().mockResolvedValue(mockSession),
        connection: mockConnection,
        set: jest.fn(),
    };
});

describe('MongoAdapter', () => {
    let adapter: MongoAdapter;
    const mockConfig: MongoDatabaseConfig = {
        type: 'mongo',
        connectionString: 'mongodb://localhost:27017/testdb',
    };

    beforeEach(() => {
        adapter = new MongoAdapter(mockConfig);
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await adapter.disconnect();
    });

    describe('constructor', () => {
        it('should create adapter instance', () => {
            expect(adapter).toBeDefined();
            expect(adapter).toBeInstanceOf(MongoAdapter);
        });
    });

    describe('isConnected', () => {
        it('should return false when not connected', () => {
            expect(adapter.isConnected()).toBe(false);
        });
    });

    describe('connect', () => {
        it('should connect to MongoDB', async () => {
            const mongoose = await import('mongoose');
            await adapter.connect();
            expect(mongoose.connect).toHaveBeenCalledWith(
                mockConfig.connectionString,
                expect.objectContaining({
                    maxPoolSize: 10,
                    serverSelectionTimeoutMS: 5000,
                }),
            );
        });

        it('should reuse existing connection', async () => {
            const mongoose = await import('mongoose');
            await adapter.connect();
            await adapter.connect();
            expect(mongoose.connect).toHaveBeenCalledTimes(1);
        });
    });

    describe('disconnect', () => {
        it('should disconnect from MongoDB', async () => {
            const mongoose = await import('mongoose');
            await adapter.connect();
            await adapter.disconnect();
            expect(mongoose.disconnect).toHaveBeenCalled();
        });
    });

    describe('createRepository', () => {
        it('should create a repository with all CRUD methods', () => {
            const mockModel = {
                create: jest.fn(),
                findById: jest.fn().mockReturnThis(),
                find: jest.fn().mockReturnThis(),
                findByIdAndUpdate: jest.fn().mockReturnThis(),
                findByIdAndDelete: jest.fn().mockReturnThis(),
                countDocuments: jest.fn().mockReturnThis(),
                exists: jest.fn(),
                insertMany: jest.fn(),
                updateMany: jest.fn().mockReturnThis(),
                deleteMany: jest.fn().mockReturnThis(),
                lean: jest.fn().mockReturnThis(),
                exec: jest.fn(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
            };

            const repo = adapter.createRepository({ model: mockModel });

            expect(repo).toBeDefined();
            expect(typeof repo.create).toBe('function');
            expect(typeof repo.findById).toBe('function');
            expect(typeof repo.findAll).toBe('function');
            expect(typeof repo.findPage).toBe('function');
            expect(typeof repo.updateById).toBe('function');
            expect(typeof repo.deleteById).toBe('function');
            expect(typeof repo.count).toBe('function');
            expect(typeof repo.exists).toBe('function');
            // Bulk operations
            expect(typeof repo.insertMany).toBe('function');
            expect(typeof repo.updateMany).toBe('function');
            expect(typeof repo.deleteMany).toBe('function');
        });

        it('should insertMany documents', async () => {
            const mockDocs = [
                { _id: '1', name: 'John', toObject: () => ({ _id: '1', name: 'John' }) },
                { _id: '2', name: 'Jane', toObject: () => ({ _id: '2', name: 'Jane' }) },
            ];
            const mockModel = {
                insertMany: jest.fn().mockResolvedValue(mockDocs),
            };

            const repo = adapter.createRepository({ model: mockModel });
            const result = await repo.insertMany([{ name: 'John' }, { name: 'Jane' }]);

            expect(mockModel.insertMany).toHaveBeenCalledWith([{ name: 'John' }, { name: 'Jane' }]);
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ _id: '1', name: 'John' });
        });

        it('should return empty array when insertMany with empty data', async () => {
            const mockModel = {
                insertMany: jest.fn(),
            };

            const repo = adapter.createRepository({ model: mockModel });
            const result = await repo.insertMany([]);

            expect(result).toEqual([]);
            expect(mockModel.insertMany).not.toHaveBeenCalled();
        });

        it('should updateMany documents', async () => {
            const mockModel = {
                updateMany: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({ modifiedCount: 5 }),
                }),
            };

            const repo = adapter.createRepository({ model: mockModel });
            const result = await repo.updateMany({ status: 'active' }, { status: 'inactive' });

            expect(mockModel.updateMany).toHaveBeenCalledWith(
                { status: 'active' },
                { status: 'inactive' },
                {},
            );
            expect(result).toBe(5);
        });

        it('should deleteMany documents', async () => {
            const mockModel = {
                deleteMany: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({ deletedCount: 3 }),
                }),
            };

            const repo = adapter.createRepository({ model: mockModel });
            const result = await repo.deleteMany({ status: 'deleted' });

            expect(mockModel.deleteMany).toHaveBeenCalledWith({ status: 'deleted' }, {});
            expect(result).toBe(3);
        });
    });

    describe('withTransaction', () => {
        it('should execute callback within transaction', async () => {
            const mongoose = await import('mongoose');
            const mockCallback = jest.fn().mockResolvedValue({ success: true });

            // Need to connect first
            await adapter.connect();

            await adapter.withTransaction(mockCallback);

            expect(mongoose.startSession).toHaveBeenCalled();
            expect(mockCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    transaction: expect.any(Object),
                    createRepository: expect.any(Function),
                }),
            );
        });

        it('should commit transaction on success', async () => {
            const mongoose = await import('mongoose');
            await adapter.connect();

            const mockSession = await mongoose.startSession();
            await adapter.withTransaction(async () => 'result');

            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        it('should abort transaction on error', async () => {
            const mongoose = await import('mongoose');
            await adapter.connect();

            const mockSession = await mongoose.startSession();
            const error = new Error('Test error');

            await expect(
                adapter.withTransaction(async () => {
                    throw error;
                }),
            ).rejects.toThrow('Test error');

            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        it('should provide transaction context with createRepository', async () => {
            await adapter.connect();
            let capturedContext: MongoTransactionContext | undefined;

            await adapter.withTransaction(async (ctx) => {
                capturedContext = ctx;
                return 'done';
            });

            expect(capturedContext).toBeDefined();
            expect(capturedContext!.transaction).toBeDefined();
            expect(typeof capturedContext!.createRepository).toBe('function');
        });

        it('should respect transaction options', async () => {
            const mongoose = await import('mongoose');
            await adapter.connect();

            const mockSession = await mongoose.startSession();

            await adapter.withTransaction(
                async () => 'result',
                { timeout: 10000, retries: 0 },
            );

            expect(mockSession.startTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    maxCommitTimeMS: 10000,
                }),
            );
        });
    });
});
