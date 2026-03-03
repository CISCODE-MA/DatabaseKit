/**
 * Shared test utilities and mock factories for DatabaseKit tests.
 * Reduces code duplication across test files.
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';

import type {
  Repository,
  PageResult,
  HealthCheckResult,
} from '../contracts/database.contracts';

/**
 * Creates a mock repository with default implementations.
 * Override methods as needed in tests.
 */
export function createMockRepository<T extends { id?: string | number }>(
  overrides?: Partial<Repository<T>>,
): Repository<T> {
  return {
    async create(data: Partial<T>): Promise<T> {
      return { id: 'test-id', ...data } as T;
    },
    async findById(_id: string | number): Promise<T | null> {
      return null;
    },
    async findAll(): Promise<T[]> {
      return [];
    },
    async findOne(): Promise<T | null> {
      return null;
    },
    async updateById(
      _id: string | number,
      _update: Partial<T>,
    ): Promise<T | null> {
      return null;
    },
    async deleteById(_id: string | number): Promise<boolean> {
      return true;
    },
    async count(): Promise<number> {
      return 0;
    },
    async exists(): Promise<boolean> {
      return false;
    },
    async findPage(): Promise<PageResult<T>> {
      return { data: [], page: 1, limit: 10, total: 0, pages: 0 };
    },
    async insertMany(): Promise<T[]> {
      return [];
    },
    async updateMany(): Promise<number> {
      return 0;
    },
    async deleteMany(): Promise<number> {
      return 0;
    },
    async upsert(
      _filter: Record<string, unknown>,
      data: Partial<T>,
    ): Promise<T> {
      return { id: 'test-id', ...data } as T;
    },
    async distinct() {
      return [] as any;
    },
    async select() {
      return [] as any;
    },
    async transaction<R>(callback: () => Promise<R>): Promise<R> {
      return callback();
    },
    ...overrides,
  } as any;
}

/**
 * Creates a mock health check result (success).
 */
export function createMockHealthCheckSuccess(
  type: 'mongo' | 'postgres',
): HealthCheckResult {
  return {
    healthy: true,
    responseTimeMs: 10,
    type,
    details: { version: '1.0.0' },
  };
}

/**
 * Creates a mock health check result (failure).
 */
export function createMockHealthCheckError(
  type: 'mongo' | 'postgres',
  error = 'Connection failed',
): HealthCheckResult {
  return {
    healthy: false,
    responseTimeMs: 50,
    type,
    error,
  };
}

/**
 * Creates a mock paginated result.
 */
export function createMockPageResult<T>(
  data: T[],
  page = 1,
  limit = 10,
  total?: number,
): PageResult<T> {
  const totalItems = total ?? data.length;
  const pages = Math.max(1, Math.ceil(totalItems / limit));
  return { data, page, limit, total: totalItems, pages };
}

/**
 * Test data factories.
 */
export const testData = {
  user: (overrides?: Partial<any>) => ({
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  }),

  users: (count = 3, overrides?: Partial<any>) =>
    Array.from({ length: count }, (_, i) => ({
      id: `user-${i + 1}`,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      role: i === 0 ? 'admin' : 'user',
      createdAt: new Date(),
      ...overrides,
    })),

  filter: (overrides?: Partial<any>) => ({
    status: 'active',
    ...overrides,
  }),

  pageOptions: (overrides?: Partial<any>) => ({
    page: 1,
    limit: 10,
    ...overrides,
  }),
};

/**
 * Common error test cases.
 */
export const errorTestCases = [
  {
    name: 'should throw NotFoundException when record not found',
    error: new NotFoundException('Record not found'),
    expectedStatus: 404,
  },
  {
    name: 'should throw BadRequestException on invalid input',
    error: new BadRequestException('Invalid input'),
    expectedStatus: 400,
  },
];

/**
 * Creates a mock ArgumentsHost for testing exception filters.
 */
export function createMockHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = { url: '/test' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as any;

  return { host, response };
}

/**
 * Creates a mock adapter with default health check and connection methods.
 */
export function createMockAdapter(type: 'mongo' | 'postgres') {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    createRepository: jest.fn().mockReturnValue({ create: jest.fn() }),
    withTransaction: jest.fn(async (cb: (ctx: unknown) => unknown) => cb({})),
    healthCheck: jest.fn().mockResolvedValue({
      healthy: true,
      responseTimeMs: type === 'mongo' ? 1 : 2,
      type,
    }),
  };
}

