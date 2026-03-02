import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
} from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";

import { DatabaseExceptionFilter } from "./database-exception.filter";

const createHost = () => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = { url: "/test" };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
};

describe("DatabaseExceptionFilter", () => {
  let filter: DatabaseExceptionFilter;

  beforeEach(() => {
    filter = new DatabaseExceptionFilter();
  });

  it("should handle HttpException", () => {
    const { host, response } = createHost();
    const exception = new BadRequestException("Bad request");

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: "BadRequestException",
        path: "/test",
      }),
    );
  });

  it("should handle MongoDB duplicate key error", () => {
    const { host, response } = createHost();
    const exception = {
      name: "MongoServerError",
      code: 11000,
      message: "duplicate key",
    };

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        error: "DuplicateKeyError",
      }),
    );
  });

  it("should handle MongoDB cast error", () => {
    const { host, response } = createHost();
    const exception = { name: "CastError", message: "invalid id" };

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: "CastError",
      }),
    );
  });

  it("should handle MongoDB validation error", () => {
    const { host, response } = createHost();
    const exception = { name: "ValidationError", message: "invalid" };

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: "ValidationError",
      }),
    );
  });

  it("should handle postgres unique constraint", () => {
    const { host, response } = createHost();
    const exception = {
      code: "23505",
      message: "unique",
      constraint: "users_email_key",
    };

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        error: "UniqueConstraintViolation",
      }),
    );
  });

  it("should handle postgres foreign key error", () => {
    const { host, response } = createHost();
    const exception = { code: "23503", message: "fk" };

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: "ForeignKeyViolation",
      }),
    );
  });

  it("should handle generic errors", () => {
    const { host, response } = createHost();
    const exception = new InternalServerErrorException("boom");

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "InternalServerErrorException",
      }),
    );
  });

  it("should handle unknown errors", () => {
    const { host, response } = createHost();

    filter.catch("unknown", host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "InternalServerError",
      }),
    );
  });
});
