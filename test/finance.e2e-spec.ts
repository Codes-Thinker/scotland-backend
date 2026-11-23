/* Supertest response bodies are untyped JSON; asserting on them is the point of these tests. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createApp } from '@/bootstrap';
import configuration from '@/config/configuration';
import AppDataSource from '@/database/data-source';
import { buildDataSourceOptions } from '@/database/database-options';
import { InitialSchema1795436787073 } from '@/database/migrations/1795436787073-InitialSchema';
import { AuthRefreshTokens1795438177643 } from '@/database/migrations/1795438177643-AuthRefreshTokens';
import { Api, API, auth } from './support/api-helpers';

const DAY = 86_400_000;
const todayUtc = () => new Date().toISOString().slice(0, 10);
const yesterdayUtc = () => new Date(Date.now() - DAY).toISOString().slice(0, 10);

describe('Payments, pricing, reports and earnings (e2e)', () => {
  let app: INestApplication;
  let api: Api;

  beforeAll(async () => {
    await AppDataSource.initialize();
    if (AppDataSource.options.database !== 'fnt_test') {
      throw new Error('E2E tests must run against fnt_test');
    }
    const migrator = new DataSource({
      ...buildDataSourceOptions(configuration().database),
      migrations: [InitialSchema1795436787073, AuthRefreshTokens1795438177643],
    });
    await migrator.initialize();
    await migrator.runMigrations();
    await migrator.destroy();

    app = await createApp();
    await app.init();
    api = new Api(app);
  });

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE "alerts", "chat_messages", "chat_threads", "refresh_tokens", "blocks", "driver_locations", "driver_documents", "vehicles", "driver_profiles", "ride_ratings", "ride_offers", "ride_stops", "payments", "rides", "audit_log", "places", "pricing_rules", "users" RESTART IDENTITY CASCADE',
    );
    await AppDataSource.query(
      `INSERT INTO pricing_rules (ride_type, base_fare_pence, per_mile_pence, minimum_fare_pence, later_booking_surcharge_bp, notes, active)
       VALUES ('standard', 378, 246, 0, 500, 'test', true),
              ('emergency', 600, 310, 0, 500, 'test', true),
              ('roadside', 2500, 0, 0, 500, 'test', true)`,
    );
  });

  afterAll(async () => {
    await app?.close();
    await AppDataSource.destroy();
  });

  /** A completed ride with a pending payment. Returns the parties and the final fare. */
  async function completedRide(tag: string) {
    const admin = await api.admin();
    const p = await api.passenger(`${tag}-p@example.com`);
    const d = await api.onlineDriver(admin, `${tag}-d@example.com`);
    const created = await api.requestRide(p);
    await api.accept(d, created.body.id);
    const rideId = created.body.id as string;
    await api.http().post(`${API}/rides/${rideId}/arrive`).set(auth(d.token));
    await api.http().post(`${API}/rides/${rideId}/start`).set(auth(d.token));
    const done = await api
      .http()
      .post(`${API}/rides/${rideId}/complete`)
      .set(auth(d.token))
      .send({ distanceM: 9500 });
    expect(done.status).toBe(201);
    return { admin, p, d, rideId, fare: done.body.fareFinalPence as number };
  }

  // ---- payments ----

  describe('payments', () => {
    it('lists payments with the ride and both parties', async () => {
      const { admin, rideId, fare } = await completedRide('pay1');
      const res = await api.http().get(`${API}/admin/payments`).set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0]).toMatchObject({
        status: 'pending',
        amountPence: fare,
        ride: { id: rideId, rideType: 'standard', status: 'completed' },
      });
      expect(res.body.data[0].ride.driverName).toBeTruthy();
      expect(res.body.data[0].reference).toMatch(/^TX-/);
    });

    it('follows the allowed transitions and refuses the rest', async () => {
      const { admin } = await completedRide('pay2');
      const [row] = await AppDataSource.query('SELECT id FROM payments');
      const set = (status: string) =>
        api
          .http()
          .patch(`${API}/admin/payments/${row.id}/status`)
          .set(auth(admin))
          .send({ status });

      expect((await set('paid')).body.status).toBe('paid');
      expect((await set('failed')).status).toBe(409); // paid cannot fail
      expect((await set('refunded')).body.status).toBe('refunded');
      expect((await set('paid')).status).toBe(409); // refunded is final
    });

    it('lets a failed payment be retried into paid', async () => {
      const { admin } = await completedRide('pay3');
      const [row] = await AppDataSource.query('SELECT id FROM payments');
      const set = (status: string) =>
        api
          .http()
          .patch(`${API}/admin/payments/${row.id}/status`)
          .set(auth(admin))
          .send({ status });
      expect((await set('failed')).body.status).toBe('failed');
      expect((await set('paid')).body.status).toBe('paid');
    });

    it('audits each change', async () => {
      const { admin } = await completedRide('pay4');
      const [row] = await AppDataSource.query('SELECT id FROM payments');
      await api
        .http()
        .patch(`${API}/admin/payments/${row.id}/status`)
        .set(auth(admin))
        .send({ status: 'paid' });
      const audit = await AppDataSource.query(
        "SELECT payload FROM audit_log WHERE action = 'payment.status_changed'",
      );
      expect(audit[0].payload).toMatchObject({ from: 'pending', to: 'paid' });
    });

    it('keeps passengers and drivers out of payments', async () => {
      const { p } = await completedRide('pay5');
      const res = await api.http().get(`${API}/admin/payments`).set(auth(p.token));
      expect(res.status).toBe(403);
    });
  });

  // ---- pricing ----

  describe('pricing', () => {
    it('lists the rule in force for each ride type', async () => {
      const admin = await api.admin();
      const res = await api.http().get(`${API}/admin/pricing`).set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.body.map((r: { rideType: string }) => r.rideType).sort()).toEqual([
        'emergency',
        'roadside',
        'standard',
      ]);
    });

    it('replaces a rule, keeps the old one in history, and prices new rides with it', async () => {
      const admin = await api.admin();
      const p = await api.passenger('price1@example.com');
      const before = await api
        .http()
        .post(`${API}/rides/estimate`)
        .set(auth(p.token))
        .send({
          pickup: { address: 'Riverside Park', lat: 56.1955, lng: -3.1565 },
          drop: { address: 'Victoria Hospital', lat: 56.1165, lng: -3.159 },
          rideType: 'standard',
        });

      const put = await api
        .http()
        .put(`${API}/admin/pricing`)
        .set(auth(admin))
        .send({
          rules: [
            {
              rideType: 'standard',
              baseFarePence: 500,
              perMilePence: 300,
              minimumFarePence: 600,
              laterBookingSurchargeBp: 1000,
              notes: 'Raised',
            },
          ],
        });
      expect(put.status).toBe(200);
      const standard = put.body.find((r: { rideType: string }) => r.rideType === 'standard');
      expect(standard.baseFarePence).toBe(500);
      expect(standard.notes).toBe('Raised');

      const history = await AppDataSource.query(
        "SELECT count(*)::int AS n FROM pricing_rules WHERE ride_type = 'standard'",
      );
      expect(history[0].n).toBe(2);

      const after = await api
        .http()
        .post(`${API}/rides/estimate`)
        .set(auth(p.token))
        .send({
          pickup: { address: 'Riverside Park', lat: 56.1955, lng: -3.1565 },
          drop: { address: 'Victoria Hospital', lat: 56.1165, lng: -3.159 },
          rideType: 'standard',
        });
      expect(after.body.fareEstimatePence).not.toBe(before.body.fareEstimatePence);
      expect(after.body.fareEstimatePence).toBeGreaterThanOrEqual(600);
    });

    it('refuses duplicate ride types and out-of-range values', async () => {
      const admin = await api.admin();
      const dup = await api
        .http()
        .put(`${API}/admin/pricing`)
        .set(auth(admin))
        .send({
          rules: [
            {
              rideType: 'standard',
              baseFarePence: 1,
              perMilePence: 1,
              minimumFarePence: 0,
              laterBookingSurchargeBp: 0,
            },
            {
              rideType: 'standard',
              baseFarePence: 2,
              perMilePence: 1,
              minimumFarePence: 0,
              laterBookingSurchargeBp: 0,
            },
          ],
        });
      expect(dup.status).toBe(400);

      const bad = await api
        .http()
        .put(`${API}/admin/pricing`)
        .set(auth(admin))
        .send({
          rules: [
            {
              rideType: 'standard',
              baseFarePence: -5,
              perMilePence: 1,
              minimumFarePence: 0,
              laterBookingSurchargeBp: 0,
            },
          ],
        });
      expect(bad.status).toBe(400);
    });
  });

  // ---- reports ----

  describe('reports', () => {
    it('summarises rides, revenue, payments and drivers for a date range', async () => {
      const { admin, fare } = await completedRide('rep1');
      const res = await api
        .http()
        .get(`${API}/admin/reports/summary?from=${yesterdayUtc()}&to=${todayUtc()}`)
        .set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.body.rides).toMatchObject({
        total: 1,
        completed: 1,
        cancelled: 0,
        open: 0,
        cancellationRate: 0,
      });
      expect(res.body.revenue.completedFarePence).toBe(fare);
      expect(res.body.payments.pending).toBe(1);
      expect(res.body.drivers.approved).toBe(1);
      expect(res.body.drivers.pendingApproval).toBe(0);
      expect(res.body.daily).toHaveLength(1);
      expect(res.body.daily[0]).toMatchObject({ rides: 1, completed: 1, revenuePence: fare });
    });

    it('defaults to the last 30 days when no range is given', async () => {
      const admin = await api.admin();
      const res = await api.http().get(`${API}/admin/reports/summary`).set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.body.rides.total).toBe(0);
      expect(res.body.rides.cancellationRate).toBe(0);
    });

    it('rejects a reversed or oversized range and a bad date', async () => {
      const admin = await api.admin();
      const reversed = await api
        .http()
        .get(`${API}/admin/reports/summary?from=${todayUtc()}&to=${yesterdayUtc()}`)
        .set(auth(admin));
      expect(reversed.status).toBe(400);

      const huge = await api
        .http()
        .get(`${API}/admin/reports/summary?from=2020-01-01&to=${todayUtc()}`)
        .set(auth(admin));
      expect(huge.status).toBe(400);

      const bad = await api
        .http()
        .get(`${API}/admin/reports/summary?from=not-a-date`)
        .set(auth(admin));
      expect(bad.status).toBe(400);
    });

    it('lists recent admin activity with the actor name', async () => {
      const { admin } = await completedRide('rep2');
      const [row] = await AppDataSource.query('SELECT id FROM payments');
      await api
        .http()
        .patch(`${API}/admin/payments/${row.id}/status`)
        .set(auth(admin))
        .send({ status: 'paid' });

      const res = await api.http().get(`${API}/admin/activity?limit=5`).set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({ action: 'payment.status_changed', actorName: 'Ops' });
    });
  });

  // ---- driver earnings ----

  describe('driver earnings', () => {
    it('shows a driver their completed-trip gross by day', async () => {
      const { d, fare } = await completedRide('earn1');
      const res = await api
        .http()
        .get(`${API}/drivers/me/earnings?from=${yesterdayUtc()}&to=${todayUtc()}`)
        .set(auth(d.token));
      expect(res.status).toBe(200);
      expect(res.body.trips).toBe(1);
      expect(res.body.grossPence).toBe(fare);
      expect(res.body.days).toHaveLength(1);
    });

    it('does not show one driver the earnings of another', async () => {
      await completedRide('earn2');
      const other = await api.onlineDriver(
        await api.admin('ops2@example.com'),
        'earn2-other@example.com',
      );
      const res = await api
        .http()
        .get(`${API}/drivers/me/earnings?from=${yesterdayUtc()}&to=${todayUtc()}`)
        .set(auth(other.token));
      expect(res.body.trips).toBe(0);
      expect(res.body.grossPence).toBe(0);
    });
  });
});
