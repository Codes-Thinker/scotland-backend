/* Supertest response bodies are untyped JSON; asserting on them is the point of these tests. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Socket } from 'socket.io-client';
import { createApp } from '@/bootstrap';
import configuration from '@/config/configuration';
import AppDataSource from '@/database/data-source';
import { buildDataSourceOptions } from '@/database/database-options';
import { InitialSchema1795436787073 } from '@/database/migrations/1795436787073-InitialSchema';
import { AuthRefreshTokens1795438177643 } from '@/database/migrations/1795438177643-AuthRefreshTokens';
import { Api, API, auth, connect, waitFor } from './support/api-helpers';

describe('Realtime, chat and alerts (e2e)', () => {
  let app: INestApplication;
  let api: Api;
  let port: number;
  const sockets: Socket[] = [];

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
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    api = new Api(app);
  });

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE "alerts", "chat_messages", "chat_threads", "refresh_tokens", "blocks", "driver_locations", "driver_documents", "vehicles", "driver_profiles", "ride_ratings", "ride_offers", "ride_stops", "payments", "rides", "audit_log", "places", "users" RESTART IDENTITY CASCADE',
    );
    await AppDataSource.query(
      `INSERT INTO pricing_rules (ride_type, base_fare_pence, per_mile_pence, minimum_fare_pence, later_booking_surcharge_bp, notes, active)
       VALUES ('standard', 378, 246, 0, 500, 'test', true),
              ('emergency', 600, 310, 0, 500, 'test', true),
              ('roadside', 2500, 0, 0, 500, 'test', true)`,
    );
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  afterAll(async () => {
    await app?.close();
    await AppDataSource.destroy();
  });

  async function live(token: string): Promise<Socket> {
    const s = await connect(port, token);
    sockets.push(s);
    return s;
  }

  /** A passenger and an approved, online driver, with a ride accepted by that driver. */
  async function assignedRide(email: string) {
    const admin = await api.admin();
    const p = await api.passenger(`${email}-p@example.com`);
    const d = await api.onlineDriver(admin, `${email}-d@example.com`);
    const created = await api.requestRide(p);
    expect(created.status).toBe(201);
    const acc = await api.accept(d, created.body.id);
    expect(acc.status).toBe(201);
    return { admin, p, d, rideId: created.body.id as string };
  }

  // ---- connection ----

  describe('connection', () => {
    it('accepts a valid access token and reports ready', async () => {
      const admin = await api.admin();
      const s = await connect(port, admin);
      sockets.push(s);
      expect(s.connected).toBe(true);
    });

    it('disconnects a connection with no or a bad token', async () => {
      const bad = new Promise<string>((resolve) => {
        void import('socket.io-client').then(({ io }) => {
          const s = io(`http://127.0.0.1:${port}/realtime`, {
            auth: { token: 'not-a-jwt' },
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
          });
          sockets.push(s);
          s.on('disconnect', (reason: string) => resolve(reason));
        });
      });
      expect(await bad).toMatch(/io server disconnect/);
    });
  });

  // ---- ride events ----

  describe('ride events', () => {
    it('pushes a new offer to the driver in real time', async () => {
      const admin = await api.admin();
      const p = await api.passenger('rt-offer-p@example.com');
      const d = await api.onlineDriver(admin, 'rt-offer-d@example.com');
      const ds = await live(d.token);

      const got = waitFor<{ rideId: string; fareEstimatePence: number }>(ds, 'ride.offer');
      const created = await api.requestRide(p);
      const offer = await got;
      expect(offer.rideId).toBe(created.body.id);
      expect(offer.fareEstimatePence).toBe(created.body.fareEstimatePence);
    });

    it('tells the passenger when a driver accepts, and adds an alert', async () => {
      const admin = await api.admin();
      const p = await api.passenger('rt-acc-p@example.com');
      const d = await api.onlineDriver(admin, 'rt-acc-d@example.com');
      const ps = await live(p.token);
      const created = await api.requestRide(p);

      const status = waitFor<{ status: string }>(ps, 'ride.status');
      await api.accept(d, created.body.id);
      expect((await status).status).toBe('assigned');

      const alerts = await api.http().get(`${API}/me/alerts`).set(auth(p.token));
      expect(alerts.body.data[0].title).toBe('Driver on the way');
      expect(alerts.body.data[0].readAt).toBeNull();
    });

    it('streams the driver location to the passenger during the ride', async () => {
      const { p, d, rideId } = await assignedRide('rt-loc');
      const ps = await live(p.token);

      const got = waitFor<{ rideId: string; lat: number }>(ps, 'driver.location');
      await api
        .http()
        .post(`${API}/drivers/me/location`)
        .set(auth(d.token))
        .send({ lat: 56.19, lng: -3.15 });
      const loc = await got;
      expect(loc.rideId).toBe(rideId);
      expect(loc.lat).toBeCloseTo(56.19);
    });

    it('pushes each status change to both parties through the lifecycle', async () => {
      const { p, d, rideId } = await assignedRide('rt-life');
      const ps = await live(p.token);
      const ds = await live(d.token);

      const toPassenger = waitFor<{ status: string }>(ps, 'ride.status');
      await api.http().post(`${API}/rides/${rideId}/arrive`).set(auth(d.token));
      expect((await toPassenger).status).toBe('arrived');

      const toDriver = waitFor<{ status: string }>(ds, 'ride.status');
      await api.http().post(`${API}/rides/${rideId}/start`).set(auth(d.token));
      expect((await toDriver).status).toBe('in_progress');
    });
  });

  // ---- chat ----

  describe('chat', () => {
    it('is closed until a driver is assigned', async () => {
      const admin = await api.admin();
      const p = await api.passenger('chat0-p@example.com');
      await api.onlineDriver(admin, 'chat0-d@example.com');
      const created = await api.requestRide(p);
      const res = await api
        .http()
        .post(`${API}/rides/${created.body.id}/messages`)
        .set(auth(p.token))
        .send({ body: 'Hello?' });
      expect(res.status).toBe(409);
    });

    it('delivers messages both ways in real time and keeps them in history', async () => {
      const { p, d, rideId } = await assignedRide('chat1');
      const ps = await live(p.token);
      const ds = await live(d.token);

      const toDriver = waitFor<{ body: string; senderType: string }>(ds, 'chat.message');
      const sent = await api
        .http()
        .post(`${API}/rides/${rideId}/messages`)
        .set(auth(p.token))
        .send({ body: '  I am by the gate  ' });
      expect(sent.status).toBe(201);
      expect(sent.body.senderType).toBe('passenger');
      const received = await toDriver;
      expect(received.body).toBe('I am by the gate');

      const toPassenger = waitFor<{ senderType: string }>(ps, 'chat.message');
      await api
        .http()
        .post(`${API}/rides/${rideId}/messages`)
        .set(auth(d.token))
        .send({ body: 'On my way' });
      expect((await toPassenger).senderType).toBe('driver');

      const history = await api.http().get(`${API}/rides/${rideId}/messages`).set(auth(d.token));
      expect(history.body.data.map((m: { body: string }) => m.body)).toEqual([
        'On my way',
        'I am by the gate',
      ]);
    });

    it('pages history with a cursor, newest first', async () => {
      const { p, rideId } = await assignedRide('chat2');
      for (const body of ['one', 'two', 'three']) {
        await api.http().post(`${API}/rides/${rideId}/messages`).set(auth(p.token)).send({ body });
        await new Promise((r) => setTimeout(r, 5));
      }
      const first = await api
        .http()
        .get(`${API}/rides/${rideId}/messages?limit=2`)
        .set(auth(p.token));
      expect(first.body.data.map((m: { body: string }) => m.body)).toEqual(['three', 'two']);
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await api
        .http()
        .get(
          `${API}/rides/${rideId}/messages?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
        )
        .set(auth(p.token));
      expect(second.body.data.map((m: { body: string }) => m.body)).toEqual(['one']);
      expect(second.body.nextCursor).toBeNull();
    });

    it('is private to the two parties, and operations cannot post', async () => {
      const { admin, d, rideId } = await assignedRide('chat3');
      const stranger = await api.passenger('chat3-x@example.com');

      expect(
        (await api.http().get(`${API}/rides/${rideId}/messages`).set(auth(stranger.token))).status,
      ).toBe(404);
      expect(
        (
          await api
            .http()
            .post(`${API}/rides/${rideId}/messages`)
            .set(auth(stranger.token))
            .send({ body: 'hi' })
        ).status,
      ).toBe(404);
      expect(
        (
          await api
            .http()
            .post(`${API}/rides/${rideId}/messages`)
            .set(auth(admin))
            .send({ body: 'hi' })
        ).status,
      ).toBe(403);
      expect(
        (
          await api
            .http()
            .post(`${API}/rides/${rideId}/messages`)
            .set(auth(d.token))
            .send({ body: '' })
        ).status,
      ).toBe(400);
    });

    it('closes once the ride is completed, but history stays readable', async () => {
      const { p, d, rideId } = await assignedRide('chat4');
      await api
        .http()
        .post(`${API}/rides/${rideId}/messages`)
        .set(auth(p.token))
        .send({ body: 'before' });
      await api.http().post(`${API}/rides/${rideId}/arrive`).set(auth(d.token));
      await api.http().post(`${API}/rides/${rideId}/start`).set(auth(d.token));
      await api.http().post(`${API}/rides/${rideId}/complete`).set(auth(d.token)).send({});

      const after = await api
        .http()
        .post(`${API}/rides/${rideId}/messages`)
        .set(auth(p.token))
        .send({ body: 'after' });
      expect(after.status).toBe(409);

      const history = await api.http().get(`${API}/rides/${rideId}/messages`).set(auth(p.token));
      expect(history.status).toBe(200);
      expect(history.body.data[0].body).toBe('before');
    });
  });

  // ---- alerts ----

  describe('alerts', () => {
    it('lists alerts and marks them read, individually or all at once', async () => {
      const { p, d, rideId } = await assignedRide('alert1');
      await api.http().post(`${API}/rides/${rideId}/arrive`).set(auth(d.token));

      const list = await api.http().get(`${API}/me/alerts`).set(auth(p.token));
      expect(list.body.total).toBe(2); // driver on the way, driver arrived
      const [newest] = list.body.data;
      expect(newest.title).toBe('Your driver has arrived');

      const one = await api
        .http()
        .post(`${API}/me/alerts/read`)
        .set(auth(p.token))
        .send({ ids: [newest.id] });
      expect(one.body.updated).toBe(1);

      const rest = await api.http().post(`${API}/me/alerts/read`).set(auth(p.token)).send({});
      expect(rest.body.updated).toBe(1);

      const again = await api.http().post(`${API}/me/alerts/read`).set(auth(p.token)).send({});
      expect(again.body.updated).toBe(0);
    });

    it("does not let one user mark another user's alerts read", async () => {
      const { p, d, rideId } = await assignedRide('alert2');
      await api.http().post(`${API}/rides/${rideId}/arrive`).set(auth(d.token));
      const list = await api.http().get(`${API}/me/alerts`).set(auth(p.token));
      const other = await api.passenger('alert2-x@example.com');

      const res = await api
        .http()
        .post(`${API}/me/alerts/read`)
        .set(auth(other.token))
        .send({ ids: [list.body.data[0].id] });
      expect(res.body.updated).toBe(0);
    });
  });
});
