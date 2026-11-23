import 'dotenv/config';
import { EntityManager } from 'typeorm';
import { hashPassword } from '@/common/password';
import AppDataSource from '../data-source';
import { DriverDocument, DriverProfile, User, Vehicle } from '../entities/account.entity';
import { Payment } from '../entities/payment.entity';
import { Place, PricingRule } from '../entities/ops.entity';
import { Ride } from '../entities/ride.entity';
import {
  AccountStatus,
  BookingMode,
  DispatchPriority,
  DriverDocumentStatus,
  DriverDocumentType,
  DriverOnlineStatus,
  PaymentStatus,
  PlaceKind,
  RideStatus,
  RideType,
  UserRole,
  VehicleCategory,
} from '../enums';

/*
 * Demo data seeded from the admin dashboard mock (scotland-admin-panel/src/lib/mock-data.ts)
 * and the Flutter place list (scotland-app/lib/services/mock_repository.dart).
 * Development and test only. Refused when NODE_ENV=production.
 *
 * Run:   npm run seed                 (fails if users already exist)
 * Reset: SEED_RESET=true npm run seed (truncates every table, then seeds)
 */

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoPass123';

type UserKey =
  | 'smith'
  | 'brooke'
  | 'reece'
  | 'macnly'
  | 'mrs'
  | 'ops'
  | 'ayaz'
  | 'wadza'
  | 'eugene'
  | 'glen'
  | 'coastal'
  | 'dudu';

const USERS: {
  key: UserKey;
  name: string;
  email: string;
  phone: string;
  roles: UserRole[];
  status: AccountStatus;
}[] = [
  {
    key: 'smith',
    name: 'Smith',
    email: 'smith@demo.local',
    phone: '+44 7700 900123',
    roles: [UserRole.Passenger],
    status: AccountStatus.Active,
  },
  {
    key: 'brooke',
    name: 'Brooke',
    email: 'brooke@demo.local',
    phone: '+44 7700 900201',
    roles: [UserRole.Passenger],
    status: AccountStatus.Active,
  },
  {
    key: 'reece',
    name: 'reece',
    email: 'reece@demo.local',
    phone: '+44 7700 900202',
    roles: [UserRole.Passenger],
    status: AccountStatus.Active,
  },
  {
    key: 'macnly',
    name: 'Macnly',
    email: 'macnly@demo.local',
    phone: '+44 7700 900203',
    roles: [UserRole.Passenger],
    status: AccountStatus.Suspended,
  },
  {
    key: 'mrs',
    name: 'Mrs',
    email: 'mrs@demo.local',
    phone: '+44 7700 900204',
    roles: [UserRole.Passenger],
    status: AccountStatus.Active,
  },
  {
    key: 'ops',
    name: 'Operations Admin',
    email: 'ops@demo.local',
    phone: '+44 1500 000001',
    roles: [UserRole.Admin],
    status: AccountStatus.Active,
  },
  {
    key: 'ayaz',
    name: 'ayaz',
    email: 'driver@demo.local',
    phone: '+44 7700 900456',
    roles: [UserRole.Driver],
    status: AccountStatus.Active,
  },
  {
    key: 'wadza',
    name: 'Wadza Makore',
    email: 'wadza@demo.local',
    phone: '+44 7700 900501',
    roles: [UserRole.Driver],
    status: AccountStatus.Active,
  },
  {
    key: 'eugene',
    name: 'Eugene Dhliwayo',
    email: 'eugene@demo.local',
    phone: '+44 7700 900502',
    roles: [UserRole.Driver],
    status: AccountStatus.Pending,
  },
  {
    key: 'glen',
    name: 'Glenrothes Driver',
    email: 'glen@demo.local',
    phone: '+44 7700 900503',
    roles: [UserRole.Driver],
    status: AccountStatus.Active,
  },
  {
    key: 'coastal',
    name: 'Coastal Fleet',
    email: 'coastal@demo.local',
    phone: '+44 7700 900600',
    roles: [UserRole.Driver],
    status: AccountStatus.Active,
  },
  {
    key: 'dudu',
    name: 'Dudu',
    email: 'dudu@demo.local',
    phone: '+44 7700 900601',
    roles: [UserRole.Driver],
    status: AccountStatus.Active,
  },
];

