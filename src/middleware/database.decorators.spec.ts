import { Inject } from "@nestjs/common";

import { DATABASE_TOKEN } from "../config/database.constants";

import { InjectDatabase, InjectDatabaseByToken } from "./database.decorators";

jest.mock("@nestjs/common", () => {
  return {
    Inject: jest.fn(() => "decorator"),
  };
});

describe("database.decorators", () => {
  it("should create InjectDatabase decorator with DATABASE_TOKEN", () => {
    const decorator = InjectDatabase();

    expect(Inject).toHaveBeenCalledWith(DATABASE_TOKEN);
    expect(decorator).toBe("decorator");
  });

  it("should create InjectDatabaseByToken decorator with custom token", () => {
    const decorator = InjectDatabaseByToken("ANALYTICS_DB");

    expect(Inject).toHaveBeenCalledWith("ANALYTICS_DB");
    expect(decorator).toBe("decorator");
  });
});
