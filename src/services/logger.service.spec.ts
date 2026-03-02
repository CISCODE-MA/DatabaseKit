import { Logger } from "@nestjs/common";

import { LoggerService } from "./logger.service";

describe("LoggerService", () => {
  let service: LoggerService;

  beforeEach(() => {
    service = new LoggerService();
  });

  it("should log messages", () => {
    const logSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);

    service.log("message", "context");

    expect(logSpy).toHaveBeenCalledWith("message", "context");
  });

  it("should log errors", () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);

    service.error("error", "trace", "context");

    expect(errorSpy).toHaveBeenCalledWith("error", "trace", "context");
  });

  it("should log warnings", () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    service.warn("warning", "context");

    expect(warnSpy).toHaveBeenCalledWith("warning", "context");
  });

  it("should log debug", () => {
    const debugSpy = jest
      .spyOn(Logger.prototype, "debug")
      .mockImplementation(() => undefined);

    service.debug("debug", "context");

    expect(debugSpy).toHaveBeenCalledWith("debug", "context");
  });

  it("should log verbose", () => {
    const verboseSpy = jest
      .spyOn(Logger.prototype, "verbose")
      .mockImplementation(() => undefined);

    service.verbose("verbose", "context");

    expect(verboseSpy).toHaveBeenCalledWith("verbose", "context");
  });

  it("should set log levels", () => {
    const overrideSpy = jest
      .spyOn(Logger, "overrideLogger")
      .mockImplementation(() => undefined);

    service.setLogLevels(["log", "error"]);

    expect(overrideSpy).toHaveBeenCalledWith(["log", "error"]);
  });
});
