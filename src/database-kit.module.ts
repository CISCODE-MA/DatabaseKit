// src/database-kit.module.ts

import { DynamicModule, Global, Module, Provider, Logger } from '@nestjs/common';
import { DatabaseService } from './services/database.service';
import { LoggerService } from './services/logger.service';
import {
    DatabaseConfig,
    DatabaseKitModuleOptions,
    DatabaseKitModuleAsyncOptions
} from './contracts/database.contracts';
import { DATABASE_TOKEN, DATABASE_OPTIONS_TOKEN } from './config/database.constants';

/**
 * DatabaseKitModule - Main NestJS module for DatabaseKit.
 * 
 * Provides a unified database access layer for MongoDB and PostgreSQL.
 * Use forRoot() for synchronous configuration or forRootAsync() for 
 * configuration that depends on other providers (e.g., ConfigService).
 * 
 * @example Synchronous configuration
 * ```typescript
 * @Module({
 *   imports: [
 *     DatabaseKitModule.forRoot({
 *       config: {
 *         type: 'mongo',
 *         connectionString: process.env.MONGO_URI!,
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 * 
 * @example Async configuration with ConfigService
 * ```typescript
 * @Module({
 *   imports: [
 *     DatabaseKitModule.forRootAsync({
 *       imports: [ConfigModule],
 *       useFactory: (config: ConfigService) => ({
 *         config: {
 *           type: 'postgres',
 *           connectionString: config.get('DATABASE_URL')!,
 *         },
 *       }),
 *       inject: [ConfigService],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({})
export class DatabaseKitModule {
    private static readonly logger = new Logger(DatabaseKitModule.name);

    /**
     * Configures DatabaseKitModule with synchronous options.
     * 
     * @param options - Module configuration options
     * @returns Dynamic module configuration
     */
    static forRoot(options: DatabaseKitModuleOptions): DynamicModule {
        const providers: Provider[] = [
            {
                provide: DATABASE_OPTIONS_TOKEN,
                useValue: options,
            },
            {
                provide: DATABASE_TOKEN,
                useFactory: async () => {
                    const db = new DatabaseService(options.config);

                    if (options.autoConnect !== false) {
                        await db.connect();
                        this.logger.log(`Database connected: ${options.config.type}`);
                    }

                    return db;
                },
            },
            LoggerService,
        ];

        return {
            module: DatabaseKitModule,
            providers,
            exports: [DATABASE_TOKEN, LoggerService],
        };
    }

    /**
     * Configures DatabaseKitModule with asynchronous options.
     * Useful when configuration depends on other providers like ConfigService.
     * 
     * @param options - Async module configuration options
     * @returns Dynamic module configuration
     */
    static forRootAsync(options: DatabaseKitModuleAsyncOptions): DynamicModule {
        const providers: Provider[] = [
            {
                provide: DATABASE_OPTIONS_TOKEN,
                useFactory: options.useFactory,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
                inject: (options.inject || []) as Array<string | symbol | Function>,
            },
            {
                provide: DATABASE_TOKEN,
                useFactory: async (moduleOptions: DatabaseKitModuleOptions) => {
                    const db = new DatabaseService(moduleOptions.config);

                    if (moduleOptions.autoConnect !== false) {
                        await db.connect();
                        this.logger.log(`Database connected: ${moduleOptions.config.type}`);
                    }

                    return db;
                },
                inject: [DATABASE_OPTIONS_TOKEN],
            },
            LoggerService,
        ];

        return {
            module: DatabaseKitModule,
            imports: (options.imports || []) as DynamicModule['imports'],
            providers,
            exports: [DATABASE_TOKEN, LoggerService],
        };
    }

    /**
     * Creates a feature module for additional database connections.
     * Useful for multi-database scenarios.
     * 
     * @param token - Unique token for this database connection
     * @param config - Database configuration
     * @returns Dynamic module configuration
     */
    static forFeature(token: string, config: DatabaseConfig): DynamicModule {
        const providers: Provider[] = [
            {
                provide: token,
                useFactory: async () => {
                    const db = new DatabaseService(config);
                    await db.connect();
                    this.logger.log(`Feature database connected: ${token} (${config.type})`);
                    return db;
                },
            },
        ];

        return {
            module: DatabaseKitModule,
            providers,
            exports: [token],
        };
    }
}
