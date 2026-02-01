// src/config/database.config.ts

import { DatabaseConfig, DatabaseType } from '../contracts/database.contracts';
import { ENV_KEYS, DEFAULTS } from './database.constants';

/**
 * Helper class for environment-driven database configuration.
 * Implements fail-fast pattern with clear error messages.
 */
export class DatabaseConfigHelper {
    /**
     * Gets an environment variable value.
     * Throws an error if the variable is not set.
     * 
     * @param name - Environment variable name
     * @returns The environment variable value
     * @throws Error if the variable is not configured
     */
    static getEnv(name: string): string {
        const value = process.env[name];
        if (!value) {
            throw new Error(
                `Environment variable ${name} is not configured. ` +
                `Please set it in your .env file or environment.`,
            );
        }
        return value;
    }

    /**
     * Gets an optional environment variable value.
     * 
     * @param name - Environment variable name
     * @param defaultValue - Default value if not set
     * @returns The environment variable value or default
     */
    static getEnvOrDefault(name: string, defaultValue: string): string {
        return process.env[name] || defaultValue;
    }

    /**
     * Gets an environment variable as a number.
     * 
     * @param name - Environment variable name
     * @param defaultValue - Default value if not set
     * @returns The parsed number value
     */
    static getEnvAsNumber(name: string, defaultValue: number): number {
        const value = process.env[name];
        if (!value) return defaultValue;

        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error(
                `Environment variable ${name} must be a valid number. Got: ${value}`,
            );
        }
        return parsed;
    }

    /**
     * Builds a database configuration from environment variables.
     * 
     * @returns DatabaseConfig object
     * @throws Error if required environment variables are missing
     */
    static fromEnv(): DatabaseConfig {
        const type = this.getEnv(ENV_KEYS.DATABASE_TYPE) as DatabaseType;

        if (type !== 'mongo' && type !== 'postgres') {
            throw new Error(
                `Invalid DATABASE_TYPE: "${String(type)}". Must be "mongo" or "postgres".`,
            );
        }

        if (type === 'mongo') {
            return {
                type: 'mongo',
                connectionString: this.getEnv(ENV_KEYS.MONGO_URI),
            };
        }

        return {
            type: 'postgres',
            connectionString: this.getEnv(ENV_KEYS.POSTGRES_URI),
        };
    }

    /**
     * Validates a database configuration.
     * 
     * @param config - The configuration to validate
     * @throws Error if configuration is invalid
     */
    static validate(config: DatabaseConfig): void {
        // Cast to unknown for runtime validation since config may come from external sources
        const rawConfig = config as unknown as Record<string, unknown>;

        if (!rawConfig.type) {
            throw new Error('Database configuration must include a type');
        }

        if (rawConfig.type !== 'mongo' && rawConfig.type !== 'postgres') {
            throw new Error(
                `Invalid database type: "${rawConfig.type}". Must be "mongo" or "postgres".`,
            );
        }

        if (!rawConfig.connectionString) {
            throw new Error('Database configuration must include a connectionString');
        }

        // Basic connection string validation
        if (config.type === 'mongo') {
            if (!config.connectionString.startsWith('mongodb://') &&
                !config.connectionString.startsWith('mongodb+srv://')) {
                throw new Error(
                    'MongoDB connection string must start with "mongodb://" or "mongodb+srv://"',
                );
            }
        }

        if (config.type === 'postgres') {
            if (!config.connectionString.startsWith('postgresql://') &&
                !config.connectionString.startsWith('postgres://')) {
                throw new Error(
                    'PostgreSQL connection string must start with "postgresql://" or "postgres://"',
                );
            }
        }
    }

    /**
     * Gets the pool size from environment or default.
     */
    static getPoolSize(): number {
        return this.getEnvAsNumber(ENV_KEYS.POOL_SIZE, DEFAULTS.POOL_SIZE);
    }

    /**
     * Gets the connection timeout from environment or default.
     */
    static getConnectionTimeout(): number {
        return this.getEnvAsNumber(
            ENV_KEYS.CONNECTION_TIMEOUT,
            DEFAULTS.CONNECTION_TIMEOUT,
        );
    }
}
