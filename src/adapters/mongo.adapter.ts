// src/adapters/mongo.adapter.ts

import mongoose, { ConnectOptions, Model } from 'mongoose';
import { Injectable, Logger } from '@nestjs/common';
import {
    MongoDatabaseConfig,
    MongoRepositoryOptions,
    Repository,
    PageResult,
    PageOptions,
} from '../contracts/database.contracts';

/**
 * MongoDB adapter for DatabaseKit.
 * Handles MongoDB connection and repository creation via Mongoose.
 * 
 * @example
 * ```typescript
 * const adapter = new MongoAdapter({ type: 'mongo', connectionString: 'mongodb://...' });
 * await adapter.connect();
 * const repo = adapter.createRepository({ model: UserModel });
 * ```
 */
@Injectable()
export class MongoAdapter {
    private readonly logger = new Logger(MongoAdapter.name);
    private readonly config: MongoDatabaseConfig;
    private connectionPromise?: Promise<typeof mongoose>;

    constructor(config: MongoDatabaseConfig) {
        this.config = config;
        mongoose.set('strictQuery', false);
    }

    /**
     * Establishes connection to MongoDB.
     * Connection is lazy-loaded and cached for reuse.
     * 
     * @param options - Additional Mongoose connection options
     * @returns Promise resolving to mongoose instance
     */
    async connect(options: ConnectOptions = {}): Promise<typeof mongoose> {
        if (!this.connectionPromise) {
            this.logger.log('Connecting to MongoDB...');

            this.connectionPromise = mongoose.connect(this.config.connectionString, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                ...options,
            });

            mongoose.connection.on('connected', () => {
                this.logger.log('Successfully connected to MongoDB');
            });

            mongoose.connection.on('error', (err) => {
                this.logger.error('MongoDB connection error', err?.message || err);
            });

            mongoose.connection.on('disconnected', () => {
                this.logger.warn('MongoDB disconnected');
            });
        }

        return this.connectionPromise;
    }

    /**
     * Gracefully disconnects from MongoDB.
     */
    async disconnect(): Promise<void> {
        await mongoose.disconnect();
        this.connectionPromise = undefined;
        this.logger.log('Disconnected from MongoDB');
    }

    /**
     * Checks if connected to MongoDB.
     */
    isConnected(): boolean {
        return mongoose.connection.readyState === 1;
    }

    /**
     * Creates a repository for a Mongoose model.
     * The repository provides a standardized CRUD interface.
     * 
     * @param opts - Options containing the Mongoose model
     * @returns Repository instance with CRUD methods
     */
    createRepository<T = unknown>(opts: MongoRepositoryOptions): Repository<T> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = opts.model as Model<any>;
        const shapePage = (
            data: T[],
            page: number,
            limit: number,
            total: number,
        ): PageResult<T> => {
            const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
            return { data, page, limit, total, pages };
        };

        const repo: Repository<T> = {
            async create(data: Partial<T>): Promise<T> {
                const doc = await model.create(data);
                return (doc as { toObject?: () => T }).toObject?.() ?? (doc as T);
            },

            async findById(id: string | number): Promise<T | null> {
                const doc = await model.findById(id).lean().exec();
                return doc as T | null;
            },

            async findAll(filter: Record<string, unknown> = {}): Promise<T[]> {
                const docs = await model.find(filter).lean().exec();
                return docs as T[];
            },

            async findPage(options: PageOptions = {}): Promise<PageResult<T>> {
                const { filter = {}, page = 1, limit = 10, sort } = options;

                const skip = Math.max(0, (page - 1) * limit);
                let query = model.find(filter).skip(skip).limit(limit);

                if (sort) {
                    query = query.sort(sort as Record<string, 1 | -1>);
                }

                const [data, total] = await Promise.all([
                    query.lean().exec(),
                    model.countDocuments(filter).exec(),
                ]);

                return shapePage(data as T[], page, limit, total);
            },

            async updateById(id: string | number, update: Partial<T>): Promise<T | null> {
                const doc = await model
                    .findByIdAndUpdate(id, update, { new: true })
                    .lean()
                    .exec();
                return doc as T | null;
            },

            async deleteById(id: string | number): Promise<boolean> {
                const res = await model.findByIdAndDelete(id).lean().exec();
                return !!res;
            },

            async count(filter: Record<string, unknown> = {}): Promise<number> {
                return model.countDocuments(filter).exec();
            },

            async exists(filter: Record<string, unknown> = {}): Promise<boolean> {
                const res = await model.exists(filter);
                return !!res;
            },
        };

        return repo;
    }
}
