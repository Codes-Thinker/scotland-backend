/* Shared helpers for end-to-end tests. Supertest and socket bodies are untyped JSON. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import AppDataSource from '@/database/data-source';
import { User } from '@/database/entities/account.entity';
import { hashPassword } from '@/common/password';
import { AccountStatus, UserRole } from '@/database/enums';

export const API = '/api/v1';
export const PASSWORD = 'correct-horse-battery';
export const PDF = Buffer.from('%PDF-1.4\n% doc\n%%EOF\n');
export const DOC_TYPES = ['licence', 'council_licence', 'council_plate', 'insurance', 'v5c'];
export const PICKUP = { address: 'Riverside Park, Glenrothes', lat: 56.1955, lng: -3.1565 };
export const DROP = { address: 'Victoria Hospital, Kirkcaldy', lat: 56.1165, lng: -3.159 };

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let plateSeq = 0;

export class Api {
  constructor(private readonly app: INestApplication) {}

  http() {
    return request(this.app.getHttpServer());
  }

  async admin(email = 'ops@example.com'): Promise<string> {
    await AppDataSource.getRepository(User).save({
      name: 'Ops',
      email,
      phone: '+44 1500 000001',
      passwordHash: await hashPassword(PASSWORD),
      roles: [UserRole.Admin],
      status: AccountStatus.Active,
    });
    const res = await this.http().post(`${API}/auth/login`).send({ email, password: PASSWORD });
    return res.body.accessToken as string;
  }

  async passenger(email: string) {
    const res = await this.http()
      .post(`${API}/auth/register/passenger`)
      .send({
        name: `Rider ${email}`,
        email,
        phone: '+44 7700 900777',
        password: PASSWORD,
        acceptedTerms: true,
      });
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  /** Approved, fully documented, online, reporting a location. */
  async onlineDriver(admin: string, email: string, lat = 56.1955, lng = -3.1565) {
    plateSeq += 1;
    const reg = await this.http()
      .post(`${API}/auth/register/driver`)
      .send({
        name: `Driver ${email}`,
        email,
        phone: '+44 7700 900501',
        password: PASSWORD,
        acceptedTerms: true,
        vehicleMakeModel: 'Toyota Prius',
        vehiclePlate: `RT${plateSeq} ABC`,
        operatingZone: 'Glenrothes',
      });
    const token = reg.body.accessToken as string;
    const id = reg.body.user.id as string;
    await this.http()
      .patch(`${API}/admin/users/${id}/status`)
      .set(auth(admin))
      .send({ status: 'active' });
    for (const type of DOC_TYPES) {
      await this.http()
        .post(`${API}/drivers/me/documents/${type}`)
        .set(auth(token))
        .attach('file', PDF, 'doc.pdf');
      await this.http()
        .patch(`${API}/admin/drivers/${id}/documents/${type}`)
        .set(auth(admin))
        .send({ status: 'verified' });
    }
    await this.http().put(`${API}/drivers/me/status`).set(auth(token)).send({ status: 'online' });
    await this.http().post(`${API}/drivers/me/location`).set(auth(token)).send({ lat, lng });
    return { token, id };
  }

  async requestRide(p: { token: string }) {
    return this.http()
      .post(`${API}/rides`)
      .set(auth(p.token))
      .send({ pickup: PICKUP, drop: DROP, rideType: 'standard' });
  }

  async accept(d: { token: string }, rideId: string) {
    return this.http().post(`${API}/rides/${rideId}/accept`).set(auth(d.token));
  }
}

/** Connects to the realtime namespace. Resolves once the server says the socket is ready. */
export function connect(port: number, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    const timer = setTimeout(() => reject(new Error('socket did not become ready')), 5000);
    socket.once('ready', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Resolves with the next payload for `event`. Register before the action that triggers it. */
export function waitFor<T = unknown>(socket: Socket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
