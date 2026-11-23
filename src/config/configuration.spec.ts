import { validationSchema } from './configuration';

/** Minimal valid environment for the given NODE_ENV. Overrides are merged on top. */
function env(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'development',
    DB_HOST: 'localhost',
    DB_USERNAME: 'app',
    DB_PASSWORD: 'pw',
    DB_NAME: 'fnt_dev',
    JWT_ACCESS_SECRET: 'x'.repeat(40),
    ...overrides,
  };
}

type Checked = { error?: unknown; value: Record<string, unknown> };
const check = (e: Record<string, string>): Checked =>
  validationSchema.validate(e, { abortEarly: false });

describe('configuration validation', () => {
  it('accepts a development environment and applies safe defaults', () => {
    const { error, value } = check(env());
    expect(error).toBeUndefined();
    expect(value.STORAGE_DRIVER).toBe('local');
    expect(value.DB_SYNCHRONIZE).toBe(false);
    expect(value.TRUST_PROXY).toBe(0);
  });

  it('requires a JWT secret of at least 32 characters', () => {
    expect(check(env({ JWT_ACCESS_SECRET: 'short' })).error).toBeDefined();
  });

  describe('production', () => {
    const prod = (o: Record<string, string> = {}) =>
      env({
        NODE_ENV: 'production',
        DB_SSL: 'true',
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'fnt-private',
        AWS_REGION: 'eu-west-2',
        ...o,
      });

    it('accepts a hardened production environment', () => {
      expect(check(prod()).error).toBeUndefined();
    });

    it('refuses local disk storage', () => {
      expect(check(prod({ STORAGE_DRIVER: 'local' })).error).toBeDefined();
    });

    it('refuses an unencrypted database connection', () => {
      expect(check(prod({ DB_SSL: 'false' })).error).toBeDefined();
    });

    it('refuses schema auto-sync', () => {
      expect(check(prod({ DB_SYNCHRONIZE: 'true' })).error).toBeDefined();
    });

    it('requires the bucket and region for S3', () => {
      expect(check(prod({ S3_BUCKET: '' })).error).toBeDefined();
      expect(check(prod({ AWS_REGION: '' })).error).toBeDefined();
    });

    it('rejects an out-of-range proxy hop count', () => {
      expect(check(prod({ TRUST_PROXY: '9' })).error).toBeDefined();
    });
  });
});
