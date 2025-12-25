````md
# @ciscodeapps-template/database

A framework-agnostic, Nest-friendly, OOP-style database library that gives you a single, consistent repository API for:

- MongoDB (via Mongoose)
- PostgreSQL (via Knex + pg)

You create a `Database` instance with `{ type: 'mongo' | 'postgres', connectionString }`, then create repositories per entity.  
Repositories expose the same methods regardless of the underlying DB (Mongo or Postgres).

---

## ✨ Features

- ✅ Works with MongoDB and PostgreSQL
- ✅ OOP-style: create a `Database` object and repositories from it
- ✅ Model-agnostic: you pass your own Mongoose model or table config
- ✅ Same repository API for Mongo and Postgres:
  - `create`
  - `findById`
  - `findAll`
  - `findPage` (pagination)
  - `updateById`
  - `deleteById`
  - `count`
  - `exists`
- ✅ Optional NestJS module with `DatabaseModule.forRoot()` and `@InjectDatabase()`
- ✅ Safe filtering + pagination for building consistent REST endpoints

---

## 📦 Installation

> This assumes you’ve already set up your `.npmrc` to connect to your Azure Artifacts feed.

In your **project using the library**:

```bash
npm install @ciscodeapps-template/database
````

Make sure you also have **Mongoose** or **Postgres** available, depending on what you’re using:

```bash
# For MongoDB projects
npm install mongoose

# For Postgres projects
npm install pg
```

> The library itself already depends on `knex` and `pg`, but you still need the actual database & connection string.

---

## 🧠 Core Concepts

* A **Database instance** represents a connection to **one** database:

  * `{ type: 'mongo', connectionString: MONGO_URI }`
  * `{ type: 'postgres', connectionString: PG_URI }`
* From that instance, you create **repositories** for your entities:

  * For Mongo, repositories are bound to **Mongoose models**.
  * For Postgres, repositories are bound to a **table config** (`PostgresEntityConfig`).
* A repository gives you a **simple CRUD + pagination API** that your endpoints can use.

---

## 🚀 Quick Start (Plain Node / Express)

### 1. Create a Database instance (MongoDB example)

```ts
import { Database } from '@ciscodeapps-template/database';
import UserModel from './models/user.model'; // your own Mongoose model

// 1) Create the Database instance
const mongoDb = new Database({
  type: 'mongo',
  connectionString: process.env.MONGO_URI as string,
});

// 2) Connect once at startup
await mongoDb.connect();

// 3) Create a repository for an entity
const usersRepo = mongoDb.createMongoRepository<{ _id: string; name: string }>({
  model: UserModel,
});
```

### 2. PostgreSQL example

```ts
import { Database } from '@ciscodeapps-template/database';

interface Order {
  id: string;
  user_id: string;
  total: number;
  created_at: string;
}

const pgDb = new Database({
  type: 'postgres',
  connectionString: process.env.PG_URI as string,
});

await pgDb.connect();

const ordersRepo = pgDb.createPostgresRepository<Order>({
  table: 'orders',
  primaryKey: 'id',
  columns: ['id', 'user_id', 'total', 'created_at', 'is_deleted'],
  defaultFilter: { is_deleted: false }, // soft-delete convention
});
```

---

## 🧱 Repository API

Both Mongo and Postgres repositories expose the same methods:

```ts
interface Repository<T = any, Filter = Record<string, any>> {
  create(data: Partial<T>): Promise<T>;
  findById(id: string | number): Promise<T | null>;
  findAll(filter?: Filter): Promise<T[]>;
  findPage(options?: {
    filter?: Filter;
    page?: number;
    limit?: number;
    sort?: string | Record<string, 1 | -1 | 'asc' | 'desc'>;
  }): Promise<{
    data: T[];
    page: number;
    limit: number;
    total: number;
    pages: number;
  }>;
  updateById(id: string | number, update: Partial<T>): Promise<T | null>;
  deleteById(id: string | number): Promise<boolean>;
  count(filter?: Filter): Promise<number>;
  exists(filter?: Filter): Promise<boolean>;
}
```

### Example calls

```ts
// Create
const user = await usersRepo.create({ name: 'Yasser' });

// Find by id
const found = await usersRepo.findById(user._id);

// List all
const allUsers = await usersRepo.findAll({});

// Paginated list
const page1 = await usersRepo.findPage({
  filter: { status: 'active' },
  page: 1,
  limit: 20,
  sort: '-createdAt', // or { createdAt: -1 }
});

// Update
const updated = await usersRepo.updateById(user._id, { name: 'Updated Name' });

// Delete
const deletedOk = await usersRepo.deleteById(user._id);

// Count
const totalActive = await usersRepo.count({ status: 'active' });

// Exists
const exists = await usersRepo.exists({ email: 'example@site.com' });
```

---

## 🌐 Mounting Endpoints (Express Example)

The library is **only** about DB access. You’re free to expose any HTTP API you want.
Here’s a simple pattern to wire the package into an Express CRUD router.

### 1. Build a generic CRUD router

```ts
// src/routes/crudFactory.ts
import express from 'express';
import { Repository } from '@ciscodeapps-template/database';

