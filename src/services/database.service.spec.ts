// src/services/database.service.spec.ts

import { Logger } from '@nestjs/common';

import { MongoAdapter } from '../adapters/mongo.adapter';
import { PostgresAdapter } from '../adapters/postgres.adapter';
import type {
  MongoDatabaseConfig,
  PostgresDatabaseConfig,
} from '../contracts/database.contracts';
import {
  createMockAdapter,
  testDatabaseServiceBasics,
} from '../test/test.utils';

import { DatabaseService } from './database.service';

jest.mock('../adapters/mongo.adapter', () => {
  return {
    MongoAdapter: jest
      .fn()
      .mockImplementation(() => createMockAdapter('mongo')),
  };
});

jest.mock('../adapters/postgres.adapter', () => {
  return {
    PostgresAdapter: jest
      .fn()
      .mockImplementation(() => createMockAdapter('postgres')),
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

    testDatabaseServiceBasics('mongo', () => service, MongoAdapter, {
      repo: 'postgres',
      transaction: 'withPostgresTransaction',
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

    testDatabaseServiceBasics('postgres', () => service, PostgresAdapter, {
      repo: 'mongo',
      transaction: 'withMongoTransaction',
    });

    it('should have healthCheck method', () => {
      expect(typeof service.healthCheck).toBe('function');
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
