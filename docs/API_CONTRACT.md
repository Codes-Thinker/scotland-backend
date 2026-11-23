# Fife Nearby Taxis — Backend API Contract (v1 draft)

Status: **approved** (decisions D1–D8 as recommended; D9 hosting still open). Scaffold in progress.
Stack (decided): **NestJS 12 + PostgreSQL + TypeORM** (same stack as `SSC/server`).

This document is the single source of truth that the Flutter app (`scotland-app`) and the
admin dashboard (`scotland-admin-panel`) will be wired to. It reconciles the enums and models
currently defined separately in those two frontends.

---

## 1. Conventions

| Topic | Decision |
|---|---|
| Base path | `/api/v1` |
| Format | JSON, `camelCase` fields, `snake_case` enum values |
| Auth | `Authorization: Bearer <access JWT>`; short-lived access token + refresh token |
| Money | Integer **minor units** (pence) in fields suffixed `Pence`, currency `GBP` |
| Distance | Integer **metres** (`distanceM`); UI converts to miles |
| Time | ISO 8601 **UTC** strings (`2026-11-24T06:30:00Z`); UI formats for Europe/London |
| IDs | UUID v4 |
| Errors | `{ "statusCode", "error", "message", "details?" }` (NestJS default shape) |
| Pagination | `?page=1&pageSize=20` → `{ data, page, pageSize, total }` |
| Validation | `class-validator` DTOs, `whitelist: true`, `forbidNonWhitelisted: true` |

---

## 2. Canonical enums

These replace the divergent definitions in the app and the dashboard.

### 2.1 Roles and accounts
| Enum | Values | Notes |
|---|---|---|
| `UserRole` | `passenger`, `driver`, `admin` | Stored as `roles[]` per account (D2 approved). A driver profile exists only when `driver` is in `roles`. Switching Passenger ↔ Driver in the app is a mode switch, not a new account. |
| `AccountStatus` | `active`, `pending`, `suspended` | Matches dashboard. |

### 2.2 Rides
| Enum | Values | Replaces |
|---|---|---|
| `RideStatus` | `requested`, `assigned`, `arrived`, `in_progress`, `completed`, `cancelled` | Dashboard `Queued/Dispatched/Active/Completed/Cancelled`; app `searching/assigned/enRoute/arrived/inProgress/completed/cancelled` and `LiveRideStage` |
| `RideType` | `standard`, `emergency`, `roadside` | App `RideType` (see D3 for `scheduled`) |
| `BookingMode` | `now`, `later` | App `BookMode`; replaces "Scheduled" as a *type* |
| `VehicleCategory` | `four_seater`, `six_seater`, `eight_seater`, `wheelchair` | App `VehicleCategory` |
| `DispatchPriority` | `normal`, `high`, `sos` | Dashboard `DispatchJob.priority` |

**Status mapping for the dashboard:**
- `Queued` → `requested`
- `Dispatched` → `assigned`
- `Active` → `arrived` or `in_progress` (shown separately)
- `Completed` / `Cancelled` → unchanged

### 2.3 Drivers
| Enum | Values | Notes |
|---|---|---|
| `DriverOnlineStatus` | `offline`, `online`, `on_trip` | Dashboard `Online/Offline/On trip`. `on_trip` is derived from an active ride, not set manually. |
| `DriverDocumentType` | `licence`, `council_licence`, `council_plate`, `insurance`, `v5c` | App `requiredDriverDocs` ids (`council_plate` is the vehicle plate document). |
| `DriverDocumentStatus` | `missing`, `pending`, `verified`, `expired` | Merges app (`missing/pending/verified`) and dashboard (`Verified/Pending/Expired`). |

### 2.4 Payments
| Enum | Values |
|---|---|
| `PaymentStatus` | `pending`, `paid`, `failed`, `refunded` |

### 2.5 Alerts and chat
| Enum | Values |
|---|---|
| `AlertType` | `ride`, `scheduled`, `promo`, `document`, `system`, `sos` |
| `ChatSenderType` | `passenger`, `driver`, `system` |

---