type DriverSeed = {
  userKey: UserKey;
  zone: string | null;
  online: DriverOnlineStatus;
  rating: number;
  rides: number;
  /** Dashboard summary: Verified | Pending | Expired */
  docs: 'Verified' | 'Pending' | 'Expired';
  vehicle: string;
  plate: string;
};

const DRIVERS: DriverSeed[] = [
  {
    userKey: 'wadza',
    zone: 'Levenmouth',
    online: DriverOnlineStatus.Online,
    rating: 4.9,
    rides: 37,
    docs: 'Verified',
    vehicle: 'Toyota Prius',
    plate: 'SF26 TAX',
  },
  {
    userKey: 'eugene',
    zone: 'Glenrothes',
    online: DriverOnlineStatus.Offline,
    rating: 4.7,
    rides: 14,
    docs: 'Verified',
    vehicle: 'Skoda Octavia',
    plate: 'KY12 CAB',
  },
  {
    userKey: 'ayaz',
    zone: null,
    online: DriverOnlineStatus.Offline,
    rating: 4.5,
    rides: 62,
    docs: 'Pending',
    vehicle: 'Ford Focus',
    plate: 'FK26 RDE',
  },
  {
    userKey: 'glen',
    zone: 'Glenrothes',
    online: DriverOnlineStatus.OnTrip,
    rating: 4.6,
    rides: 22,
    docs: 'Verified',
    vehicle: 'VW Passat',
    plate: 'CO24 FLT',
  },
  {
    userKey: 'coastal',
    zone: 'East Fife',
    online: DriverOnlineStatus.Online,
    rating: 4.4,
    rides: 41,
    docs: 'Verified',
    vehicle: 'Mercedes 200',
    plate: 'MER2001',
  },
  {
    userKey: 'dudu',
    zone: 'Kirkcaldy',
    online: DriverOnlineStatus.Offline,
    rating: 4.2,
    rides: 9,
    docs: 'Expired',
    vehicle: 'Mazda 323',
    plate: 'ABC1234',
  },
];

const PLACES: { title: string; address: string; postcode: string; kind: PlaceKind }[] = [
  {
    title: 'Glenrothes Centre',
    address: 'North Street, Glenrothes, Fife',
    postcode: 'KY7',
    kind: PlaceKind.Recent,
  },
  {
    title: 'Kirkcaldy Station',
    address: 'Station Road, Kirkcaldy',
    postcode: 'KY1',
    kind: PlaceKind.Recent,
  },
  {
    title: 'Victoria Hospital',
    address: 'Hayfield Road, Kirkcaldy',
    postcode: 'KY2',
    kind: PlaceKind.Recent,
  },
  {
    title: 'Riverside Park',
    address: 'Glenrothes, Fife',
    postcode: 'KY7 6NR',
    kind: PlaceKind.Popular,
  },
  {
    title: 'Kingdom Centre',
    address: 'North Street, Glenrothes',
    postcode: 'KY7 5NA',
    kind: PlaceKind.Popular,
  },
  {
    title: 'Edinburgh Airport',
    address: 'Edinburgh',
    postcode: 'EH12 9DN',
    kind: PlaceKind.Airport,
  },
  {
    title: 'St Andrews Bus Station',
    address: 'City Road, St Andrews',
    postcode: 'KY16',
    kind: PlaceKind.Transit,
  },
  { title: 'Leven High Street', address: 'Leven, Fife', postcode: 'KY8', kind: PlaceKind.Popular },
  {
    title: 'Fife College',
    address: 'Stenton Road, Glenrothes',
    postcode: 'KY6',
    kind: PlaceKind.Popular,
  },
  { title: 'Home', address: 'Saved place · Glenrothes', postcode: 'KY7', kind: PlaceKind.Saved },
  { title: 'Work', address: 'Saved place · Glenrothes', postcode: 'KY7', kind: PlaceKind.Saved },
  {
    title: 'Dunfermline Town',
    address: 'Dunfermline, Fife',
    postcode: 'KY12',
    kind: PlaceKind.Popular,
  },
];

