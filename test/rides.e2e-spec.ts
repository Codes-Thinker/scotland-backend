/* Supertest response bodies are untyped JSON; asserting on them is the point of these tests. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createApp } from '@/bootstrap';
import configuration from '@/config/configuration';
import AppDataSource from '@/database/data-source';
import { buildDataSourceOptions } from '@/database/database-options';
import { InitialSchema1795436787073 } from '@/database/migrations/1795436787073-InitialSchema';
import { AuthRefreshTokens1795438177643 } from '@/database/migrations/1795438177643-AuthRefreshTokens';
import { User } from '@/database/entities/account.entity';
import { hashPassword } from '@/common/password';
import { AccountStatus, UserRole } from '@/database/enums';
import { DispatchService } from '@/rides/dispatch.service';

const API = '/api/v1';
const PASSWORD = 'correct-horse-battery';
const PDF = Buffer.from('%PDF-1.4\n% doc\n%%EOF\n');
const DOC_TYPES = ['licence', 'council_licence', 'council_plate', 'insurance', 'v5c'];

// Glenrothes pickup, Kirkcaldy drop (about 9 km straight line)
const PICKUP = { address: 'Riverside Park, Glenrothes', lat: 56.1955, lng: -3.1565 };
const DROP = { address: 'Victoria Hospital, Kirkcaldy', lat: 56.1165, lng: -3.159 };

let plateSeq = 0;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Rides and dispatch API (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

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
  });

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE "refresh_tokens", "blocks", "driver_locations", "driver_documents", "vehicles", "driver_profiles", "ride_ratings", "ride_offers", "ride_stops", "chat_messages", "chat_threads", "payments", "rides", "alerts", "audit_log", "places", "pricing_rules", "users" RESTART IDENTITY CASCADE',
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

  // ---- helpers ----

  async function makeAdmin(email = 'ops@example.com'): Promise<string> {
    await AppDataSource.getRepository(User).save({
      name: 'Ops',
      email,
      phone: '+44 1500 000001',
      passwordHash: await hashPassword(PASSWORD),
      roles: [UserRole.Admin],
      status: AccountStatus.Active,
    });
    const res = await http().post(`${API}/auth/login`).send({ email, password: PASSWORD });
    return res.body.accessToken as string;
  }

  async function passenger(email: string) {
    const res = await http()
      .post(`${API}/auth/register/passenger`)
      .send({
        name: `Rider ${email}`,
        email,
        phone: '+44 7700 900777',
        password: PASSWORD,
        acceptedTerms: true,
      });
    expect(res.status).toBe(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  /** Registers a driver and approves them with all documents verified. Not yet online. */
  async function approvedDriver(admin: string, email: string) {
    plateSeq += 1;
    const reg = await http()
      .post(`${API}/auth/register/driver`)
      .send({
        name: `Driver ${email}`,
        email,
        phone: '+44 7700 900501',
        password: PASSWORD,
        acceptedTerms: true,
        vehicleMakeModel: 'Toyota Prius',
        vehiclePlate: `RD${plateSeq} ABC`,
        operatingZone: 'Glenrothes',
      });
    expect(reg.status).toBe(201);
    const token = reg.body.accessToken as string;
    const id = reg.body.user.id as string;

    await http()
      .patch(`${API}/admin/users/${id}/status`)
      .set(auth(admin))
      .send({ status: 'active' });
    for (const type of DOC_TYPES) {
      const up = await http()
        .post(`${API}/drivers/me/documents/${type}`)
        .set(auth(token))
        .attach('file', PDF, 'doc.pdf');
      expect(up.status).toBe(201);
      await http()
        .patch(`${API}/admin/drivers/${id}/documents/${type}`)
        .set(auth(admin))
        .send({ status: 'verified' });
    }
    return { token, id };
  }

  /** Approved, online, and reporting a location. */
  async function onlineDriver(admin: string, email: string, lat = 56.1955, lng = -3.1565) {
    const d = await approvedDriver(admin, email);
    const on = await http()
      .put(`${API}/drivers/me/status`)
      .set(auth(d.token))
      .send({ status: 'online' });
    expect(on.status).toBe(200);
    await http().post(`${API}/drivers/me/location`).set(auth(d.token)).send({ lat, lng });
    return d;
  }

  async function requestRide(p: { token: string }, body: Record<string, unknown> = {}) {
    return http()
      .post(`${API}/rides`)
      .set(auth(p.token))
      .send({ pickup: PICKUP, drop: DROP, rideType: 'standard', ...body });
  }

  async function myOffers(d: { token: string }): Promise<{ offerId: string; rideId: string }[]> {
    const res = await http().get(`${API}/drivers/me/offers`).set(auth(d.token));
    expect(res.status).toBe(200);
    return res.body as { offerId: string; rideId: string }[];
  }

  async function acceptRide(d: { token: string }, rideId: string) {
    return http().post(`${API}/rides/${rideId}/accept`).set(auth(d.token));
  }

  /** Accepts a fresh ride for a driver and returns the ride id. */
  async function assignedRide(_admin: string, p: { token: string }, d: { token: string }) {
    const created = await requestRide(p);
    expect(created.status).toBe(201);
    const acc = await acceptRide(d, created.body.id);
    expect(acc.status).toBe(201);
    return created.body.id as string;
  }

  // ---- estimate ----

  describe('estimate', () => {
    it('prices by road distance and the ride type rule', async () => {
      const p = await passenger('est1@example.com');
      const res = await http().post(`${API}/rides/estimate`).set(auth(p.token)).send({
        pickup: PICKUP,
        drop: DROP,
        rideType: 'standard',
      });
      expect(res.status).toBe(200);
      expect(res.body.distanceM).toBeGreaterThan(9000);
      expect(res.body.distanceM).toBeLessThan(15000);
      const miles = res.body.distanceM / 1609.344;
      expect(res.body.fareEstimatePence).toBe(Math.round(378 + 246 * miles));
      expect(res.body.currency).toBe('GBP');
    });

    it('adds the later-booking surcharge to a scheduled estimate', async () => {
      const p = await passenger('est2@example.com');
      const when = new Date(Date.now() + 2 * 3600_000).toISOString();
      const now = await http()
        .post(`${API}/rides/estimate`)
        .set(auth(p.token))
        .send({ pickup: PICKUP, drop: DROP, rideType: 'standard' });
      const later = await http().post(`${API}/rides/estimate`).set(auth(p.token)).send({
        pickup: PICKUP,
        drop: DROP,
        rideType: 'standard',
        bookingMode: 'later',
        scheduledAt: when,
      });
      expect(later.status).toBe(200);
      expect(later.body.fareEstimatePence).toBe(Math.round(now.body.fareEstimatePence * 1.05));
    });

    it('validates the schedule', async () => {
      const p = await passenger('est3@example.com');
      const base = { pickup: PICKUP, drop: DROP, rideType: 'standard' };

      const laterNoTime = await http()
        .post(`${API}/rides/estimate`)
        .set(auth(p.token))
        .send({ ...base, bookingMode: 'later' });
      expect(laterNoTime.status).toBe(400);

      const tooSoon = await http()
        .post(`${API}/rides/estimate`)
        .set(auth(p.token))
        .send({
          ...base,
          bookingMode: 'later',
          scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        });
      expect(tooSoon.status).toBe(400);

      const nowWithTime = await http()
        .post(`${API}/rides/estimate`)
        .set(auth(p.token))
        .send({
          ...base,
          scheduledAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
        });
      expect(nowWithTime.status).toBe(400);
    });

    it('is for passengers only', async () => {
      const admin = await makeAdmin();
      const d = await onlineDriver(admin, 'est-d@example.com');
      const res = await http()
        .post(`${API}/rides/estimate`)
        .set(auth(d.token))
        .send({ pickup: PICKUP, drop: DROP, rideType: 'standard' });
      expect(res.status).toBe(403);
    });
  });

  // ---- booking and dispatch ----

  describe('booking and dispatch', () => {
    it('requests a ride and offers it to the nearest online driver', async () => {
      const admin = await makeAdmin();
      const p = await passenger('book1@example.com');
      const d = await onlineDriver(admin, 'book1-d@example.com');

      const created = await requestRide(p);
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('requested');
      expect(created.body.fareEstimatePence).toBeGreaterThan(0);

      const offers = await myOffers(d);
      expect(offers).toHaveLength(1);
      expect(offers[0].rideId).toBe(created.body.id);
    });

    it('allows only one active ride per passenger', async () => {
      const admin = await makeAdmin();
      const p = await passenger('book2@example.com');
      await onlineDriver(admin, 'book2-d@example.com');
      expect((await requestRide(p)).status).toBe(201);
      expect((await requestRide(p)).status).toBe(409);
    });

    it('offers to at most three drivers, nearest first', async () => {
      const admin = await makeAdmin();
      const p = await passenger('book3@example.com');
      const near = await onlineDriver(admin, 'near@example.com', 56.1955, -3.1565);
      const second = await onlineDriver(admin, 'second@example.com', 56.196, -3.157);
      const third = await onlineDriver(admin, 'third@example.com', 56.197, -3.158);
      const fourth = await onlineDriver(admin, 'fourth@example.com', 56.199, -3.16);

      await requestRide(p);
      expect(await myOffers(near)).toHaveLength(1);
      expect(await myOffers(second)).toHaveLength(1);
      expect(await myOffers(third)).toHaveLength(1);
      expect(await myOffers(fourth)).toHaveLength(0);
    });

    it('ignores drivers who are far away or have a stale location', async () => {
      const admin = await makeAdmin();
      const p = await passenger('book4@example.com');
      const far = await onlineDriver(admin, 'far@example.com', 55.9, -3.0);
      const stale = await onlineDriver(admin, 'stale@example.com');
      await AppDataSource.query(
        `UPDATE driver_locations SET "updatedAt" = now() - interval '2 hours' WHERE driver_id = $1`,
        [stale.id],
      );
      await requestRide(p);
      expect(await myOffers(far)).toHaveLength(0);
      expect(await myOffers(stale)).toHaveLength(0);
    });

    it('does not offer a ride to a driver who has blocked the passenger', async () => {
      const admin = await makeAdmin();
      const p = await passenger('book5@example.com');
      const d = await onlineDriver(admin, 'book5-d@example.com');
      await http().post(`${API}/drivers/me/blocks`).set(auth(d.token)).send({ passengerId: p.id });
      await requestRide(p);
      expect(await myOffers(d)).toHaveLength(0);
    });

    it('lets the first accepting driver win; the second gets a conflict', async () => {
      const admin = await makeAdmin();
      const p = await passenger('race@example.com');
      const a = await onlineDriver(admin, 'race-a@example.com', 56.1955, -3.1565);
      const b = await onlineDriver(admin, 'race-b@example.com', 56.1958, -3.1568);
      const created = await requestRide(p);

      const first = await acceptRide(a, created.body.id);
      expect(first.status).toBe(201);
      expect(first.body.status).toBe('assigned');
      expect(first.body.driver.id).toBe(a.id);

      const second = await acceptRide(b, created.body.id);
      expect(second.status).toBe(409);
    });

    it('moves the accepting driver on trip and keeps the others out of the ride', async () => {
      const admin = await makeAdmin();
      const p = await passenger('ontrip@example.com');
      const a = await onlineDriver(admin, 'ontrip-a@example.com');
      await requestRide(p).then((r) => acceptRide(a, r.body.id));

      const me = await http().get(`${API}/drivers/me`).set(auth(a.token));
      expect(me.body.onlineStatus).toBe('on_trip');
      expect(await myOffers(a)).toHaveLength(0);
    });
  });

  // ---- lifecycle ----

  describe('lifecycle', () => {
    it('runs assigned, arrived, in progress, completed, and records a pending payment', async () => {
      const admin = await makeAdmin();
      const p = await passenger('life1@example.com');
      const d = await onlineDriver(admin, 'life1-d@example.com');
      const rideId = await assignedRide(admin, p, d);

      expect(
        (await http().post(`${API}/rides/${rideId}/arrive`).set(auth(d.token))).body.status,
      ).toBe('arrived');
      expect(
        (await http().post(`${API}/rides/${rideId}/start`).set(auth(d.token))).body.status,
      ).toBe('in_progress');

      const done = await http()
        .post(`${API}/rides/${rideId}/complete`)
        .set(auth(d.token))
        .send({ distanceM: 9500 });
      expect(done.status).toBe(201);
      expect(done.body.status).toBe('completed');
      expect(done.body.distanceM).toBe(9500);
      expect(done.body.fareFinalPence).toBe(Math.round(378 + 246 * (9500 / 1609.344)));

      const [payment] = await AppDataSource.query(
        'SELECT status, amount_pence, reference FROM payments',
      );
      expect(payment.status).toBe('pending');
      expect(payment.amount_pence).toBe(done.body.fareFinalPence);
      expect(payment.reference).toMatch(/^TX-[0-9A-F]{10}$/);

      const me = await http().get(`${API}/drivers/me`).set(auth(d.token));
      expect(me.body.onlineStatus).toBe('online');
      expect(me.body.ridesCount).toBe(1);
    });

    it('refuses steps out of order and steps by a driver who is not assigned', async () => {
      const admin = await makeAdmin();
      const p = await passenger('life2@example.com');
      const d = await onlineDriver(admin, 'life2-d@example.com');
      const other = await onlineDriver(admin, 'life2-o@example.com', 56.1957, -3.1567);
      const rideId = await assignedRide(admin, p, d);

      const early = await http().post(`${API}/rides/${rideId}/start`).set(auth(d.token));
      expect(early.status).toBe(409);

      const stranger = await http().post(`${API}/rides/${rideId}/arrive`).set(auth(other.token));
      expect(stranger.status).toBe(404);
    });

    it('lets a passenger cancel an assigned ride and releases the driver', async () => {
      const admin = await makeAdmin();
      const p = await passenger('life3@example.com');
      const d = await onlineDriver(admin, 'life3-d@example.com');
      const rideId = await assignedRide(admin, p, d);

      const res = await http()
        .post(`${API}/rides/${rideId}/cancel`)
        .set(auth(p.token))
        .send({ reason: 'Changed plans' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('cancelled');
      expect(res.body.cancelReason).toBe('Changed plans');

      const me = await http().get(`${API}/drivers/me`).set(auth(d.token));
      expect(me.body.onlineStatus).toBe('online');
    });

    it('does not let a passenger cancel once the driver has arrived', async () => {
      const admin = await makeAdmin();
      const p = await passenger('life4@example.com');
      const d = await onlineDriver(admin, 'life4-d@example.com');
      const rideId = await assignedRide(admin, p, d);
      await http().post(`${API}/rides/${rideId}/arrive`).set(auth(d.token));

      const res = await http().post(`${API}/rides/${rideId}/cancel`).set(auth(p.token)).send({});
      expect(res.status).toBe(409);
    });

    it('hides a ride from anyone who is neither its passenger, its driver, nor an admin', async () => {
      const admin = await makeAdmin();
      const p = await passenger('life5@example.com');
      const intruder = await passenger('life5-x@example.com');
      const d = await onlineDriver(admin, 'life5-d@example.com');
      const rideId = await assignedRide(admin, p, d);

      expect((await http().get(`${API}/rides/${rideId}`).set(auth(intruder.token))).status).toBe(
        404,
      );
      expect(
        (await http().post(`${API}/rides/${rideId}/cancel`).set(auth(intruder.token)).send({}))
          .status,
      ).toBe(404);
      expect((await http().get(`${API}/rides/${rideId}`).set(auth(admin))).status).toBe(200);
    });

    it('shares phone numbers only with the assigned counterpart', async () => {
      const admin = await makeAdmin();
      const p = await passenger('phone1@example.com');
      const d = await onlineDriver(admin, 'phone1-d@example.com');
      const created = await requestRide(p);

      const before = await http().get(`${API}/rides/${created.body.id}`).set(auth(p.token));
      expect(before.body.driver).toBeNull();

      await acceptRide(d, created.body.id);
      const passengerView = await http().get(`${API}/rides/${created.body.id}`).set(auth(p.token));
      expect(passengerView.body.driver.phone).toBe('+44 7700 900501');

      const driverView = await http().get(`${API}/rides/${created.body.id}`).set(auth(d.token));
      expect(driverView.body.passenger.phone).toBe('+44 7700 900777');
    });
  });

  // ---- offers ----

  describe('offers', () => {
    it('a rejected offer goes to the next driver', async () => {
      const admin = await makeAdmin();
      const p = await passenger('rej1@example.com');
      const near = await onlineDriver(admin, 'rej1-near@example.com', 56.1955, -3.1565);
      const second = await onlineDriver(admin, 'rej1-second@example.com', 56.196, -3.157);
      const third = await onlineDriver(admin, 'rej1-third@example.com', 56.197, -3.158);
      const fourth = await onlineDriver(admin, 'rej1-fourth@example.com', 56.199, -3.16);
      const created = await requestRide(p);

      // Only the first three hold offers. Reject all three; the fourth driver gets the ride.
      expect(await myOffers(fourth)).toHaveLength(0);
      for (const d of [near, second, third]) {
        const res = await http().post(`${API}/rides/${created.body.id}/reject`).set(auth(d.token));
        expect(res.status).toBe(204);
      }
      expect(await myOffers(fourth)).toHaveLength(1);
    });

    it('expired offers cannot be accepted, and the sweep re-offers the ride', async () => {
      const admin = await makeAdmin();
      const p = await passenger('exp1@example.com');
      const near = await onlineDriver(admin, 'exp1-near@example.com', 56.1955, -3.1565);
      const second = await onlineDriver(admin, 'exp1-second@example.com', 56.196, -3.157);
      await onlineDriver(admin, 'exp1-third@example.com', 56.197, -3.158);
      const fourth = await onlineDriver(admin, 'exp1-fourth@example.com', 56.199, -3.16);
      const created = await requestRide(p);

      await AppDataSource.query(
        `UPDATE ride_offers SET expires_at = now() - interval '1 minute' WHERE ride_id = $1`,
        [created.body.id],
      );
      const late = await acceptRide(near, created.body.id);
      expect(late.status).toBe(409);

      await app.get(DispatchService).sweep();

      const statuses = await AppDataSource.query(
        'SELECT response, count(*)::int AS n FROM ride_offers WHERE ride_id = $1 GROUP BY response ORDER BY response',
        [created.body.id],
      );
      expect(statuses.find((s: { response: string }) => s.response === 'expired').n).toBe(3);
      expect(await myOffers(fourth)).toHaveLength(1);
      expect(await myOffers(second)).toHaveLength(0);
    });
  });

  // ---- cancel and rating ----

  describe('rating', () => {
    it('rates a completed ride once and updates the driver average', async () => {
      const admin = await makeAdmin();
      const p = await passenger('rate1@example.com');
      const d = await onlineDriver(admin, 'rate1-d@example.com');
      const rideId = await assignedRide(admin, p, d);

      const early = await http()
        .post(`${API}/rides/${rideId}/rating`)
        .set(auth(p.token))
        .send({ score: 5 });
      expect(early.status).toBe(409);

      await http().post(`${API}/rides/${rideId}/arrive`).set(auth(d.token));
      await http().post(`${API}/rides/${rideId}/start`).set(auth(d.token));
      await http().post(`${API}/rides/${rideId}/complete`).set(auth(d.token)).send({});

      const rated = await http()
        .post(`${API}/rides/${rideId}/rating`)
        .set(auth(p.token))
        .send({ score: 4, comment: 'Smooth' });
      expect(rated.status).toBe(201);

      const again = await http()
        .post(`${API}/rides/${rideId}/rating`)
        .set(auth(p.token))
        .send({ score: 1 });
      expect(again.status).toBe(409);

      const me = await http().get(`${API}/drivers/me`).set(auth(d.token));
      expect(me.body.ratingAvg).toBe(4);
    });
  });

  // ---- later bookings and admin ----

  describe('later bookings and admin dispatch', () => {
    it('keeps a later booking out of automatic dispatch until operations assign it', async () => {
      const admin = await makeAdmin();
      const p = await passenger('later1@example.com');
      const d = await onlineDriver(admin, 'later1-d@example.com');
      const when = new Date(Date.now() + 3 * 3600_000).toISOString();

      const created = await requestRide(p, { bookingMode: 'later', scheduledAt: when });
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('requested');
      expect(await myOffers(d)).toHaveLength(0);

      const queue = await http().get(`${API}/admin/dispatch/queue`).set(auth(admin));
      expect(queue.body.map((r: { id: string }) => r.id)).toContain(created.body.id);

      const assigned = await http()
        .post(`${API}/admin/rides/${created.body.id}/assign`)
        .set(auth(admin))
        .send({ driverId: d.id });
      expect(assigned.status).toBe(201);
      expect(assigned.body.status).toBe('assigned');
      expect(assigned.body.driver.id).toBe(d.id);
    });

    it('will not assign a ride to a driver who is offline', async () => {
      const admin = await makeAdmin();
      const p = await passenger('later2@example.com');
      const offline = await approvedDriver(admin, 'later2-off@example.com');
      const created = await requestRide(p, {
        bookingMode: 'later',
        scheduledAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
      });
      const res = await http()
        .post(`${API}/admin/rides/${created.body.id}/assign`)
        .set(auth(admin))
        .send({ driverId: offline.id });
      expect(res.status).toBe(409);
    });

    it('lists rides for operations with filters, and cancels one as admin with an audit entry', async () => {
      const admin = await makeAdmin();
      const p = await passenger('ops1@example.com');
      const created = await requestRide(p);

      const list = await http().get(`${API}/admin/rides?status=requested`).set(auth(admin));
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(1);

      const cancel = await http()
        .post(`${API}/rides/${created.body.id}/cancel`)
        .set(auth(admin))
        .send({ reason: 'Duplicate booking' });
      expect(cancel.status).toBe(201);
      expect(cancel.body.status).toBe('cancelled');

      const rows = await AppDataSource.query(
        "SELECT payload FROM audit_log WHERE action = 'ride.cancelled'",
      );
      expect(rows).toHaveLength(1);
    });
  });
});