export function buildCrudRouter<T>(repo: Repository<T>) {
  const router = express.Router();

  // CREATE
  router.post('/', async (req, res, next) => {
    try {
      const created = await repo.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  // LIST (with simple pagination)
  router.get('/', async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 10);
      const sort = req.query.sort as string | undefined;

      // Everything else in query is treated as filter
      const { page: _p, limit: _l, sort: _s, ...rawFilter } = req.query;
      const filter = rawFilter as Record<string, any>;

      const result = await repo.findPage({ filter, page, limit, sort });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET BY ID
  router.get('/:id', async (req, res, next) => {
    try {
      const doc = await repo.findById(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Not found' });
      res.json(doc);
    } catch (err) {
      next(err);
    }
  });

  // UPDATE BY ID
  router.put('/:id', async (req, res, next) => {
    try {
      const updated = await repo.updateById(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: 'Not found' });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // DELETE BY ID
  router.delete('/:id', async (req, res, next) => {
    try {
      const ok = await repo.deleteById(req.params.id);
      if (!ok) return res.status(404).json({ message: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

### 2. Wire it in your Express app (Mongo example)

```ts
// src/server.ts
import express from 'express';
import { Database } from '@ciscodeapps-template/database';
import UserModel from './models/user.model';
import { buildCrudRouter } from './routes/crudFactory';

async function bootstrap() {
  const app = express();
  app.use(express.json());

  // 1) Create & connect the Mongo Database instance
  const db = new Database({
    type: 'mongo',
    connectionString: process.env.MONGO_URI as string,
  });
  await db.connect();

  // 2) Create a repository for "users"
  const usersRepo = db.createMongoRepository<{ _id: string; name: string }>({
    model: UserModel,
  });

  // 3) Mount CRUD endpoints under /api/users
  app.use('/api/users', buildCrudRouter(usersRepo));

  app.get('/health', (_, res) => res.json({ ok: true }));

  app.use((err: any, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API listening on port ${port}`));
}

bootstrap().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
```

### 3. Calling the endpoints

Once running, you can hit:

* `GET /api/users` – list (paginated)

  * Supports `?page=1&limit=10&status=active&sort=-createdAt`
* `GET /api/users/:id` – get by id
* `POST /api/users` – create
  Body: `{ "name": "Yasser" }`
* `PUT /api/users/:id` – update
  Body: `{ "name": "New Name" }`
* `DELETE /api/users/:id` – delete

Exactly the same pattern works for **Postgres**, just build the repo with `createPostgresRepository` instead.

---

## 🧩 Using with NestJS

The library also ships with a **NestJS module wrapper** for dependency injection.

### 1. Register the Database in `AppModule`

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import {
  DatabaseModule,
} from '@ciscodeapps-template/database';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    DatabaseModule.forRoot({
      type: 'mongo',
      connectionString: process.env.MONGO_URI as string,
    }),
    UserModule,
  ],
})
export class AppModule {}
```

### 2. Inject Database and create a repo in a service

```ts
// user.service.ts
import { Injectable } from '@nestjs/common';
import {
  InjectDatabase,
  Database,
  Repository,
} from '@ciscodeapps-template/database';
import UserModel from '../models/user.model';

interface User {
  _id: string;
  name: string;
}

@Injectable()
export class UserService {
  private readonly repo: Repository<User>;

  constructor(@InjectDatabase() private readonly db: Database) {
    this.repo = this.db.createMongoRepository<User>({ model: UserModel });
  }

  findAll(page = 1, limit = 20) {
    return this.repo.findPage({ page, limit, sort: '-createdAt' });
  }

  create(dto: Partial<User>) {
    return this.repo.create(dto);
  }

  findOne(id: string) {
    return this.repo.findById(id);
  }

  update(id: string, dto: Partial<User>) {
    return this.repo.updateById(id, dto);
  }

  remove(id: string) {
    return this.repo.deleteById(id);
  }
}
```

### 3. Simple NestJS controller example

```ts
// user.controller.ts
import { Controller, Get, Post, Body, Param, Query, Put, Delete } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Get()
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.service.findAll(Number(page), Number(limit));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
```

The controller’s HTTP interface is the same whether your `DatabaseModule.forRoot` uses:

```ts
type: 'mongo'
```

or:

```ts
type: 'postgres'
```

You only change **how the repository is created** in the service.

---

## 🧬 Multiple Databases in One Project

You can also talk to **both Mongo and Postgres** in a single app:

* Create **two** `Database` instances (one mongo, one postgres) in a plain Node app, or
* In Nest, register multiple `DatabaseModule` instances under different tokens (this is an advanced usage and can be added later).

A simple approach in plain Node:

```ts
const mongoDb = new Database({ type: 'mongo', connectionString: MONGO_URI });
const pgDb = new Database({ type: 'postgres', connectionString: PG_URI });

await Promise.all([mongoDb.connect(), pgDb.connect()]);

const usersRepo = mongoDb.createMongoRepository({ model: UserModel });
const ordersRepo = pgDb.createPostgresRepository({
  table: 'orders',
  primaryKey: 'id',
  columns: ['id', 'user_id', 'total', 'created_at'],
});
```

---

## ✅ Summary

* **Install** `@ciscodeapps-template/database`.
* **Create** a `Database` instance with `{ type, connectionString }`.
* **Call** `await db.connect()`.
* **Create** repositories:

  * `createMongoRepository({ model })` for Mongo
  * `createPostgresRepository({ table, columns, primaryKey, defaultFilter })` for Postgres
* **Use repositories** inside your routes/services to implement endpoints.
* Optional: use `DatabaseModule.forRoot` + `@InjectDatabase()` in NestJS for DI.

This keeps all your CRUD & pagination logic **centralized** and **consistent**, while letting each project define its own models and tables.

```
```
