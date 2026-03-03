import type {
  MongoDatabaseConfig,
  MongoTransactionContext,
} from '../contracts/database.contracts';
import {
  createMockMongoModel,
  createMockMongoDocs,
  testSoftDeleteMethods,
  testRepositoryMethods,
} from '../test/test.utils';

import { MongoAdapter } from './mongo.adapter';

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
      const mockModel = createMockMongoModel();

      const repo = adapter.createRepository({ model: mockModel });

      testRepositoryMethods(repo);
    });

    it('should insertMany documents', async () => {
      const mockDocs = createMockMongoDocs([
        { _id: '1', name: 'John' },
        { _id: '2', name: 'Jane' },
      ]);
      const mockModel = createMockMongoModel({
        insertMany: jest.fn().mockResolvedValue(mockDocs),
      });

      const repo = adapter.createRepository({ model: mockModel });
      const result = await repo.insertMany([
        { name: 'John' },
        { name: 'Jane' },
      ]);

      expect(mockModel.insertMany).toHaveBeenCalledWith([
        { name: 'John' },
        { name: 'Jane' },
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ _id: '1', name: 'John' });
    });

    it('should return empty array when insertMany with empty data', async () => {
      const mockModel = createMockMongoModel();

      const repo = adapter.createRepository({ model: mockModel });
      const result = await repo.insertMany([]);

      expect(result).toEqual([]);
      expect(mockModel.insertMany).not.toHaveBeenCalled();
    });

    it('should updateMany documents', async () => {
      const mockModel = createMockMongoModel({
        updateMany: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ modifiedCount: 5 }),
        }),
      });

      const repo = adapter.createRepository({ model: mockModel });
      const result = await repo.updateMany(
        { status: 'active' },
        { status: 'inactive' },
      );

      expect(mockModel.updateMany).toHaveBeenCalledWith(
        { status: 'active' },
        { status: 'inactive' },
        {},
      );
      expect(result).toBe(5);
    });

    it('should deleteMany documents', async () => {
      const mockModel = createMockMongoModel({
        deleteMany: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ deletedCount: 3 }),
        }),
      });

      const repo = adapter.createRepository({ model: mockModel });
      const result = await repo.deleteMany({ status: 'deleted' });

      expect(mockModel.deleteMany).toHaveBeenCalledWith(
        { status: 'deleted' },
        {},
      );
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
    });

    it('should respect transaction options', async () => {
      const mongoose = await import('mongoose');
      await adapter.connect();

      const mockSession = await mongoose.startSession();

      await adapter.withTransaction(async () => 'result', {
        timeout: 10000,
        retries: 0,
      });

      expect(mockSession.startTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          maxCommitTimeMS: 10000,
        }),
      );
    });
  });

  describe('healthCheck', () => {
    it('should return unhealthy when not connected', async () => {
      const result = await adapter.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.type).toBe('mongo');
      expect(result.error).toBe('Not connected to MongoDB');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should have healthCheck method', () => {
      expect(typeof adapter.healthCheck).toBe('function');
    });

    it('should return response time in result', async () => {
      const result = await adapter.healthCheck();

      expect(typeof result.responseTimeMs).toBe('number');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Soft Delete', () => {
    it('should not have soft delete methods when softDelete is disabled', () => {
      const mockModel = createMockMongoModel();

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: false,
      });

      testSoftDeleteMethods(repo, false);
    });

    it('should have soft delete methods when softDelete is enabled', () => {
      const mockModel = createMockMongoModel({
        updateOne: jest.fn().mockReturnThis(),
        updateMany: jest.fn().mockReturnThis(),
        findOneAndUpdate: jest.fn().mockReturnThis(),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });

      testSoftDeleteMethods(repo, true);
    });

    it('should soft delete a record by setting deletedAt', async () => {
      const mockModel = createMockMongoModel({
        updateOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        }),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });
      const result = await repo.softDelete?.('123');

      expect(result).toBe(true);
      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: '123', deletedAt: { $eq: null } },
        expect.objectContaining({ deletedAt: expect.any(Date) }),
        {},
      );
    });

    it('should use custom softDeleteField', async () => {
      const mockModel = createMockMongoModel({
        updateOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        }),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
        softDeleteField: 'removedAt',
      });
      await repo.softDelete?.('123');

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: '123', removedAt: { $eq: null } },
        expect.objectContaining({ removedAt: expect.any(Date) }),
        {},
      );
    });

    it('should restore a soft-deleted record', async () => {
      const mockModel = createMockMongoModel({
        findOneAndUpdate: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ _id: '123', name: 'Test' }),
          }),
        }),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });
      const result = await repo.restore?.('123');

      expect(result).toEqual({ _id: '123', name: 'Test' });
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '123', deletedAt: { $ne: null } },
        { $unset: { deletedAt: 1 } },
        { new: true },
      );
    });

    it('should find only deleted records', async () => {
      const mockDocs = [{ _id: '1', deletedAt: new Date() }];
      const mockModel = createMockMongoModel({
        find: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockDocs),
          }),
        }),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });
      const result = await repo.findDeleted?.({});

      expect(result).toEqual(mockDocs);
      expect(mockModel.find).toHaveBeenCalledWith({ deletedAt: { $ne: null } });
    });

    it('should deleteMany as soft delete when enabled', async () => {
      const mockModel = createMockMongoModel({
        updateMany: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ modifiedCount: 5 }),
        }),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });
      const result = await repo.deleteMany({ status: 'old' });

      expect(result).toBe(5);
      expect(mockModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'old', deletedAt: { $eq: null } }),
        expect.objectContaining({ deletedAt: expect.any(Date) }),
        {},
      );
    });

    it('should filter out soft-deleted records in findAll', async () => {
      const mockDocs = [{ _id: '1', name: 'Active' }];
      const mockModel = createMockMongoModel({
        find: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockDocs),
          }),
        }),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });
      await repo.findAll({});

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: { $eq: null } }),
      );
    });
  });

  describe('Timestamps', () => {
    it('should add createdAt on create when timestamps enabled', async () => {
      const mockDoc = {
        _id: '1',
        name: 'Test',
        toObject: () => ({ _id: '1', name: 'Test' }),
      };
      const mockModel = createMockMongoModel({
        create: jest.fn().mockResolvedValue(mockDoc),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        timestamps: true,
      });
      await repo.create({ name: 'Test' });

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test',
          createdAt: expect.any(Date),
        }),
      );
    });

    it('should not add createdAt when timestamps disabled', async () => {
      const mockDoc = {
        _id: '1',
        name: 'Test',
        toObject: () => ({ _id: '1', name: 'Test' }),
      };
      const mockModel = createMockMongoModel({
        create: jest.fn().mockResolvedValue(mockDoc),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        timestamps: false,
      });
      await repo.create({ name: 'Test' });

      expect(mockModel.create).toHaveBeenCalledWith({ name: 'Test' });
    });

    it('should add updatedAt on updateById when timestamps enabled', async () => {
      const mockModel = createMockMongoModel({
        findOneAndUpdate: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ _id: '1', name: 'Updated' }),
          }),
        }),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        timestamps: true,
      });
      await repo.updateById('1', { name: 'Updated' });

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '1' },
        expect.objectContaining({
          name: 'Updated',
          updatedAt: expect.any(Date),
        }),
        { new: true },
      );
    });

    it('should use custom timestamp fields', async () => {
      const mockDoc = {
        _id: '1',
        name: 'Test',
        toObject: () => ({ _id: '1', name: 'Test' }),
      };
      const mockModel = createMockMongoModel({
        create: jest.fn().mockResolvedValue(mockDoc),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        timestamps: true,
        createdAtField: 'created',
        updatedAtField: 'modified',
      });
      await repo.create({ name: 'Test' });

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test',
          created: expect.any(Date),
        }),
      );
    });

    it('should add createdAt to insertMany items when timestamps enabled', async () => {
      const mockDocs = [
        {
          _id: '1',
          name: 'John',
          toObject: () => ({ _id: '1', name: 'John' }),
        },
        {
          _id: '2',
          name: 'Jane',
          toObject: () => ({ _id: '2', name: 'Jane' }),
        },
      ];
      const mockModel = createMockMongoModel({
        insertMany: jest.fn().mockResolvedValue(mockDocs),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        timestamps: true,
      });
      await repo.insertMany([{ name: 'John' }, { name: 'Jane' }]);

      expect(mockModel.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'John', createdAt: expect.any(Date) }),
        expect.objectContaining({ name: 'Jane', createdAt: expect.any(Date) }),
      ]);
    });

    it('should add updatedAt to updateMany when timestamps enabled', async () => {
      const mockModel = createMockMongoModel({
        updateMany: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ modifiedCount: 3 }),
        }),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        timestamps: true,
      });
      await repo.updateMany({ status: 'pending' }, { status: 'active' });

      expect(mockModel.updateMany).toHaveBeenCalledWith(
        { status: 'pending' },
        expect.objectContaining({
          status: 'active',
          updatedAt: expect.any(Date),
        }),
        {},
      );
    });

    it('should soft delete when enabled', async () => {
      const mockModel = createMockMongoModel({
        updateOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        }),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });
      const result = await repo.deleteById('1');

      expect(result).toBe(true);
      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: '1', deletedAt: { $eq: null } },
        { deletedAt: expect.any(Date) },
        {},
      );
    });

    it('should restore soft deleted item when enabled', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: '1' }),
      };
      const mockModel = createMockMongoModel({
        findOneAndUpdate: jest.fn().mockReturnValue(mockQuery),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });
      const result = await repo.restore?.('1');

      expect(result).toEqual({ _id: '1' });
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '1', deletedAt: { $ne: null } },
        { $unset: { deletedAt: 1 } },
        { new: true },
      );
    });

    it('should upsert with timestamps when enabled', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: '1' }),
      };
      const mockModel = createMockMongoModel({
        findOneAndUpdate: jest.fn().mockReturnValue(mockQuery),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        timestamps: true,
      });
      await repo.upsert({ email: 'a@b.com' }, { name: 'John' });

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'a@b.com' },
        expect.objectContaining({
          $set: expect.objectContaining({
            name: 'John',
            updatedAt: expect.any(Date),
          }),
          $setOnInsert: expect.objectContaining({
            createdAt: expect.any(Date),
          }),
        }),
        { upsert: true, new: true },
      );
    });

    it('should return distinct values', async () => {
      const mockQuery = {
        exec: jest.fn().mockResolvedValue(['a', 'b']),
      };
      const mockModel = createMockMongoModel({
        distinct: jest.fn().mockReturnValue(mockQuery),
      });

      const repo = adapter.createRepository<{
        email: string;
        active?: boolean;
      }>({
        model: mockModel,
      });
      const result = await repo.distinct('email', { active: true });

      expect(result).toEqual(['a', 'b']);
      expect(mockModel.distinct).toHaveBeenCalledWith('email', {
        active: true,
      });
    });

    it('should select projected fields', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ name: 'John' }]),
      };
      const mockModel = createMockMongoModel({
        find: jest.fn().mockReturnValue(mockQuery),
      });

      const repo = adapter.createRepository<{ name: string; active?: boolean }>(
        {
          model: mockModel,
        },
      );
      const result = await repo.select({ active: true }, ['name']);

      expect(result).toEqual([{ name: 'John' }]);
      expect(mockModel.find).toHaveBeenCalledWith({ active: true });
      expect(mockQuery.select).toHaveBeenCalledWith({ name: 1 });
    });

    it('should query deleted records when soft delete enabled', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ _id: '1' }]),
      };
      const mockModel = createMockMongoModel({
        find: jest.fn().mockReturnValue(mockQuery),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });
      const result = await repo.findDeleted?.({ status: 'deleted' });

      expect(result).toEqual([{ _id: '1' }]);
      expect(mockModel.find).toHaveBeenCalledWith({
        status: 'deleted',
        deletedAt: { $ne: null },
      });
    });

    it('should include deleted records when requested', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ _id: '1' }]),
      };
      const mockModel = createMockMongoModel({
        find: jest.fn().mockReturnValue(mockQuery),
      });

      const repo = adapter.createRepository({
        model: mockModel,
        softDelete: true,
      });
      const result = await repo.findAllWithDeleted?.({ status: 'any' });

      expect(result).toEqual([{ _id: '1' }]);
      expect(mockModel.find).toHaveBeenCalledWith({ status: 'any' });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when connected and ping succeeds', async () => {
      const mongoose = await import('mongoose');

      Object.defineProperty(mongoose.connection, 'readyState', {
        value: 1,
        writable: true,
      });
      Object.defineProperty(mongoose.connection, 'db', {
        value: {
          admin: () => ({
            ping: jest.fn().mockResolvedValue({ ok: 1 }),
            serverInfo: jest.fn().mockResolvedValue({ version: '6.0.0' }),
          }),
        },
        writable: true,
      });

      const result = await adapter.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.type).toBe('mongo');
      expect(result.details?.version).toBe('6.0.0');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it.skip('should return unhealthy when not connected', async () => {
      const result = await adapter.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Not connected to MongoDB');
      expect(result.type).toBe('mongo');
    });

    it('should return unhealthy when ping fails', async () => {
      const mongoose = await import('mongoose');

      Object.defineProperty(mongoose.connection, 'readyState', {
        value: 1,
        writable: true,
      });
      Object.defineProperty(mongoose.connection, 'db', {
        value: {
          admin: () => ({
            ping: jest.fn().mockResolvedValue({ ok: 0 }),
          }),
        },
        writable: true,
      });

      const result = await adapter.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Ping command failed');
    });

    it('should return unhealthy when ping throws error', async () => {
      const mongoose = await import('mongoose');

      Object.defineProperty(mongoose.connection, 'readyState', {
        value: 1,
        writable: true,
      });
      Object.defineProperty(mongoose.connection, 'db', {
        value: {
          admin: () => ({
            ping: jest.fn().mockRejectedValue(new Error('Connection lost')),
          }),
        },
        writable: true,
      });

      const result = await adapter.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection lost');
    });
  });

  describe('withTransaction', () => {
    it('should execute callback within transaction successfully', async () => {
      const mongoose = await import('mongoose');
      await adapter.connect();

      const callback = jest.fn(async (ctx: MongoTransactionContext) => {
        expect(ctx.transaction).toBeDefined();
        expect(ctx.createRepository).toBeDefined();
        return { result: 'success' };
      });

      const result = await adapter.withTransaction(callback);

      expect(result).toEqual({ result: 'success' });
      expect(callback).toHaveBeenCalled();
      const mockSession = await mongoose.startSession();
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should retry on transient errors', async () => {
      await adapter.connect();

      const transientError = {
        hasErrorLabel: jest.fn(
          (label: string) => label === 'TransientTransactionError',
        ),
        message: 'Transient error',
      };

      let attempt = 0;
      const callback = jest.fn(async () => {
        attempt++;
        if (attempt === 1) {
          throw transientError;
        }
        return { result: 'success after retry' };
      });

      const result = await adapter.withTransaction(callback, { retries: 1 });

      expect(result).toEqual({ result: 'success after retry' });
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should retry on specific MongoDB error codes', async () => {
      await adapter.connect();

      const retryableError = {
        code: 11600, // InterruptedAtShutdown
        message: 'Server shutting down',
      };

      let attempt = 0;
      const callback = jest.fn(async () => {
        attempt++;
        if (attempt === 1) {
          throw retryableError;
        }
        return { result: 'success after retry' };
      });

      const result = await adapter.withTransaction(callback, { retries: 1 });

      expect(result).toEqual({ result: 'success after retry' });
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it.skip('should throw after exhausting retries', async () => {
      await adapter.connect();

      const persistentError = {
        hasErrorLabel: jest.fn(
          (label: string) => label === 'TransientTransactionError',
        ),
        message: 'Persistent error',
      };

      const callback = jest.fn(async () => {
        throw persistentError;
      });

      await expect(
        adapter.withTransaction(callback, { retries: 2 }),
      ).rejects.toThrow('Persistent error');

      expect(callback).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should abort transaction on error', async () => {
      const mongoose = await import('mongoose');
      await adapter.connect();

      const error = new Error('Transaction failed');
      const callback = jest.fn(async () => {
        throw error;
      });

      await expect(adapter.withTransaction(callback)).rejects.toThrow(
        'Transaction failed',
      );

      const mockSession = await mongoose.startSession();
      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should handle all retryable error codes', async () => {
      await adapter.connect();

      const retryableCodes = [11600, 11602, 10107, 13435, 13436, 189, 91];

      for (const code of retryableCodes) {
        jest.clearAllMocks();

        let attempt = 0;
        const callback = jest.fn(async () => {
          attempt++;
          if (attempt === 1) {
            const error = new Error(`Error code ${code}`) as Error & {
              code: number;
            };
            error.code = code;
            throw error;
          }
          return { code };
        });

        const result = await adapter.withTransaction(callback, { retries: 1 });
        expect(result).toEqual({ code });
      }
    });
  });

  describe('connection event handlers', () => {
    it('should register connection event handlers', async () => {
      const mongoose = await import('mongoose');
      await adapter.connect();

      expect(mongoose.connection.on).toHaveBeenCalledWith(
        'connected',
        expect.any(Function),
      );
      expect(mongoose.connection.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
      expect(mongoose.connection.on).toHaveBeenCalledWith(
        'disconnected',
        expect.any(Function),
      );
    });

    it('should apply custom connection options', async () => {
      const mongoose = await import('mongoose');
      const customOptions = { retryWrites: true };

      await adapter.connect(customOptions);

      expect(mongoose.connect).toHaveBeenCalledWith(
        mockConfig.connectionString,
        expect.objectContaining(customOptions),
      );
    });

    it('should use custom pool configuration', async () => {
      const mongoose = await import('mongoose');
      const adapterWithPool = new MongoAdapter({
        ...mockConfig,
        pool: { min: 2, max: 20, idleTimeoutMs: 60000 },
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 90000,
      });

      await adapterWithPool.connect();

      expect(mongoose.connect).toHaveBeenCalledWith(
        mockConfig.connectionString,
        expect.objectContaining({
          maxPoolSize: 20,
          minPoolSize: 2,
          maxIdleTimeMS: 60000,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 90000,
        }),
      );
    });
  });
});