/** Dashboard pricing, in pence. Scheduled is a booking mode now, so its row is not seeded. */
const PRICING: { rideType: RideType; base: number; perMile: number; notes: string }[] = [
  { rideType: RideType.Standard, base: 378, perMile: 246, notes: 'Mon–Fri daytime' },
  { rideType: RideType.Emergency, base: 600, perMile: 310, notes: 'Priority dispatch' },
  { rideType: RideType.Roadside, base: 2500, perMile: 0, notes: 'Assistance callout' },
];

type RideSeed = {
  key: string;
  passenger: UserKey;
  driver: UserKey | null;
  status: RideStatus;
  rideType: RideType;
  bookingMode: BookingMode;
  pickup: string;
  drop: string;
  fare: number;
  miles: number;
  priority: DispatchPriority;
  hoursAgo: number;
  /** 'tomorrow0530' or 'past' for later bookings. */
  schedule?: 'tomorrow0530' | 'past';
};

/** Dashboard rides r1–r10. Dashboard "Scheduled" type is seeded as Standard + later booking. */
const RIDES: RideSeed[] = [
  {
    key: 'r1',
    passenger: 'smith',
    driver: 'wadza',
    status: RideStatus.Completed,
    rideType: RideType.Standard,
    bookingMode: BookingMode.Now,
    pickup: 'Glenrothes',
    drop: 'Kirkcaldy',
    fare: 12.4,
    miles: 7.2,
    priority: DispatchPriority.Normal,
    hoursAgo: 30,
  },
  {
    key: 'r2',
    passenger: 'brooke',
    driver: 'coastal',
    status: RideStatus.Completed,
    rideType: RideType.Standard,
    bookingMode: BookingMode.Later,
    pickup: 'Leven',
    drop: 'St Andrews',
    fare: 28.0,
    miles: 14.1,
    priority: DispatchPriority.Normal,
    hoursAgo: 72,
    schedule: 'past',
  },
  {
    key: 'r3',
    passenger: 'reece',
    driver: null,
    status: RideStatus.Cancelled,
    rideType: RideType.Emergency,
    bookingMode: BookingMode.Now,
    pickup: 'Dunfermline',
    drop: 'Edinburgh',
    fare: 0,
    miles: 18.0,
    priority: DispatchPriority.Normal,
    hoursAgo: 4,
  },
  {
    key: 'r4',
    passenger: 'smith',
    driver: 'ayaz',
    status: RideStatus.InProgress,
    rideType: RideType.Standard,
    bookingMode: BookingMode.Now,
    pickup: 'Riverside Park',
    drop: 'Victoria Hospital',
    fare: 14.8,
    miles: 8.2,
    priority: DispatchPriority.Normal,
    hoursAgo: 0.3,
  },
  {
    key: 'r5',
    passenger: 'mrs',
    driver: 'glen',
    status: RideStatus.InProgress,
    rideType: RideType.Standard,
    bookingMode: BookingMode.Now,
    pickup: 'Kingdom Centre',
    drop: 'Dunfermline',
    fare: 22.5,
    miles: 11.4,
    priority: DispatchPriority.Normal,
    hoursAgo: 0.2,
  },
  {
    key: 'r6',
    passenger: 'brooke',
    driver: null,
    status: RideStatus.Requested,
    rideType: RideType.Roadside,
    bookingMode: BookingMode.Now,
    pickup: 'Levenmouth',
    drop: 'Glenrothes',
    fare: 25.0,
    miles: 6.0,
    priority: DispatchPriority.High,
    hoursAgo: 0.05,
  },
  {
    key: 'r7',
    passenger: 'macnly',
    driver: 'eugene',
    status: RideStatus.Cancelled,
    rideType: RideType.Standard,
    bookingMode: BookingMode.Now,
    pickup: 'Kirkcaldy',
    drop: 'Glenrothes',
    fare: 11.2,
    miles: 5.8,
    priority: DispatchPriority.Normal,
    hoursAgo: 40,
  },
  {
    key: 'r8',
    passenger: 'smith',
    driver: 'wadza',
    status: RideStatus.Assigned,
    rideType: RideType.Standard,
    bookingMode: BookingMode.Later,
    pickup: 'Home',
    drop: 'Airport',
    fare: 45.0,
    miles: 28.0,
    priority: DispatchPriority.Normal,
    hoursAgo: 1,
    schedule: 'tomorrow0530',
  },
  {
    key: 'r9',
    passenger: 'reece',
    driver: 'coastal',
    status: RideStatus.Completed,
    rideType: RideType.Standard,
    bookingMode: BookingMode.Now,
    pickup: 'St Andrews',
    drop: 'Leven',
    fare: 19.6,
    miles: 9.5,
    priority: DispatchPriority.Normal,
    hoursAgo: 96,
  },
  {
    key: 'r10',
    passenger: 'mrs',
    driver: null,
    status: RideStatus.Requested,
    rideType: RideType.Emergency,
    bookingMode: BookingMode.Now,
    pickup: 'East Fife',
    drop: 'Dundee',
    fare: 36.0,
    miles: 20.2,
    priority: DispatchPriority.Sos,
    hoursAgo: 0.01,
  },
];

