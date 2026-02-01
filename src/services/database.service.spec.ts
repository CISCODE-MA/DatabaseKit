// src/services/database.service.spec.ts

import { DatabaseService } from './database.service';
import { MongoDatabaseConfig, PostgresDatabaseConfig } from '../contracts/database.contracts';

describe('DatabaseService', () => {
    describe('MongoDB', () => {
        let service: DatabaseService;
        const mockConfig: MongoDatabaseConfig = {
            type: 'mongo',
            connectionString: 'mongodb://localhost:27017/testdb',
        };

        beforeEach(async () => {
            service = new DatabaseService(mockConfig);
        });

        afterEach(async () => {
            await service.disconnect();
        });

        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should return correct database type', () => {
            expect(service.type).toBe('mongo');
        });

        it('should not be connected initially', () => {
            expect(service.isConnected()).toBe(false);
        });

        it('should throw when creating postgres repository with mongo config', () => {
            expect(() =>
                service.createPostgresRepository({
                    table: 'users',
                }),
            ).toThrow('Database type is "mongo"');
        });
    });

    describe('PostgreSQL', () => {
        let service: DatabaseService;
        const mockConfig: PostgresDatabaseConfig = {
            type: 'postgres',
            connectionString: 'postgresql://localhost:5432/testdb',
        };

        beforeEach(async () => {
            service = new DatabaseService(mockConfig);
        });

        afterEach(async () => {
            await service.disconnect();
        });

        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should return correct database type', () => {
            expect(service.type).toBe('postgres');
        });

        it('should throw when creating mongo repository with postgres config', () => {
            expect(() =>
                service.createMongoRepository({
                    model: {},
                }),
            ).toThrow('Database type is "postgres"');
        });
    });
});
