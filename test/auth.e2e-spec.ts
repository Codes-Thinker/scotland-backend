/* Supertest response bodies are untyped JSON; asserting on them is the point of these tests. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import AppDataSource from '@/database/data-source';
import { buildDataSourceOptions } from '@/database/database-options';
import configuration from '@/config/configuration';
import { InitialSchema1795436787073 } from '@/database/migrations/1795436787073-InitialSchema';
import { AuthRefreshTokens1795438177643 } from '@/database/migrations/1795438177643-AuthRefreshTokens';
import { createApp } from '@/bootstrap';

const PASSWORD = 'correct-horse-battery';

const passenger = {
  name: 'Ayaz Aslam',
  email: 'Rider@Example.com',
  phone: '+44 7700 900123',
  password: PASSWORD,
  acceptedTerms: true,
};

const driver = {
  name: 'Wadza Makore',
  email: 'driver@example.com',
  phone: '+44 7700 900501',
  password: PASSWORD,
  acceptedTerms: true,
  vehicleMakeModel: 'Toyota Prius',
  vehiclePlate: 'sf26 tax',
  operatingZone: 'Glenrothes',
};

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    await AppDataSource.initialize();
    if (AppDataSource.options.database !== 'fnt_test') {
      throw new Error('E2E tests must run against fnt_test');
    }
    // Migrations are registered explicitly: TypeORM's glob loader cannot require .ts under vitest.
    const migrator = new DataSource({
      ...buildDataSourceOptions(configuration().database),
      migrations: [InitialSchema1795436787073, AuthRefreshTokens1795438177643],
    });
    await migrator.initialize();
    await migrator.runMigrations();
    await migrator.destroy();
    app = await createApp();
    await app.init();
    http = request(app.getHttpServer());
  });

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE "refresh_tokens", "ride_ratings", "ride_offers", "ride_stops", "chat_messages", "chat_threads", "alerts", "payments", "rides", "blocks", "driver_locations", "driver_documents", "vehicles", "driver_profiles", "users", "audit_log" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await AppDataSource.destroy();
  });

  const registerPassenger = (body = passenger) =>
    http.post('/api/v1/auth/register/passenger').send(body);
  const login = (email: string, password = PASSWORD) =>
    http.post('/api/v1/auth/login').send({ email, password });

  describe('register/passenger', () => {
    it('creates an active passenger and returns tokens', async () => {
      const res = await registerPassenger();

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.user).toMatchObject({
        email: 'rider@example.com',
        roles: ['passenger'],
        status: 'active',
      });
      expect(res.body.user.driver).toBeUndefined();
    });

    it('never stores the password in plain text', async () => {
      await registerPassenger();
      const [row] = await AppDataSource.query('SELECT password_hash FROM users');
      expect(row.password_hash).toMatch(/^scrypt\$/);
      expect(row.password_hash).not.toContain(PASSWORD);
    });

    it('rejects a duplicate email, case-insensitively', async () => {
      await registerPassenger();
      const res = await registerPassenger({ ...passenger, email: 'RIDER@example.com' });
      expect(res.status).toBe(409);
    });

    it('rejects a password under 8 characters', async () => {
      const res = await registerPassenger({ ...passenger, password: 'short77' });
      expect(res.status).toBe(400);
    });

    it('requires accepting the terms', async () => {
      const res = await registerPassenger({ ...passenger, acceptedTerms: false });
      expect(res.status).toBe(400);
    });

    it('rejects unknown fields such as a client-supplied role', async () => {
      const res = await registerPassenger({ ...passenger, roles: ['admin'] } as typeof passenger);
      expect(res.status).toBe(400);
    });
  });

  describe('register/driver', () => {
    it('creates a pending driver with a profile and vehicle', async () => {
      const res = await http.post('/api/v1/auth/register/driver').send(driver);

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({ roles: ['driver'], status: 'pending' });
      expect(res.body.user.driver).toMatchObject({
        operatingZone: 'Glenrothes',
        onlineStatus: 'offline',
        vehicle: { makeModel: 'Toyota Prius', plate: 'SF26 TAX', category: 'four_seater' },
      });
    });

    it('requires vehicle details', async () => {
      const missingPlate: Partial<typeof driver> = { ...driver, vehiclePlate: undefined };
      const res = await http.post('/api/v1/auth/register/driver').send(missingPlate);
      expect(res.status).toBe(400);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await registerPassenger();
    });

    it('accepts the correct password, ignoring email case', async () => {
      const res = await login('RIDER@example.COM');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('rider@example.com');
    });

    it('rejects a wrong password with a generic message', async () => {
      const res = await login('rider@example.com', 'wrong-password-1');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password.');
    });

    it('gives the same generic message for an unknown email', async () => {
      const res = await login('nobody@example.com');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password.');
    });

    it('blocks suspended accounts with 403', async () => {
      await AppDataSource.query("UPDATE users SET status = 'suspended'");
      const res = await login('rider@example.com');
      expect(res.status).toBe(403);
    });

    it('lets pending drivers sign in (approval gates going online, not login)', async () => {
      await http
        .post('/api/v1/auth/register/driver')
        .send({ ...driver, email: 'pending@example.com' });
      const res = await login('pending@example.com');
      expect(res.status).toBe(200);
      expect(res.body.user.status).toBe('pending');
    });
  });

  describe('me', () => {
    it('rejects requests without a token', async () => {
      const res = await http.get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects a malformed token', async () => {
      const res = await http.get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt');
      expect(res.status).toBe(401);
    });

    it('returns the current user for a valid token', async () => {
      const reg = await registerPassenger();
      const res = await http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${reg.body.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('rider@example.com');
    });

    it('rejects a valid token once the account is suspended', async () => {
      const reg = await registerPassenger();
      await AppDataSource.query("UPDATE users SET status = 'suspended'");
      const res = await http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${reg.body.accessToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe('refresh and logout', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const reg = await registerPassenger();
      const res = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.refreshToken).not.toBe(reg.body.refreshToken);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('treats a reused refresh token as theft and ends every session', async () => {
      const reg = await registerPassenger();
      const first = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken });
      expect(first.status).toBe(200);

      // Replaying the old token fails...
      const replay = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken });
      expect(replay.status).toBe(401);

      // ...and also kills the newer session that the attacker or user still holds.
      const newer = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.body.refreshToken });
      expect(newer.status).toBe(401);
    });

    it('lets only one of two simultaneous refreshes succeed, and ends the session for the other', async () => {
      const reg = await registerPassenger();
      const token = reg.body.refreshToken as string;
      const [a, b] = await Promise.all([
        http.post('/api/v1/auth/refresh').send({ refreshToken: token }),
        http.post('/api/v1/auth/refresh').send({ refreshToken: token }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);

      const winner = a.status === 200 ? a : b;
      // The reuse detection revoked everything, including the winner's fresh token.
      const after = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: winner.body.refreshToken });
      expect(after.status).toBe(401);
    });

    it('rejects an unknown refresh token', async () => {
      const res = await http.post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(40) });
      expect(res.status).toBe(401);
    });

    it('revokes the refresh token on logout, and logout is idempotent', async () => {
      const reg = await registerPassenger();
      const out = await http
        .post('/api/v1/auth/logout')
        .send({ refreshToken: reg.body.refreshToken });
      expect(out.status).toBe(204);

      const again = await http
        .post('/api/v1/auth/logout')
        .send({ refreshToken: reg.body.refreshToken });
      expect(again.status).toBe(204);

      const res = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken });
      expect(res.status).toBe(401);
    });

    it('stores only a hash of the refresh token', async () => {
      const reg = await registerPassenger();
      const rows = await AppDataSource.query('SELECT token_hash FROM refresh_tokens');
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toHaveLength(64);
      expect(rows[0].token_hash).not.toBe(reg.body.refreshToken);
    });
  });

  describe('health', () => {
    it('stays public without a token', async () => {
      const res = await http.get('/health');
      expect(res.status).toBe(200);
      expect(res.body.database).toBe('up');
    });
  });
});
