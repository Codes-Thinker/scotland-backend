import * as Joi from 'joi';

export interface Configuration {
  app: {
    env: 'development' | 'test' | 'production';
    port: number;
    apiPrefix: string;
    corsOrigins: string[];
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    ssl: boolean;
    synchronize: boolean;
  };
  jwt: {
    accessSecret: string;
    accessTtl: string; // e.g. '15m'
    refreshTtlDays: number;
  };
}

export default (): Configuration => {
  const env = process.env;
  return {
    app: {
      env: (env.NODE_ENV as Configuration['app']['env']) ?? 'development',
      port: Number(env.PORT ?? 3000),
      apiPrefix: env.API_PREFIX ?? 'api/v1',
      corsOrigins: (env.CORS_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    },
    database: {
      host: env.DB_HOST ?? 'localhost',
      port: Number(env.DB_PORT ?? 5432),
      username: env.DB_USERNAME ?? '',
      password: env.DB_PASSWORD ?? '',
      name: env.DB_NAME ?? '',
      ssl: env.DB_SSL === 'true',
      synchronize: env.DB_SYNCHRONIZE === 'true',
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET ?? '',
      accessTtl: env.JWT_ACCESS_TTL ?? '15m',
      refreshTtlDays: Number(env.JWT_REFRESH_TTL_DAYS ?? 30),
    },
  };
};

/** Fail fast at boot if required settings are missing or malformed. */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_SYNCHRONIZE: Joi.boolean().truthy('true').falsy('false').default(false),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(90).default(30),
  AUTH_RATE_LIMIT_PER_MIN: Joi.number().integer().min(1).default(10),
}).unknown(true);