/** Dashboard payments p1–p6, keyed by ride. */
const PAYMENTS: { ref: string; ride: string; amount: number; status: PaymentStatus }[] = [
  { ref: 'TX-10021', ride: 'r1', amount: 12.4, status: PaymentStatus.Paid },
  { ref: 'TX-10022', ride: 'r2', amount: 28.0, status: PaymentStatus.Paid },
  { ref: 'TX-10023', ride: 'r4', amount: 14.8, status: PaymentStatus.Pending },
  { ref: 'TX-10024', ride: 'r9', amount: 19.6, status: PaymentStatus.Paid },
  { ref: 'TX-10025', ride: 'r7', amount: 11.2, status: PaymentStatus.Failed },
  { ref: 'TX-10026', ride: 'r5', amount: 22.5, status: PaymentStatus.Pending },
];

function docRows(
  driverId: string,
  summary: DriverSeed['docs'],
  now: number,
): Partial<DriverDocument>[] {
  return Object.values(DriverDocumentType).map((type) => {
    let status = DriverDocumentStatus.Verified;
    if (summary === 'Pending') {
      status =
        type === DriverDocumentType.Licence || type === DriverDocumentType.Insurance
          ? DriverDocumentStatus.Pending
          : DriverDocumentStatus.Missing;
    }
    if (summary === 'Expired' && type === DriverDocumentType.Insurance) {
      status = DriverDocumentStatus.Expired;
    }
    const expired = status === DriverDocumentStatus.Expired;
    return {
      driverId,
      type,
      status,
      fileKey: status === DriverDocumentStatus.Missing ? null : `seed/${driverId}/${type}.pdf`,
      expiresAt: expired ? new Date(now - 14 * 86400e3) : null,
    };
  });
}

const LONDON = 'Europe/London';

/** Wall-clock parts of an instant as seen in Europe/London. */
function londonParts(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute') };
}

/** Converts a London wall-clock time to a UTC Date (handles BST/GMT). */
function londonToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = londonParts(new Date(guess));
    guess += target - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  }
  return new Date(guess);
}

/** Tomorrow 05:30 in London time, as a UTC instant. */
function tomorrowAt0530London(nowMs: number): Date {
  const today = londonParts(new Date(nowMs));
  const next = new Date(Date.UTC(today.y, today.mo - 1, today.d + 1));
  return londonToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 5, 30);
}

