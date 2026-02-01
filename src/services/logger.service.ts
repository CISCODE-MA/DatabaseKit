// src/services/logger.service.ts

import { Injectable, Logger, LogLevel } from '@nestjs/common';

/**
 * Centralized logging service for DatabaseKit.
 * Provides structured logging with context support.
 * 
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly logger: LoggerService) {}
 * 
 *   doSomething() {
 *     this.logger.log('Operation started', 'MyService');
 *   }
 * }
 * ```
 */
@Injectable()
export class LoggerService {
    private readonly logger = new Logger('DatabaseKit');

    /**
     * Logs a message at the 'log' level.
     * 
     * @param message - The message to log
     * @param context - Optional context (usually the class/method name)
     */
    log(message: string, context?: string): void {
        this.logger.log(message, context);
    }

    /**
     * Logs a message at the 'error' level.
     * 
     * @param message - The error message
     * @param trace - Optional stack trace
     * @param context - Optional context (usually the class/method name)
     */
    error(message: string, trace?: string, context?: string): void {
        this.logger.error(message, trace, context);
    }

    /**
     * Logs a message at the 'warn' level.
     * 
     * @param message - The warning message
     * @param context - Optional context (usually the class/method name)
     */
    warn(message: string, context?: string): void {
        this.logger.warn(message, context);
    }

    /**
     * Logs a message at the 'debug' level.
     * 
     * @param message - The debug message
     * @param context - Optional context (usually the class/method name)
     */
    debug(message: string, context?: string): void {
        this.logger.debug?.(message, context);
    }

    /**
     * Logs a message at the 'verbose' level.
     * 
     * @param message - The verbose message
     * @param context - Optional context (usually the class/method name)
     */
    verbose(message: string, context?: string): void {
        this.logger.verbose?.(message, context);
    }

    /**
     * Sets the log levels to display.
     * 
     * @param levels - Array of log levels to enable
     */
    setLogLevels(levels: LogLevel[]): void {
        Logger.overrideLogger(levels);
    }
}
