import { DatabaseConfigHelper } from './database.config';
import { DEFAULTS, ENV_KEYS } from './database.constants';

const originalEnv = { ...process.env };

describe('DatabaseConfigHelper', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  describe('getEnv', () => {
    it('should return the environment value when present', () => {
      process.env.TEST_ENV = 'value';
      expect(DatabaseConfigHelper.getEnv('TEST_ENV')).toBe('value');
    });

    it('should throw when the environment variable is missing', () => {
      delete process.env.MISSING_ENV;
      expect(() => DatabaseConfigHelper.getEnv('MISSING_ENV')).toThrow(
        'Environment variable MISSING_ENV is not configured',
      );
    });
  });

  describe('getEnvOrDefault', () => {
    it('should return env value when set', () => {
      process.env.OPTIONAL_ENV = 'present';
      expect(
        DatabaseConfigHelper.getEnvOrDefault('OPTIONAL_ENV', 'fallback'),
      ).toBe('present');
    });

    it('should return default when env is missing', () => {
      delete process.env.OPTIONAL_ENV;
      expect(
        DatabaseConfigHelper.getEnvOrDefault('OPTIONAL_ENV', 'fallback'),
      ).toBe('fallback');
    });
  });

  describe('getEnvAsNumber', () => {
    it('should parse a valid numeric value', () => {
      process.env.NUM_ENV = '42';
      expect(DatabaseConfigHelper.getEnvAsNumber('NUM_ENV', 10)).toBe(42);
    });

    it('should return default when missing', () => {
      delete process.env.NUM_ENV;
      expect(DatabaseConfigHelper.getEnvAsNumber('NUM_ENV', 10)).toBe(10);
    });

    it('should throw on invalid number', () => {
      process.env.NUM_ENV = 'not-a-number';
      expect(() => DatabaseConfigHelper.getEnvAsNumber('NUM_ENV', 10)).toThrow(
        'Environment variable NUM_ENV must be a valid number',
      );
    });
  });

  describe('fromEnv', () => {
    it('should build mongo config from env', () => {
      process.env[ENV_KEYS.DATABASE_TYPE] = 'mongo';
      process.env[ENV_KEYS.MONGO_URI] = 'mongodb://localhost:27017/testdb';

      const config = DatabaseConfigHelper.fromEnv();
      expect(config.type).toBe('mongo');
      expect(config.connectionString).toBe('mongodb://localhost:27017/testdb');
    });

    it('should build postgres config from env', () => {
      process.env[ENV_KEYS.DATABASE_TYPE] = 'postgres';
      process.env[ENV_KEYS.POSTGRES_URI] = 'postgresql://localhost:5432/testdb';

      const config = DatabaseConfigHelper.fromEnv();
      expect(config.type).toBe('postgres');
      expect(config.connectionString).toBe(
        'postgresql://localhost:5432/testdb',
      );
    });

    it('should throw on invalid database type', () => {
      process.env[ENV_KEYS.DATABASE_TYPE] = 'sqlite';
      expect(() => DatabaseConfigHelper.fromEnv()).toThrow(
        'Invalid DATABASE_TYPE',
      );
    });
  });

  describe('validate', () => {
    it('should throw when type is missing', () => {
      expect(() =>
        DatabaseConfigHelper.validate(
          {} as unknown as {
            type: 'mongo';
            connectionString: string;
          },
        ),
      ).toThrow('Database configuration must include a type');
    });

    it('should throw on invalid type', () => {
      expect(() =>
        DatabaseConfigHelper.validate({
          type: 'sqlite' as unknown as 'mongo',
          connectionString: 'file::memory:',
        }),
      ).toThrow('Invalid database type');
    });

    it('should throw when connectionString is missing', () => {
      expect(() =>
        DatabaseConfigHelper.validate({
          type: 'mongo',
        } as unknown as { type: 'mongo'; connectionString: string }),
      ).toThrow('Database configuration must include a connectionString');
    });

    it('should reject invalid mongo connection string', () => {
      expect(() =>
        DatabaseConfigHelper.validate({
          type: 'mongo',
          connectionString: 'invalid://localhost',
        }),
      ).toThrow('MongoDB connection string must start with');
    });

    it('should reject invalid postgres connection string', () => {
      expect(() =>
        DatabaseConfigHelper.validate({
          type: 'postgres',
          connectionString: 'invalid://localhost',
        }),
      ).toThrow('PostgreSQL connection string must start with');
    });

    it('should accept valid configs', () => {
      expect(() =>
        DatabaseConfigHelper.validate({
          type: 'mongo',
          connectionString: 'mongodb://localhost:27017/testdb',
        }),
      ).not.toThrow();
    });
  });

  describe('pool settings', () => {
    it('should return pool size from env', () => {
      process.env[ENV_KEYS.POOL_SIZE] = '20';
      expect(DatabaseConfigHelper.getPoolSize()).toBe(20);
    });

    it('should return default pool size when missing', () => {
      delete process.env[ENV_KEYS.POOL_SIZE];
      expect(DatabaseConfigHelper.getPoolSize()).toBe(DEFAULTS.POOL_SIZE);
    });

    it('should return connection timeout from env', () => {
      process.env[ENV_KEYS.CONNECTION_TIMEOUT] = '7000';
      expect(DatabaseConfigHelper.getConnectionTimeout()).toBe(7000);
    });
  });
});