/**
 * Creates a mock Mongoose model for testing MongoDB adapter.
 * Returns a chainable mock with all common query methods.
 */
export function createMockMongoModel(overrides?: Partial<any>) {
  const mockModel = {
    create: jest.fn(),
    findById: jest.fn().mockReturnThis(),
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    findByIdAndUpdate: jest.fn().mockReturnThis(),
    findByIdAndDelete: jest.fn().mockReturnThis(),
    findOneAndUpdate: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    countDocuments: jest.fn().mockReturnThis(),
    exists: jest.fn(),
    insertMany: jest.fn(),
    updateMany: jest.fn().mockReturnThis(),
    updateOne: jest.fn().mockReturnThis(),
    deleteMany: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    ...overrides,
  };
  return mockModel;
}

/**
 * Creates mock MongoDB documents with toObject() method.
 * Useful for testing insertMany and find operations.
 */
export function createMockMongoDocs<T extends Record<string, any>>(
  data: T[],
): Array<T & { toObject: () => T }> {
  return data.map((item) => ({
    ...item,
    toObject: () => item,
  }));
}

/**
 * Creates a mock Knex query builder for testing PostgreSQL adapter.
 * Returns a chainable mock with all common query methods.
 */
export function createMockQueryBuilder(overrides?: Partial<any>) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    first: jest.fn(),
    returning: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    modify: jest.fn().mockReturnThis(),
    transacting: jest.fn().mockReturnThis(),
    ...overrides,
  };
}

/**
 * Creates a mock Knex instance for testing PostgreSQL adapter.
 * Returns a function that creates query builders when called with a table name.
 */
export function createMockKnex(queryBuilderOverrides?: Partial<any>) {
  const mockQb = createMockQueryBuilder(queryBuilderOverrides);
  const mockKnex = jest.fn(() => mockQb) as any;
  mockKnex.raw = jest.fn();
  mockKnex.transaction = jest.fn();
  return { mockKnex, mockQb };
}

/**
 * Assertion helpers for common patterns.
 */
export const assertions = {
  /**
   * Assert a repository method throws the expected error.
   */
  async throwsError<T>(
    fn: () => Promise<T>,
    expectedErrorClass: any,
    expectedMessage?: string,
  ): Promise<void> {
    try {
      await fn();
      throw new Error('Expected error was not thrown');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!(error instanceof expectedErrorClass)) {
        throw error;
      }
      if (expectedMessage && !error.message.includes(expectedMessage)) {
        throw new Error(
          `Expected message "${expectedMessage}" not found in "${error.message}"`,
        );
      }
    }
  },

  /**
   * Assert paginated result has correct structure.
   */
  isValidPageResult(_result: any): boolean {
    const result = _result as PageResult<unknown>;
    return (
      typeof result === 'object' &&
      Array.isArray(result.data) &&
      typeof result.page === 'number' &&
      typeof result.limit === 'number' &&
      typeof result.total === 'number' &&
      typeof result.pages === 'number'
    );
  },

  /**
   * Assert health check result has correct structure.
   */
  isValidHealthCheck(result: any): boolean {
    return (
      typeof result === 'object' &&
      typeof result.healthy === 'boolean' &&
      typeof result.responseTimeMs === 'number' &&
      ['mongo', 'postgres'].includes(result.type)
    );
  },
};

/**
 * Test exception filter mappings.
 * Reduces duplication in database-exception.filter.spec.ts.
 */
export function testExceptionMapping(
  filter: any,
  exception: any,
  expectedStatus: number,
  expectedError: string,
) {
  const { host, response } = createMockHost();
  filter.catch(exception, host);
  expect(response.status).toHaveBeenCalledWith(expectedStatus);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      statusCode: expectedStatus,
      error: expectedError,
    }),
  );
}

/**
 * Shared test suite for DatabaseService basic functionality.
 * Tests common behaviors across both MongoDB and PostgreSQL adapters.
 * Call this from within a describe block where 'service' is in scope.
 */
