import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';

import { createMockHost, testExceptionMapping } from '../test/test.utils';

import { DatabaseExceptionFilter } from './database-exception.filter';

describe('DatabaseExceptionFilter', () => {
  let filter: DatabaseExceptionFilter;

  beforeEach(() => {
    filter = new DatabaseExceptionFilter();
  });

  it('should handle HttpException', () => {
    const { host, response } = createMockHost();
    const exception = new BadRequestException('Bad request');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'BadRequestException',
        path: '/test',
      }),
    );
  });

  it('should handle MongoDB duplicate key error', () => {
    testExceptionMapping(
      filter,
      { name: 'MongoServerError', code: 11000, message: 'duplicate key' },
      HttpStatus.CONFLICT,
      'DuplicateKeyError',
    );
  });

  it('should handle MongoDB cast error', () => {
    testExceptionMapping(
      filter,
      { name: 'CastError', message: 'invalid id' },
      HttpStatus.BAD_REQUEST,
      'CastError',
    );
  });

  it('should handle MongoDB validation error', () => {
    testExceptionMapping(
      filter,
      { name: 'ValidationError', message: 'invalid' },
      HttpStatus.BAD_REQUEST,
      'ValidationError',
    );
  });

  it('should handle postgres unique constraint', () => {
    testExceptionMapping(
      filter,
      { code: '23505', message: 'unique', constraint: 'users_email_key' },
      HttpStatus.CONFLICT,
      'UniqueConstraintViolation',
    );
  });

  it('should handle postgres foreign key error', () => {
    testExceptionMapping(
      filter,
      { code: '23503', message: 'fk' },
      HttpStatus.BAD_REQUEST,
      'ForeignKeyViolation',
    );
  });

  it('should handle generic errors', () => {
    const { host, response } = createMockHost();
    const exception = new InternalServerErrorException('boom');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'InternalServerErrorException',
      }),
    );
  });

  it('should handle unknown errors', () => {
    const { host, response } = createMockHost();

    filter.catch('unknown', host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'InternalServerError',
      }),
    );
  });
});