## 3. Entities (PostgreSQL tables)

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, email (unique, lowercase), phone, name, password_hash, role, status, created_at | Passwords hashed with argon2 or bcrypt. |
| `driver_profiles` | user_id (PK/FK), licence_number, operating_zone, rating_avg, rides_count, online_status | 1:1 with `users` where role = driver. |
| `vehicles` | id, driver_id, make_model, plate (unique), category, created_at | Dashboard shows plate per driver; one active vehicle per driver for v1. |
| `driver_documents` | id, driver_id, type, status, file_key, expires_at, reviewed_by, reviewed_at | `file_key` points to object storage, never a public URL. |
| `places` | id, title, address, postcode, lat, lng, kind | Seed from `mock_repository.dart` places. Saved places per user later. |
| `rides` | id, passenger_id, driver_id (nullable), status, ride_type, booking_mode, vehicle_category, pickup_place, drop_place, pickup_lat/lng, drop_lat/lng, scheduled_at (nullable, timestamptz), fare_estimate_pence, fare_final_pence (nullable), distance_m, created_at, assigned_at, arrived_at, started_at, completed_at, cancelled_at, cancel_reason | Money and times stored as real types. |
| `ride_stops` | id, ride_id, order, address, lat, lng | Optional intermediate stop. |
| `ride_offers` | id, ride_id, driver_id, sent_at, expires_at, response (`accepted`/`rejected`/`expired`), responded_at | Dispatch offers; supports "first accept wins". |
| `driver_locations` | driver_id (PK), lat, lng, heading, updated_at | Latest position only. History is a later decision. |
| `payments` | id, ride_id (unique), amount_pence, status, method, reference, created_at, updated_at | Records only in v1; no payment gateway yet (D5). |
| `ride_ratings` | id, ride_id (unique), rated_by (passenger/driver), score (1–5), comment | |
| `chat_threads` | id, ride_id (unique) | One thread per ride. Replaces app `c-<rideId>` mock threads. |
| `chat_messages` | id, thread_id, sender_type, sender_id, body, created_at, read_at | |
| `alerts` | id, user_id, type, title, body, read_at, created_at | |
| `blocks` | id, driver_id, passenger_id, created_at | Driver blocks passenger (app `blockClient`). |
| `pricing_rules` | id, vehicle_category, base_fare_pence, per_mile_pence, minimum_fare_pence, later_booking_surcharge_bp, effective_from | Editable from admin Pricing page. |
| `audit_log` | id, actor_id, action, entity, entity_id, payload, created_at | Every admin write. |

Indexes to plan up front: `rides(status, created_at)`, `rides(driver_id, status)`,
`ride_offers(ride_id)`, `driver_locations` (geo index later), `chat_messages(thread_id, created_at)`.

---

## 4. Ride lifecycle

```
requested ──accept(driver)──► assigned ──arrive(driver)──► arrived ──start(driver)──► in_progress ──complete(driver)──► completed
    │                            │                            │
    └──────────── cancel (passenger/admin/driver, allowed states only) ───────────────► cancelled
```

Rules:
- Only the **assigned driver** can call `arrive`, `start`, `complete`.
- `in_progress → completed` writes `fare_final_pence` and creates a `payments` row with `pending`.
- Passenger may cancel while `requested` or `assigned`. After `arrived`, cancel is admin-only.
- Each transition writes an `audit_log` row and emits a realtime event (§6).

---

## 5. REST endpoints (v1)

### 5.1 Auth
| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/register/passenger` | public | name, email, phone, password, acceptedTerms |
| POST | `/auth/register/driver` | public | as passenger + vehicle make/model, plate, operatingZone, licenceNumber |
| POST | `/auth/login` | public | email + password, returns access + refresh tokens and user |
| POST | `/auth/refresh` | public | rotate refresh token |
| POST | `/auth/logout` | auth | revoke refresh token |
| GET | `/auth/me` | auth | current user + role + profile |

### 5.2 Passenger
| Method | Path | Purpose |
|---|---|---|
| GET | `/places/search?q=` | address / postcode / landmark search (provider: D6) |
| POST | `/rides/estimate` | pickup, drop, stops, rideType, vehicleCategory, bookingMode, scheduledAt → fare estimate |
| POST | `/rides` | book a ride (now or later) |
| GET | `/rides?role=passenger` | own trips, filter by status |
| GET | `/rides/:id` | ride detail (passenger or assigned driver only) |
| POST | `/rides/:id/cancel` | cancel with reason |
| POST | `/rides/:id/rating` | rate driver after completion |
| GET | `/me/alerts`, POST `/me/alerts/read` | notifications |

### 5.3 Driver
| Method | Path | Purpose |
|---|---|---|
| GET/PATCH | `/drivers/me` | profile, vehicle, operating zone |
| PUT | `/drivers/me/status` | `online` / `offline` (rejected unless documents are verified) |
| POST | `/drivers/me/location` | periodic GPS ping (lat, lng, heading) |
| GET | `/drivers/me/documents` | list the five required types and status |
| POST | `/drivers/me/documents/:type` | upload file (multipart), status → `pending` |
| GET | `/drivers/me/offers` | current offer, if any |
| POST | `/rides/:id/accept` | accept offer (first accept wins; others get 409) |
| POST | `/rides/:id/reject` | reject offer |
| POST | `/rides/:id/arrive` | driver at pickup |
| POST | `/rides/:id/start` | passenger on board |
| POST | `/rides/:id/complete` | drop-off done, final fare |
| GET | `/drivers/me/earnings?from=&to=` | totals by day |
| POST | `/drivers/me/blocks` | block a passenger |

### 5.4 Chat (passenger or assigned driver)
| Method | Path | Purpose |
|---|---|---|
| GET | `/rides/:id/messages?cursor=` | history |
| POST | `/rides/:id/messages` | send `{ body }` |

### 5.5 Admin (role = admin only)
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/users?role=&status=&q=` | All users |
| PATCH | `/admin/users/:id/status` | active / pending / suspended |
| GET | `/admin/drivers` | drivers with online status, docs summary, zone |
| PATCH | `/admin/drivers/:id/documents/:type` | verify / expire / reject a document |
| GET | `/admin/rides?status=&q=` | rides |
| GET | `/admin/dispatch/queue` | unassigned requested rides, with priority and wait time |
| POST | `/admin/rides/:id/assign` | `{ driverId }` manual assignment |
| GET | `/admin/payments` | payments |
| PATCH | `/admin/payments/:id` | mark paid / failed / refunded |
| GET/PUT | `/admin/pricing` | pricing rules per vehicle category |
| GET | `/admin/reports/summary?from=&to=` | KPIs for Overview and Reports |
| GET | `/admin/activity` | recent audit entries |

