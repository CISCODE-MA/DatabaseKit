import mongoose, { ConnectOptions, Model, ClientSession } from 'mongoose';
import { Injectable, Logger } from '@nestjs/common';
import {
    MongoDatabaseConfig,
    MongoRepositoryOptions,
    MongoTransactionContext,
    Repository,
    PageResult,
    PageOptions,
    TransactionOptions,
    TransactionCallback,
    DATABASE_KIT_CONSTANTS,
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
     * @param session - Optional MongoDB session for transaction support
     * @returns Repository instance with CRUD methods
     */
    createRepository<T = unknown>(opts: MongoRepositoryOptions, session?: ClientSession): Repository<T> {
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
                const doc = session
                    ? (await model.create([data], { session }))[0]
                    : await model.create(data);
                return (doc as { toObject?: () => T }).toObject?.() ?? (doc as T);
            },

            async findById(id: string | number): Promise<T | null> {
                let query = model.findById(id);
                if (session) query = query.session(session);
                const doc = await query.lean().exec();
                return doc as T | null;
            },

            async findAll(filter: Record<string, unknown> = {}): Promise<T[]> {
                let query = model.find(filter);
                if (session) query = query.session(session);
                const docs = await query.lean().exec();
                return docs as T[];
            },

            async findPage(options: PageOptions = {}): Promise<PageResult<T>> {
                const { filter = {}, page = 1, limit = 10, sort } = options;

                const skip = Math.max(0, (page - 1) * limit);
                let query = model.find(filter).skip(skip).limit(limit);

                if (sort) {
                    query = query.sort(sort as Record<string, 1 | -1>);
                }
                if (session) query = query.session(session);

                const [data, total] = await Promise.all([
                    query.lean().exec(),
                    session
                        ? model.countDocuments(filter).session(session).exec()
                        : model.countDocuments(filter).exec(),
                ]);

                return shapePage(data as T[], page, limit, total);
            },

            async updateById(id: string | number, update: Partial<T>): Promise<T | null> {
                let query = model.findByIdAndUpdate(id, update, { new: true });
                if (session) query = query.session(session);
                const doc = await query.lean().exec();
                return doc as T | null;
            },

            async deleteById(id: string | number): Promise<boolean> {
                let query = model.findByIdAndDelete(id);
                if (session) query = query.session(session);
                const res = await query.lean().exec();
                return !!res;
            },

            async count(filter: Record<string, unknown> = {}): Promise<number> {
                let query = model.countDocuments(filter);
                if (session) query = query.session(session);
                return query.exec();
            },

            async exists(filter: Record<string, unknown> = {}): Promise<boolean> {
                // exists() doesn't support session directly, use findOne
                if (session) {
                    const doc = await model.findOne(filter).session(session).select('_id').lean().exec();
                    return !!doc;
                }
                const res = await model.exists(filter);
                return !!res;
            },

            // -----------------------------
            // Bulk Operations
            // -----------------------------

            async insertMany(data: Partial<T>[]): Promise<T[]> {
                if (data.length === 0) return [];

                const docs = session
                    ? await model.insertMany(data, { session })
                    : await model.insertMany(data);

                return docs.map((doc) =>
                    (doc as { toObject?: () => T }).toObject?.() ?? (doc as T)
                );
            },

            async updateMany(filter: Record<string, unknown>, update: Partial<T>): Promise<number> {
                const options = session ? { session } : {};
                const result = await model.updateMany(filter, update, options).exec();
                return result.modifiedCount;
            },

            async deleteMany(filter: Record<string, unknown>): Promise<number> {
                const options = session ? { session } : {};
                const result = await model.deleteMany(filter, options).exec();
                return result.deletedCount;
            },
        };

        return repo;
    }

    /**
     * Executes a callback within a MongoDB transaction.
     * All database operations within the callback are atomic.
     * 
     * **Note:** MongoDB transactions require a replica set.
     * Standalone MongoDB instances do not support transactions.
     * 
     * @param callback - Function to execute within the transaction
     * @param options - Transaction options
     * @returns Result of the callback function
     * @throws Error if transaction fails after all retries
     * 
     * @example
     * ```typescript
     * const result = await mongoAdapter.withTransaction(async (ctx) => {
     *   const usersRepo = ctx.createRepository<User>({ model: UserModel });
     *   const ordersRepo = ctx.createRepository<Order>({ model: OrderModel });
     *   
     *   const user = await usersRepo.create({ name: 'John' });
     *   const order = await ordersRepo.create({ userId: user._id, total: 100 });
     *   
     *   return { user, order };
     * });
     * ```
     */
    async withTransaction<TResult>(
        callback: TransactionCallback<MongoTransactionContext, TResult>,
        options: TransactionOptions = {},
    ): Promise<TResult> {
        const { retries = 0, timeout = DATABASE_KIT_CONSTANTS.DEFAULT_TRANSACTION_TIMEOUT } = options;

        await this.connect();

        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= retries; attempt++) {
            const session = await mongoose.startSession();

            try {
                session.startTransaction({
                    maxCommitTimeMS: timeout,
                });

                const context: MongoTransactionContext = {
                    transaction: session,
                    createRepository: <T>(opts: MongoRepositoryOptions) =>
                        this.createRepository<T>(opts, session),
                };

                const result = await callback(context);

                await session.commitTransaction();
                this.logger.debug(`Transaction committed successfully (attempt ${attempt + 1})`);

                return result;
            } catch (error) {
                await session.abortTransaction();
                lastError = error as Error;

                this.logger.warn(
                    `Transaction failed (attempt ${attempt + 1}/${retries + 1}): ${lastError.message}`,
                );

                // Check if error is transient and retryable
                const isTransient = this.isTransientError(error);
                if (!isTransient || attempt >= retries) {
                    throw lastError;
                }

                // Exponential backoff before retry
                const backoffMs = Math.min(100 * Math.pow(2, attempt), 3000);
                await this.sleep(backoffMs);
            } finally {
                await session.endSession();
            }
        }

        throw lastError || new Error('Transaction failed');
    }

    /**
     * Checks if an error is transient and can be retried.
     */
    private isTransientError(error: unknown): boolean {
        if (error && typeof error === 'object') {
            const mongoError = error as { hasErrorLabel?: (label: string) => boolean; code?: number };

            // MongoDB transient transaction errors
            if (mongoError.hasErrorLabel?.('TransientTransactionError')) {
                return true;
            }

            // Common retryable error codes
            const retryableCodes = [
                11600, // InterruptedAtShutdown
                11602, // InterruptedDueToReplStateChange
                10107, // NotWritablePrimary
                13435, // NotPrimaryNoSecondaryOk
                13436, // NotPrimaryOrSecondary
                189,   // PrimarySteppedDown
                91,    // ShutdownInProgress
            ];

            if (mongoError.code && retryableCodes.includes(mongoError.code)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Simple sleep utility for retry backoff.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
