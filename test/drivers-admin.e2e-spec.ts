/* Supertest response bodies are untyped JSON; asserting on them is the point of these tests. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { existsSync } from 'fs';
import * as path from 'path';
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

const API = '/api/v1';
const PASSWORD = 'correct-horse-battery';
const PDF = Buffer.from('%PDF-1.4\n% test document\n%%EOF\n');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF test')]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png test'),
]);
const DOC_TYPES = ['licence', 'council_licence', 'council_plate', 'insurance', 'v5c'];

let plateSeq = 0;

/** Each driver gets a unique plate unless the test sets one. */
function driverBody(email: string, plate = `TS${++plateSeq} ABC`) {
  return {
    name: 'Test Driver',
    email,
    phone: '+44 7700 900501',
    password: PASSWORD,
    acceptedTerms: true,
    vehicleMakeModel: 'Toyota Prius',
    vehiclePlate: plate,
    operatingZone: 'Glenrothes',
  };
}

describe('Drivers and admin API (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  let storageDir: string;

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

    storageDir = path.resolve(configuration().storage.dir);
    app = await createApp();
    await app.init();
  });

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE "refresh_tokens", "blocks", "driver_locations", "driver_documents", "vehicles", "driver_profiles", "rides", "payments", "chat_messages", "chat_threads", "ride_offers", "ride_stops", "ride_ratings", "alerts", "audit_log", "places", "pricing_rules", "users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await AppDataSource.destroy();
  });

  // ---- helpers ----

  async function registerDriver(email: string, plate?: string) {
    const res = await http().post(`${API}/auth/register/driver`).send(driverBody(email, plate));
    expect(res.status).toBe(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  async function registerPassenger(email: string) {
    const res = await http().post(`${API}/auth/register/passenger`).send({
      name: 'Rider',
      email,
      phone: '+44 7700 900777',
      password: PASSWORD,
      acceptedTerms: true,
    });
    expect(res.status).toBe(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  async function makeAdmin(email = 'admin@example.com') {
    await AppDataSource.getRepository(User).save({
      name: 'Ops',
      email,
      phone: '+44 1500 000001',
      passwordHash: await hashPassword(PASSWORD),
      roles: [UserRole.Admin],
      status: AccountStatus.Active,
    });
    const res = await http().post(`${API}/auth/login`).send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  function upload(
    token: string,
    type: string,
    file: Buffer = PDF,
    filename = 'doc.pdf',
    extra: Record<string, string> = {},
  ) {
    let req = http()
      .post(`${API}/drivers/me/documents/${type}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, filename);
    for (const [k, v] of Object.entries(extra)) req = req.field(k, v);
    return req;
  }

  async function uploadAll(token: string) {
    for (const type of DOC_TYPES) {
      const res = await upload(token, type);
      expect(res.status).toBe(201);
    }
  }

  async function verifyAll(adminToken: string, driverId: string) {
    for (const type of DOC_TYPES) {
      const res = await http()
        .patch(`${API}/admin/drivers/${driverId}/documents/${type}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'verified' });
      expect(res.status).toBe(200);
    }
  }

  async function approveAndVerify(adminToken: string, driver: { token: string; id: string }) {
    const approve = await http()
      .patch(`${API}/admin/users/${driver.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });
    expect(approve.status).toBe(200);
    await uploadAll(driver.token);
    await verifyAll(adminToken, driver.id);
  }

  async function goOnline(token: string) {
    return http()
      .put(`${API}/drivers/me/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'online' });
  }

  // ---- driver self-service ----

  describe('driver profile and status', () => {
    it('returns the profile with documents not yet valid', async () => {
      const d = await registerDriver('d1@example.com', 'SF26 TAX');
      const res = await http().get(`${API}/drivers/me`).set('Authorization', `Bearer ${d.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        accountStatus: 'pending',
        onlineStatus: 'offline',
        documentsValid: false,
        vehicle: { plate: 'SF26 TAX' },
      });
    });

    it('refuses to go online while the account awaits approval', async () => {
      const d = await registerDriver('d2@example.com');
      const res = await goOnline(d.token);
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/awaiting approval/);
    });

    it('refuses to go online without all five verified documents', async () => {
      const d = await registerDriver('d3@example.com');
      await http()
        .patch(`${API}/admin/users/${d.id}/status`)
        .set('Authorization', `Bearer ${await makeAdmin()}`)
        .send({ status: 'active' });
      const res = await goOnline(d.token);
      expect(res.status).toBe(409);
    });

    it('goes online once approved and every document is verified, and goes offline again', async () => {
      const admin = await makeAdmin();
      const d = await registerDriver('d4@example.com');
      await approveAndVerify(admin, d);

      const on = await goOnline(d.token);
      expect(on.status).toBe(200);
      expect(on.body.onlineStatus).toBe('online');

      const off = await http()
        .put(`${API}/drivers/me/status`)
        .set('Authorization', `Bearer ${d.token}`)
        .send({ status: 'offline' });
      expect(off.body.onlineStatus).toBe('offline');
    });

    it('updates the vehicle and rejects a plate already registered to someone else', async () => {
      const first = await registerDriver('d5@example.com', 'AB12 CDE');
      await registerDriver('d6@example.com', 'ZZ99 ZZZ');

      const ok = await http()
        .patch(`${API}/drivers/me`)
        .set('Authorization', `Bearer ${first.token}`)
        .send({ vehiclePlate: 'ab12 xyz', operatingZone: 'Kirkcaldy' });
      expect(ok.status).toBe(200);
      expect(ok.body.vehicle.plate).toBe('AB12 XYZ');
      expect(ok.body.operatingZone).toBe('Kirkcaldy');

      const clash = await http()
        .patch(`${API}/drivers/me`)
        .set('Authorization', `Bearer ${first.token}`)
        .send({ vehiclePlate: 'ZZ99 ZZZ' });
      expect(clash.status).toBe(409);
    });

    it('refuses a second registration on the same number plate at signup', async () => {
      await registerDriver('dup-plate-1@example.com', 'DP11 PLT');
      const res = await http()
        .post(`${API}/auth/register/driver`)
        .send(driverBody('dup-plate-2@example.com', 'DP11 PLT'));
      expect(res.status).toBe(409);
      const [{ count }] = await AppDataSource.query(
        'SELECT count(*)::int AS count FROM users WHERE email = $1',
        ['dup-plate-2@example.com'],
      );
      expect(count).toBe(0);
    });

    it('stores a location ping and validates coordinates', async () => {
      const d = await registerDriver('d7@example.com');
      const ok = await http()
        .post(`${API}/drivers/me/location`)
        .set('Authorization', `Bearer ${d.token}`)
        .send({ lat: 56.1955, lng: -3.1565, heading: 90 });
      expect(ok.status).toBe(204);

      const [row] = await AppDataSource.query('SELECT lat, lng, heading FROM driver_locations');
      expect(Number(row.lat)).toBeCloseTo(56.1955);
      expect(row.heading).toBe(90);

      const bad = await http()
        .post(`${API}/drivers/me/location`)
        .set('Authorization', `Bearer ${d.token}`)
        .send({ lat: 123, lng: 0 });
      expect(bad.status).toBe(400);
    });
  });

  describe('driver documents', () => {
    it('lists all five document types, all missing at first', async () => {
      const d = await registerDriver('doc1@example.com');
      const res = await http()
        .get(`${API}/drivers/me/documents`)
        .set('Authorization', `Bearer ${d.token}`);
      expect(res.status).toBe(200);
      expect(res.body.map((x: { type: string }) => x.type)).toEqual(DOC_TYPES);
      expect(res.body.every((x: { status: string }) => x.status === 'missing')).toBe(true);
    });

    it('accepts PDF, JPEG and PNG and sets the document to pending', async () => {
      const d = await registerDriver('doc2@example.com');
      const pdf = await upload(d.token, 'licence', PDF, 'licence.pdf');
      expect(pdf.status).toBe(201);
      expect(pdf.body).toMatchObject({ type: 'licence', status: 'pending' });

      const jpg = await upload(d.token, 'insurance', JPEG, 'photo.jpg');
      expect(jpg.status).toBe(201);
      const png = await upload(d.token, 'v5c', PNG, 'scan.png');
      expect(png.status).toBe(201);
    });

    it('decides the file type from its bytes, not the file name or claimed type', async () => {
      const d = await registerDriver('doc3@example.com');
      const disguised = Buffer.from('MZ\x90\x00 this is an executable, not a PDF');
      const res = await upload(d.token, 'licence', disguised, 'licence.pdf');
      expect(res.status).toBe(415);
    });

    it('rejects an empty upload and an unknown document type', async () => {
      const d = await registerDriver('doc4@example.com');
      const empty = await upload(d.token, 'licence', Buffer.alloc(0), 'empty.pdf');
      expect(empty.status).toBe(400);

      const unknown = await upload(d.token, 'passport', PDF, 'p.pdf');
      expect(unknown.status).toBe(400);
    });

    it('rejects a file over the configured size limit', async () => {
      const d = await registerDriver('doc5@example.com');
      const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
      const res = await upload(d.token, 'licence', big, 'big.pdf');
      expect(res.status).toBe(413);
    });

    it('rejects an expiry date in the past', async () => {
      const d = await registerDriver('doc6@example.com');
      const res = await upload(d.token, 'insurance', PDF, 'i.pdf', {
        expiresAt: '2020-01-01T00:00:00Z',
      });
      expect(res.status).toBe(400);
    });

    it('stores the file under a server-generated key, never the client file name', async () => {
      const d = await registerDriver('doc7@example.com');
      await upload(d.token, 'licence', PDF, '../../etc/passwd.pdf');
      const [row] = await AppDataSource.query('SELECT file_key FROM driver_documents');
      expect(row.file_key).toMatch(new RegExp(`^drivers/${d.id}/licence/[0-9a-f-]{36}\\.pdf$`));
      expect(existsSync(path.join(storageDir, row.file_key))).toBe(true);
    });

    it('keeps passengers out of driver endpoints', async () => {
      const p = await registerPassenger('rider1@example.com');
      const res = await http().get(`${API}/drivers/me`).set('Authorization', `Bearer ${p.token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('driver blocks', () => {
    it('blocks, lists, and unblocks a passenger', async () => {
      const d = await registerDriver('blk1@example.com');
      const p = await registerPassenger('rider2@example.com');
      const auth = { Authorization: `Bearer ${d.token}` };

      const created = await http()
        .post(`${API}/drivers/me/blocks`)
        .set(auth)
        .send({ passengerId: p.id });
      expect(created.status).toBe(201);
      expect(created.body.passengerId).toBe(p.id);

      const again = await http()
        .post(`${API}/drivers/me/blocks`)
        .set(auth)
        .send({ passengerId: p.id });
      expect(again.status).toBe(201);

      const list = await http().get(`${API}/drivers/me/blocks`).set(auth);
      expect(list.body).toHaveLength(1);

      const gone = await http().delete(`${API}/drivers/me/blocks/${p.id}`).set(auth);
      expect(gone.status).toBe(204);
      const after = await http().get(`${API}/drivers/me/blocks`).set(auth);
      expect(after.body).toHaveLength(0);
    });

    it('will not block itself or a non-passenger account', async () => {
      const d = await registerDriver('blk2@example.com');
      const other = await registerDriver('blk3@example.com');
      const auth = { Authorization: `Bearer ${d.token}` };

      const self = await http()
        .post(`${API}/drivers/me/blocks`)
        .set(auth)
        .send({ passengerId: d.id });
      expect(self.status).toBe(400);

      const notPassenger = await http()
        .post(`${API}/drivers/me/blocks`)
        .set(auth)
        .send({ passengerId: other.id });
      expect(notPassenger.status).toBe(404);
    });
  });

  // ---- admin ----

  describe('admin', () => {
    it('keeps non-admins out of admin endpoints', async () => {
      const d = await registerDriver('adm-block1@example.com');
      const res = await http().get(`${API}/admin/users`).set('Authorization', `Bearer ${d.token}`);
      expect(res.status).toBe(403);

      const anon = await http().get(`${API}/admin/users`);
      expect(anon.status).toBe(401);
    });

    it('lists and filters users with pagination', async () => {
      const admin = await makeAdmin();
      await registerDriver('list-d1@example.com');
      await registerDriver('list-d2@example.com');
      await registerPassenger('list-p1@example.com');

      const drivers = await http()
        .get(`${API}/admin/users?role=driver&pageSize=1`)
        .set('Authorization', `Bearer ${admin}`);
      expect(drivers.status).toBe(200);
      expect(drivers.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      expect(drivers.body.data).toHaveLength(1);
      expect(drivers.body.data[0].roles).toEqual(['driver']);

      const search = await http()
        .get(`${API}/admin/users?q=list-p1`)
        .set('Authorization', `Bearer ${admin}`);
      expect(search.body.total).toBe(1);
      expect(search.body.data[0].email).toBe('list-p1@example.com');
    });

    it('caps page size at 100', async () => {
      const admin = await makeAdmin();
      const res = await http()
        .get(`${API}/admin/users?pageSize=500`)
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(400);
    });

    it('will not let an admin change their own status', async () => {
      const admin = await makeAdmin();
      const me = await http().get(`${API}/auth/me`).set('Authorization', `Bearer ${admin}`);
      const res = await http()
        .patch(`${API}/admin/users/${me.body.id}/status`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ status: 'suspended' });
      expect(res.status).toBe(409);
    });

    it('verifies documents, and the driver can then go online', async () => {
      const admin = await makeAdmin();
      const d = await registerDriver('rev1@example.com');
      await approveAndVerify(admin, d);

      const profile = await http()
        .get(`${API}/drivers/me`)
        .set('Authorization', `Bearer ${d.token}`);
      expect(profile.body.documentsValid).toBe(true);
    });

    it('rejecting a document takes an online driver offline at once', async () => {
      const admin = await makeAdmin();
      const d = await registerDriver('rev2@example.com');
      await approveAndVerify(admin, d);
      expect((await goOnline(d.token)).status).toBe(200);

      const reject = await http()
        .patch(`${API}/admin/drivers/${d.id}/documents/insurance`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ status: 'missing', note: 'Certificate does not show hire & reward cover' });
      expect(reject.status).toBe(200);

      const profile = await http()
        .get(`${API}/drivers/me`)
        .set('Authorization', `Bearer ${d.token}`);
      expect(profile.body.onlineStatus).toBe('offline');
      expect(profile.body.documentsValid).toBe(false);
      expect((await goOnline(d.token)).status).toBe(409);
    });

    it('replacing a verified document takes the driver offline until it is re-verified', async () => {
      const admin = await makeAdmin();
      const d = await registerDriver('rev3@example.com');
      await approveAndVerify(admin, d);
      expect((await goOnline(d.token)).status).toBe(200);

      const replaced = await upload(d.token, 'v5c', PNG, 'v5c.png');
      expect(replaced.status).toBe(201);
      expect(replaced.body.status).toBe('pending');

      const profile = await http()
        .get(`${API}/drivers/me`)
        .set('Authorization', `Bearer ${d.token}`);
      expect(profile.body.onlineStatus).toBe('offline');
    });

    it('cannot verify a document that was never uploaded', async () => {
      const admin = await makeAdmin();
      const d = await registerDriver('rev4@example.com');
      const res = await http()
        .patch(`${API}/admin/drivers/${d.id}/documents/licence`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ status: 'verified' });
      expect(res.status).toBe(404);
    });

    it('writes an audit entry for each document decision', async () => {
      const admin = await makeAdmin();
      const d = await registerDriver('rev5@example.com');
      await uploadAll(d.token);
      await http()
        .patch(`${API}/admin/drivers/${d.id}/documents/licence`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ status: 'verified' });

      const rows = await AppDataSource.query(
        "SELECT action, payload FROM audit_log WHERE action = 'driver_document.reviewed'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toMatchObject({ type: 'licence', from: 'pending', to: 'verified' });
    });

    it('lists drivers with document progress and shows one driver in full', async () => {
      const admin = await makeAdmin();
      const d = await registerDriver('list-drv@example.com', 'LL11 LLL');
      await approveAndVerify(admin, d);

      const list = await http()
        .get(`${API}/admin/drivers?zone=Glenrothes`)
        .set('Authorization', `Bearer ${admin}`);
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(1);
      expect(list.body.data[0]).toMatchObject({
        documentsVerified: 5,
        documentsRequired: 5,
        vehicle: { plate: 'LL11 LLL' },
      });

      const one = await http()
        .get(`${API}/admin/drivers/${d.id}`)
        .set('Authorization', `Bearer ${admin}`);
      expect(one.body.documents).toHaveLength(5);
      expect(one.body.documents.every((x: { status: string }) => x.status === 'verified')).toBe(
        true,
      );
    });

    it('lets an admin view an uploaded document, audits it, and 404s when none exists', async () => {
      const admin = await makeAdmin();
      const d = await registerDriver('view1@example.com');
      const missing = await http()
        .get(`${API}/admin/drivers/${d.id}/documents/licence/file`)
        .set('Authorization', `Bearer ${admin}`);
      expect(missing.status).toBe(404);

      await upload(d.token, 'licence', PDF, 'licence.pdf');
      const res = await http()
        .get(`${API}/admin/drivers/${d.id}/documents/licence/file`)
        .set('Authorization', `Bearer ${admin}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(res.body as Buffer).equals(PDF)).toBe(true);

      const audit = await AppDataSource.query(
        "SELECT count(*)::int AS n FROM audit_log WHERE action = 'driver_document.viewed'",
      );
      expect(audit[0].n).toBe(1);

      const driverTry = await http()
        .get(`${API}/admin/drivers/${d.id}/documents/licence/file`)
        .set('Authorization', `Bearer ${d.token}`);
      expect(driverTry.status).toBe(403);
    });

    it('suspending a driver takes them offline and locks them out', async () => {
      const admin = await makeAdmin();
      const d = await registerDriver('susp@example.com');
      await approveAndVerify(admin, d);
      expect((await goOnline(d.token)).status).toBe(200);

      const res = await http()
        .patch(`${API}/admin/users/${d.id}/status`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ status: 'suspended' });
      expect(res.status).toBe(200);

      const [row] = await AppDataSource.query(
        'SELECT p.online_status FROM driver_profiles p WHERE p.user_id = $1',
        [d.id],
      );
      expect(row.online_status).toBe('offline');

      const me = await http().get(`${API}/drivers/me`).set('Authorization', `Bearer ${d.token}`);
      expect(me.status).toBe(401);
    });
  });
});