---

## 6. Realtime (WebSocket gateway, namespace `/realtime`)

Auth: JWT in the handshake. Rooms per user (`user:<id>`) and per ride (`ride:<id>`).

| Event | Direction | Payload (summary) |
|---|---|---|
| `ride.offer` | server → driver | rideId, pickup, drop, rideType, fareEstimatePence, distanceM, expiresAt |
| `ride.status` | server → passenger + driver | rideId, status, timestamps |
| `driver.location` | server → passenger (ride room) | driverId, lat, lng, heading, etaSeconds |
| `chat.message` | server → both parties | threadId, message |
| `alert.new` | server → user | alert |

---

## 7. Pricing (placeholder values — confirm with client)

Values taken from the app's `fareEstimate` logic, to be replaced with real rules:

| Vehicle category | Base fare |
|---|---|
| four_seater | £17.70 |
| six_seater | £22.50 |
| eight_seater | £28.00 |
| wheelchair | £24.00 |

- Estimate with no full route: 55% of base.
- Later booking: +5% surcharge.
- Real pricing will need per-mile and per-minute rates (`pricing_rules`), not flat bases.

---

## 8. Known problems in the frontends (to fix as we go)

1. Admin dashboard has **no authentication** — blocks any real deployment.
2. App holds **plain-text demo passwords** (`app_state.dart:18-52`) — backend hashes; client stops storing credentials.
3. Scheduled times are **display strings** (`"Tomorrow 06:30"`) — replaced by `scheduled_at` timestamps.
4. Money is `double` in both frontends — replaced by integer pence.
5. Mock seed data disagree (e.g. driver `ayaz` shows Toyota Prius in the app, Ford Focus in the dashboard; document status differs). Seed for the backend should be a single file.
6. Google Maps key ships in the app binary — restrict by package/bundle id and SHA-1.
7. Passenger booking is pushed into the driver queue in-process — real dispatch must be server-side.

---

## 9. Decisions

Approved as recommended on 2026-11-23, except D9 which has no answer yet. D2 is implemented as `roles[]`.

| # | Question | Decision |
|---|---|---|
| D1 | ORM | **TypeORM** (matches `SSC/server`). Prisma is the alternative. |
| D2 | Can one account be both passenger and driver? The app lets users switch mode, but the data model has one role. | Two roles on one account is simpler for the user: `roles[]`, with driver profile optional. Or keep separate accounts. |
| D3 | `scheduled` as a ride type or only a booking mode? | **Booking mode only** (`now` / `later`). |
| D4 | Dispatch: how many drivers get each offer, and how long before it expires? | Offer to the 3 nearest online drivers in the zone, 20 s expiry, first accept wins. |
| D5 | Payments: records only, or a gateway (Stripe, etc.) in v1? | **Records only** in v1; gateway later. |
| D6 | Address search and geocoding provider | Google Places/Geocoding server-side (key stays on backend). |
| D7 | Object storage for driver documents | S3-compatible bucket, private, signed URLs for admin viewing. |
| D8 | Login method | Email + password for v1 (matches app). Phone OTP later. |
| D9 | Hosting | Your AWS or the existing cPanel/Server 2? Postgres on the same host or managed. |

---

## 10. Proposed next steps (after this contract is approved)

1. Scaffold the NestJS project in `scotland-backend/` (config, TypeORM, health check, Swagger at `/api/docs`).
2. Entities + first migration from §3; seed script built from the mock data.
3. Auth module (§5.1) with role guards.
4. Users, drivers, documents (§5.3, §5.5 partial).
5. Rides, estimate, offers, lifecycle (§4, §5.2, §5.3).
6. Realtime gateway (§6) and chat (§5.4).
7. Admin endpoints (§5.5) and pricing.
8. Switch the admin dashboard from `store.tsx` mocks to the API, then the Flutter app from `MockRepository` / `AppState`.
9. Tests and deployment.
