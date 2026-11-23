import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './database-options';
import configuration from '@/config/configuration';

// Used only by the TypeORM CLI (migration:generate / migration:run).
export default new DataSource(buildDataSourceOptions(configuration().database));