async function seed(m: EntityManager): Promise<void> {
  const now = Date.now();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const userIds = new Map<UserKey, string>();
  for (const u of USERS) {
    const saved = await m.save(User, {
      name: u.name,
      email: u.email,
      phone: u.phone,
      passwordHash,
      roles: u.roles,
      status: u.status,
    });
    userIds.set(u.key, saved.id);
  }
  const idOf = (k: UserKey): string => {
    const id = userIds.get(k);
    if (!id) throw new Error(`Seed: unknown user key ${k}`);
    return id;
  };

  for (const d of DRIVERS) {
    const driverId = idOf(d.userKey);
    await m.save(DriverProfile, {
      userId: driverId,
      operatingZone: d.zone,
      onlineStatus: d.online,
      ratingAvg: d.rating,
      ridesCount: d.rides,
    });
    await m.save(Vehicle, {
      driverId,
      makeModel: d.vehicle,
      plate: d.plate,
      category: VehicleCategory.FourSeater,
    });
    await m.save(DriverDocument, docRows(driverId, d.docs, now));
  }

  await m.save(
    Place,
    PLACES.map((p) => ({ title: p.title, address: p.address, postcode: p.postcode, kind: p.kind })),
  );

  await m.save(
    PricingRule,
    PRICING.map((p) => ({
      rideType: p.rideType,
      baseFarePence: p.base,
      perMilePence: p.perMile,
      minimumFarePence: 0,
      laterBookingSurchargeBp: 500, // +5% for later bookings, as in the app
      notes: p.notes,
    })),
  );

  const rideIds = new Map<string, string>();
  for (const r of RIDES) {
    const requestedAt = new Date(now - r.hoursAgo * 3600e3);
    let scheduledAt: Date | null = null;
    if (r.schedule === 'tomorrow0530') {
      scheduledAt = tomorrowAt0530London(now);
    } else if (r.schedule === 'past') {
      scheduledAt = new Date(now - 3 * 86400e3);
    }
    const fare = Math.round(r.fare * 100);
    const saved = await m.save(Ride, {
      passengerId: idOf(r.passenger),
      driverId: r.driver ? idOf(r.driver) : null,
      status: r.status,
      rideType: r.rideType,
      bookingMode: r.bookingMode,
      priority: r.priority,
      pickupAddress: r.pickup,
      dropAddress: r.drop,
      scheduledAt,
      fareEstimatePence: fare,
      fareFinalPence: r.status === RideStatus.Completed ? fare : null,
      distanceM: r.miles > 0 ? Math.round(r.miles * 1609.344) : null,
      requestedAt,
      assignedAt: r.driver ? new Date(requestedAt.getTime() + 5 * 60e3) : null,
      startedAt:
        r.status === RideStatus.InProgress ? new Date(requestedAt.getTime() + 10 * 60e3) : null,
      completedAt:
        r.status === RideStatus.Completed ? new Date(requestedAt.getTime() + 30 * 60e3) : null,
      cancelledAt:
        r.status === RideStatus.Cancelled ? new Date(requestedAt.getTime() + 2 * 60e3) : null,
    });
    rideIds.set(r.key, saved.id);
  }

  for (const p of PAYMENTS) {
    const rideId = rideIds.get(p.ride);
    if (!rideId) throw new Error(`Seed: payment ${p.ref} references unknown ride ${p.ride}`);
    await m.save(Payment, {
      rideId,
      reference: p.ref,
      amountPence: Math.round(p.amount * 100),
      status: p.status,
    });
  }

  console.log(
    `Seeded ${USERS.length} users, ${DRIVERS.length} drivers, ${PLACES.length} places, ` +
      `${PRICING.length} pricing rules, ${RIDES.length} rides, ${PAYMENTS.length} payments.`,
  );
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data when NODE_ENV=production.');
  }
  const ds = await AppDataSource.initialize();
  try {
    await ds.transaction(async (m) => {
      const existing = await m.count(User);
      if (existing > 0) {
        if (process.env.SEED_RESET !== 'true') {
          throw new Error('Users already exist. Re-run with SEED_RESET=true to wipe and reseed.');
        }
        const tables = ds.entityMetadatas.map((meta) => `"${meta.tableName}"`).join(', ');
        await m.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
        console.log('Existing data truncated.');
      }
      await seed(m);
    });
  } finally {
    await ds.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
