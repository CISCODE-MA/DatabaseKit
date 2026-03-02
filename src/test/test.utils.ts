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