export function testDatabaseServiceBasics(
  type: 'mongo' | 'postgres',
  getService: () => any,
  AdapterClass: any,
  oppositeMethods: { repo: string; transaction: string },
) {
  it('should be defined', () => {
    expect(getService()).toBeDefined();
  });

  it('should return correct database type', () => {
    expect(getService().type).toBe(type);
  });

  it('should not be connected initially', () => {
    expect(getService().isConnected()).toBe(false);
  });

  it(`should throw when creating ${oppositeMethods.repo} repository with ${type} config`, () => {
    const methodName =
      type === 'mongo' ? 'createPostgresRepository' : 'createMongoRepository';
    const arg = type === 'mongo' ? { table: 'users' } : { model: {} };

    expect(() => getService()[methodName](arg)).toThrow(
      `Database type is "${type}"`,
    );
  });

  it(`should throw when using ${oppositeMethods.transaction} with ${type} config`, async () => {
    const methodName =
      type === 'mongo' ? 'withPostgresTransaction' : 'withMongoTransaction';

    await expect(getService()[methodName](async () => 'test')).rejects.toThrow(
      `Database type is "${type}"`,
    );
  });

  it(`should have ${type === 'mongo' ? 'withMongoTransaction' : 'withPostgresTransaction'} method`, () => {
    const methodName =
      type === 'mongo' ? 'withMongoTransaction' : 'withPostgresTransaction';
    expect(typeof getService()[methodName]).toBe('function');
  });

  it('should have withTransaction method', () => {
    expect(typeof getService().withTransaction).toBe('function');
  });

  it(`should connect and initialize ${type} adapter`, async () => {
    await getService().connect();

    expect(AdapterClass).toHaveBeenCalledTimes(1);
    const adapterInstance = (AdapterClass as jest.Mock).mock.results[0]
      ?.value as { connect: jest.Mock };
    expect(adapterInstance.connect).toHaveBeenCalled();
    expect(getService().isConnected()).toBe(true);
  });

  it(`should create ${type} repository through adapter`, () => {
    const methodName =
      type === 'mongo' ? 'createMongoRepository' : 'createPostgresRepository';
    const arg = type === 'mongo' ? { model: {} } : { table: 'users' };

    const repo = getService()[methodName](arg);

    expect(repo).toBeDefined();
    const adapterInstance = (AdapterClass as jest.Mock).mock.results[0]
      ?.value as { createRepository: jest.Mock };
    expect(adapterInstance.createRepository).toHaveBeenCalledWith(arg);
  });

  it(`should run ${type} transaction via adapter`, async () => {
    const methodName =
      type === 'mongo' ? 'withMongoTransaction' : 'withPostgresTransaction';

    const result = await getService()[methodName](async () => 'ok');

    expect(result).toBe('ok');
    const adapterInstance = (AdapterClass as jest.Mock).mock.results[0]
      ?.value as { withTransaction: jest.Mock };
    expect(adapterInstance.withTransaction).toHaveBeenCalled();
  });

  it(`should return health check from ${type} adapter`, async () => {
    const result = await getService().healthCheck();

    expect(result.healthy).toBe(true);
    expect(result.type).toBe(type);
  });
}

/**
 * Test soft delete method availability given configuration.
 */
export function testSoftDeleteMethods(repo: any, shouldExist: boolean) {
  const methods = [
    'softDelete',
    'softDeleteMany',
    'restore',
    'restoreMany',
    'findAllWithDeleted',
    'findDeleted',
  ];

  methods.forEach((method) => {
    if (shouldExist) {
      expect(typeof repo[method]).toBe('function');
    } else {
      expect(repo[method]).toBeUndefined();
    }
  });
}

/**
 * Assert timestamp field was added to the method call.
 */
export function expectTimestampAdded(
  mockMethod: jest.Mock,
  field: 'createdAt' | 'updatedAt',
) {
  expect(mockMethod).toHaveBeenCalledWith(
    expect.objectContaining({
      [field]: expect.any(Date),
    }),
  );
}

/**
 * Assert timestamp field was NOT added to the method call.
 */
export function expectTimestampOmitted(
  mockMethod: jest.Mock,
  field: 'createdAt' | 'updatedAt',
) {
  const calls = mockMethod.mock.calls;
  calls.forEach((call) => {
    expect(call[0]).not.toHaveProperty(field);
  });
}

/**
 * Test that a repository has all expected CRUD and bulk operation methods.
 */
export function testRepositoryMethods(repo: any) {
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
}
