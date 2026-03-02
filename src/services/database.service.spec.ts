// src/services/database.service.spec.ts

import { Logger } from '@nestjs/common';

import { MongoAdapter } from '../adapters/mongo.adapter';
import { PostgresAdapter } from '../adapters/postgres.adapter';
import type {
  MongoDatabaseConfig,
  PostgresDatabaseConfig,
} from '../contracts/database.contracts';

import { DatabaseService } from './database.service';

jest.mock('../adapters/mongo.adapter', () => {
  return {
    MongoAdapter: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
      createRepository: jest.fn().mockReturnValue({ create: jest.fn() }),
      withTransaction: jest.fn(async (cb: (ctx: unknown) => unknown) => cb({})),
      healthCheck: jest
        .fn()
        .mockResolvedValue({ healthy: true, responseTimeMs: 1, type: 'mongo' }),
    })),
  };
});

jest.mock('../adapters/postgres.adapter', () => {
  return {
    PostgresAdapter: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockReturnValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
      createRepository: jest.fn().mockReturnValue({ create: jest.fn() }),
      withTransaction: jest.fn(async (cb: (ctx: unknown) => unknown) => cb({})),
      healthCheck: jest.fn().mockResolvedValue({
        healthy: true,
        responseTimeMs: 2,
        type: 'postgres',
      }),
    })),
  };
});

