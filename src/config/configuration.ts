import * as Joi from 'joi';

export interface Configuration {
  app: {
    trustProxy: number; // hops of reverse proxy to trust for client IPs
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
    sslRejectUnauthorized: boolean;
    synchronize: boolean;
  };
  dispatch: {
    sweepMs: number; // 0 disables the background sweeper (tests)
    offerSeconds: number;
    radiusKm: number;
    maxOffers: number;
    locationMaxAgeSec: number;
  };
  storage: {
    driver: 'local' | 's3';
    dir: string; // local disk root, development only
    s3: { bucket: string; region: string; endpoint?: string };
    maxUploadBytes: number;
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
      trustProxy: Number(env.TRUST_PROXY ?? 0),
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
      sslRejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      synchronize: env.DB_SYNCHRONIZE === 'true',
    },
    dispatch: {
      sweepMs: Number(env.DISPATCH_SWEEP_MS ?? 5000),
      offerSeconds: Number(env.DISPATCH_OFFER_SECONDS ?? 20),
      radiusKm: Number(env.DISPATCH_RADIUS_KM ?? 15),
      maxOffers: Number(env.DISPATCH_MAX_OFFERS ?? 3),
      locationMaxAgeSec: Number(env.DISPATCH_LOCATION_MAX_AGE_SEC ?? 600),
    },
    storage: {
      driver: (env.STORAGE_DRIVER as 'local' | 's3' | undefined) ?? 'local',
      dir: env.STORAGE_DIR ?? './storage',
      s3: {
        bucket: env.S3_BUCKET ?? '',
        region: env.AWS_REGION ?? '',
        endpoint: env.S3_ENDPOINT || undefined,
      },
      maxUploadBytes: Number(env.UPLOAD_MAX_MB ?? 10) * 1024 * 1024,
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
  DB_SSL: Joi.any().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean()
      .truthy('true')
      .falsy('false')
      .valid(true)
      .required()
      .messages({ 'any.only': 'Production requires DB_SSL=true' }),
    otherwise: Joi.boolean().truthy('true').falsy('false').default(false),
  }),
  DB_SYNCHRONIZE: Joi.any().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean()
      .truthy('true')
      .falsy('false')
      .valid(false)
      .default(false)
      .messages({ 'any.only': 'DB_SYNCHRONIZE must be false in production' }),
    otherwise: Joi.boolean().truthy('true').falsy('false').default(false),
  }),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(90).default(30),
  AUTH_RATE_LIMIT_PER_MIN: Joi.number().integer().min(1).default(10),
  STORAGE_DIR: Joi.string().default('./storage'),
  STORAGE_DRIVER: Joi.any().when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .valid('s3')
      .required()
      .messages({ 'any.only': 'Production must use STORAGE_DRIVER=s3' }),
    otherwise: Joi.string().valid('local', 's3').default('local'),
  }),
  S3_BUCKET: Joi.any().when('STORAGE_DRIVER', {
    is: 's3',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  AWS_REGION: Joi.any().when('STORAGE_DRIVER', {
    is: 's3',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  S3_ENDPOINT: Joi.string().uri().allow('').optional(),
  TRUST_PROXY: Joi.number().integer().min(0).max(3).default(0),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().truthy('true').falsy('false').default(true),
  DISPATCH_SWEEP_MS: Joi.number().integer().min(0).default(5000),
  DISPATCH_OFFER_SECONDS: Joi.number().integer().min(5).max(120).default(20),
  DISPATCH_RADIUS_KM: Joi.number().min(1).max(100).default(15),
  DISPATCH_MAX_OFFERS: Joi.number().integer().min(1).max(10).default(3),
  DISPATCH_LOCATION_MAX_AGE_SEC: Joi.number().integer().min(30).default(600),
  UPLOAD_MAX_MB: Joi.number().integer().min(1).max(25).default(10),
}).unknown(true);
