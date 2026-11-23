import { DataSourceOptions } from 'typeorm';
import type { Configuration } from '@/config/configuration';
import { ENTITIES } from './entities';

/**
 * Shared TypeORM options. Used by the Nest app (app.module.ts) and by the
 * TypeORM CLI (data-source.ts) so migrations always target the same schema.
 */
export function buildDataSourceOptions(
  db: Configuration['database'],
  extra: Partial<DataSourceOptions> = {},
): DataSourceOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.name,
    ssl: db.ssl ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    migrationsRun: false,
    synchronize: false, // schema changes only via migrations, never auto-sync
    logging: false,
    ...extra,
  } as DataSourceOptions;
}