describe('DatabaseService', () => {
  describe('MongoDB', () => {
    let service: DatabaseService;
    const mockConfig: MongoDatabaseConfig = {
      type: 'mongo',
      connectionString: 'mongodb://localhost:27017/testdb',
    };

    beforeEach(() => {
      service = new DatabaseService(mockConfig);
    });

    afterEach(async () => {
      await service.disconnect();
      jest.clearAllMocks();
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return correct database type', () => {
      expect(service.type).toBe('mongo');
    });

    it('should not be connected initially', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should throw when creating postgres repository with mongo config', () => {
      expect(() =>
        service.createPostgresRepository({
          table: 'users',
        }),
      ).toThrow('Database type is "mongo"');
    });

    it('should throw when using withPostgresTransaction with mongo config', async () => {
      await expect(
        service.withPostgresTransaction(async () => {
          return 'test';
        }),
      ).rejects.toThrow('Database type is "mongo"');
    });

    it('should have withMongoTransaction method', () => {
      expect(typeof service.withMongoTransaction).toBe('function');
    });

    it('should have withTransaction method', () => {
      expect(typeof service.withTransaction).toBe('function');
    });

    it('should connect and initialize mongo adapter', async () => {
      await service.connect();

      expect(MongoAdapter).toHaveBeenCalledTimes(1);
      const adapterInstance = (MongoAdapter as jest.Mock).mock.results[0]
        ?.value as { connect: jest.Mock };
      expect(adapterInstance.connect).toHaveBeenCalled();
      expect(service.isConnected()).toBe(true);
    });

    it('should create mongo repository through adapter', () => {
      const repo = service.createMongoRepository({ model: {} });

      expect(repo).toBeDefined();
      const adapterInstance = (MongoAdapter as jest.Mock).mock.results[0]
        ?.value as { createRepository: jest.Mock };
      expect(adapterInstance.createRepository).toHaveBeenCalledWith({
        model: {},
      });
    });

    it('should run mongo transaction via adapter', async () => {
      const result = await service.withMongoTransaction(async () => 'ok');

      expect(result).toBe('ok');
      const adapterInstance = (MongoAdapter as jest.Mock).mock.results[0]
        ?.value as { withTransaction: jest.Mock };
      expect(adapterInstance.withTransaction).toHaveBeenCalled();
    });

    it('should return health check from mongo adapter', async () => {
      const result = await service.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.type).toBe('mongo');
    });
  });

  describe('PostgreSQL', () => {
    let service: DatabaseService;
    const mockConfig: PostgresDatabaseConfig = {
      type: 'postgres',
      connectionString: 'postgresql://localhost:5432/testdb',
    };

    beforeEach(() => {
      service = new DatabaseService(mockConfig);
    });

    afterEach(async () => {
      await service.disconnect();
      jest.clearAllMocks();
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return correct database type', () => {
      expect(service.type).toBe('postgres');
    });

    it('should throw when creating mongo repository with postgres config', () => {
      expect(() =>
        service.createMongoRepository({
          model: {},
        }),
      ).toThrow('Database type is "postgres"');
    });

    it('should throw when using withMongoTransaction with postgres config', async () => {
      await expect(
        service.withMongoTransaction(async () => {
          return 'test';
        }),
      ).rejects.toThrow('Database type is "postgres"');
    });

    it('should have withPostgresTransaction method', () => {
      expect(typeof service.withPostgresTransaction).toBe('function');
    });

    it('should have withTransaction method', () => {
      expect(typeof service.withTransaction).toBe('function');
    });

    it('should have healthCheck method', () => {
      expect(typeof service.healthCheck).toBe('function');
    });

    it('should connect and initialize postgres adapter', async () => {
      await service.connect();

      expect(PostgresAdapter).toHaveBeenCalledTimes(1);
      const adapterInstance = (PostgresAdapter as jest.Mock).mock.results[0]
        ?.value as { connect: jest.Mock };
      expect(adapterInstance.connect).toHaveBeenCalled();
      expect(service.isConnected()).toBe(true);
    });

    it('should create postgres repository through adapter', () => {
      const repo = service.createPostgresRepository({ table: 'users' });

      expect(repo).toBeDefined();
      const adapterInstance = (PostgresAdapter as jest.Mock).mock.results[0]
        ?.value as { createRepository: jest.Mock };
      expect(adapterInstance.createRepository).toHaveBeenCalledWith({
        table: 'users',
      });
    });

    it('should run postgres transaction via adapter', async () => {
      const result = await service.withPostgresTransaction(async () => 'ok');

      expect(result).toBe('ok');
      const adapterInstance = (PostgresAdapter as jest.Mock).mock.results[0]
        ?.value as { withTransaction: jest.Mock };
      expect(adapterInstance.withTransaction).toHaveBeenCalled();
    });

    it('should return health check from postgres adapter', async () => {
      const result = await service.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.type).toBe('postgres');
    });
  });

  describe('disconnect', () => {
    it('should log and rethrow disconnect errors', async () => {
      const service = new DatabaseService({
        type: 'mongo',
        connectionString: 'mongodb://localhost:27017/testdb',
      });
      const error = new Error('disconnect failed');
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      (
        service as unknown as { mongoAdapter: { disconnect: jest.Mock } }
      ).mongoAdapter = {
        disconnect: jest.fn().mockRejectedValue(error),
      };

      await expect(service.disconnect()).rejects.toThrow('disconnect failed');
      expect(loggerSpy).toHaveBeenCalled();
    });
  });

  describe('adapter accessors', () => {
    it('should throw when getMongoAdapter is called for postgres', () => {
      const service = new DatabaseService({
        type: 'postgres',
        connectionString: 'postgresql://localhost:5432/testdb',
      });

      expect(() => service.getMongoAdapter()).toThrow(
        'getMongoAdapter() is only available for MongoDB connections',
      );
    });

    it('should throw when getPostgresAdapter is called for mongo', () => {
      const service = new DatabaseService({
        type: 'mongo',
        connectionString: 'mongodb://localhost:27017/testdb',
      });

      expect(() => service.getPostgresAdapter()).toThrow(
        'getPostgresAdapter() is only available for PostgreSQL connections',
      );
    });
  });

  describe('healthCheck', () => {
    it('should return unhealthy result for unsupported types', async () => {
      const service = new DatabaseService({
        type: 'sqlite' as unknown as 'mongo',
        connectionString: 'file::memory:',
      });

      const result = await service.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Unsupported database type');
    });
  });
});
