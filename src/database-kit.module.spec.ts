import { Logger } from '@nestjs/common';

import { DATABASE_TOKEN } from './config/database.constants';
import { DatabaseKitModule } from './database-kit.module';
import { DatabaseService } from './services/database.service';

describe('DatabaseKitModule', () => {
  it('should create providers with autoConnect enabled', async () => {
    const connectSpy = jest
      .spyOn(DatabaseService.prototype, 'connect')
      .mockResolvedValue(undefined);
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    const module = DatabaseKitModule.forRoot({
      config: {
        type: 'mongo',
        connectionString: 'mongodb://localhost:27017/testdb',
      },
    });

    const provider = (module.providers || []).find(
      (entry) => (entry as { provide: string }).provide === DATABASE_TOKEN,
    ) as { useFactory: () => Promise<DatabaseService> };

    const instance = await provider.useFactory();

    expect(instance).toBeInstanceOf(DatabaseService);
    expect(connectSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  it('should skip autoConnect when disabled', async () => {
    const connectSpy = jest
      .spyOn(DatabaseService.prototype, 'connect')
      .mockResolvedValue(undefined);

    const module = DatabaseKitModule.forRoot({
      config: {
        type: 'mongo',
        connectionString: 'mongodb://localhost:27017/testdb',
      },
      autoConnect: false,
    });

    const provider = (module.providers || []).find(
      (entry) => (entry as { provide: string }).provide === DATABASE_TOKEN,
    ) as { useFactory: () => Promise<DatabaseService> };

    await provider.useFactory();

    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('should build async module with provided factory', async () => {
    const connectSpy = jest
      .spyOn(DatabaseService.prototype, 'connect')
      .mockResolvedValue(undefined);

    const module = DatabaseKitModule.forRootAsync({
      useFactory: () => ({
        config: {
          type: 'postgres',
          connectionString: 'postgresql://localhost:5432/testdb',
        },
        autoConnect: false,
      }),
    });

    const provider = (module.providers || []).find(
      (entry) => (entry as { provide: string }).provide === DATABASE_TOKEN,
    ) as { useFactory: (options: unknown) => Promise<DatabaseService> };

    await provider.useFactory({
      config: {
        type: 'postgres',
        connectionString: 'postgresql://localhost:5432/testdb',
      },
      autoConnect: false,
    });

    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('should create feature module and connect', async () => {
    const connectSpy = jest
      .spyOn(DatabaseService.prototype, 'connect')
      .mockResolvedValue(undefined);

    const module = DatabaseKitModule.forFeature('FEATURE_DB', {
      type: 'mongo',
      connectionString: 'mongodb://localhost:27017/testdb',
    });

    const provider = (module.providers || []).find(
      (entry) => (entry as { provide: string }).provide === 'FEATURE_DB',
    ) as { useFactory: () => Promise<DatabaseService> };

    await provider.useFactory();

    expect(connectSpy).toHaveBeenCalled();
  });
});
