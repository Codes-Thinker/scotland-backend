# Fife Nearby Taxis — Backend

NestJS 12 + PostgreSQL + TypeORM. The API contract is in [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

The Flutter app (`../scotland-app`) and admin dashboard (`../scotland-admin-panel`) still use local mock data. They will be switched to this API in a later step.

## Setup

1. Install Node 22.22.3 or newer (Nest 12 requires it).
2. `npm install`
3. Copy `.env.example` to `.env` and fill in the database values.
4. Make sure PostgreSQL is running and the database in `DB_NAME` exists.

## Database

```powershell
npm run migration:run     # apply schema
npm run seed               # demo data (dev only; refuses if users exist)
$env:SEED_RESET="true"; npm run seed   # wipe and reseed (dev only)
```

Demo accounts use password from `SEED_DEMO_PASSWORD` (default `DemoPass123`), local only.

## Tests

```powershell
npm test               # unit tests
npm run test:e2e       # end-to-end, against database fnt_test (must exist; never dev)
```

Create the test database once: `CREATE DATABASE fnt_test OWNER fnt_app;`

## Run

```powershell
npm run start:dev      # watch mode
npm run build          # compile to dist/
npm run start:prod     # run compiled build
npm test               # unit tests (vitest)
npm run lint
```

- Health check: `GET /health` (returns 503 if the database is unreachable)
- Swagger UI: `http://localhost:3000/docs` (not served in production)
- API base path: `/api/v1`

## Status

- [x] Project scaffold, config validation (Joi), TypeORM wiring, Swagger, health check
- [x] Entities (17 tables, contract §3), first migration, demo seed
- [ ] Live verification against a production-grade database
- [x] Auth: register (passenger, driver), login, refresh rotation with reuse detection, logout, me; global JWT guard; roles guard; login rate limit (contract §5.1)
- [x] Drivers: profile, vehicle, online status (gated on approval and five valid documents), location, documents (magic-byte checked), blocks
- [x] Admin: user list and status, driver list and detail, document review (rejecting takes a driver offline; all decisions audited)
- [ ] Local object storage is dev-only; production needs a private S3-compatible bucket (decision D7)
- [x] Rides: estimate (road distance estimated from coordinates), booking, dispatch to up to 3 nearest eligible drivers with 20 s offers, first accept wins, sweep for expiry and retries, assigned/arrived/in progress/completed, cancel, rating, admin queue and assign
- [ ] Ride distance is straight line times 1.3 until real routing (decision D6)
- [x] Realtime gateway (Socket.IO at /realtime, JWT on connect, per-user rooms only): ride.offer, ride.status, driver.location, chat.message, alert.new, ready
- [x] Ride chat (opens on assignment, closes on completion or cancellation; cursor paging) and alerts (list, mark read)
- [x] Payments: admin list and allowed status transitions (pending to paid or failed, failed to paid, paid to refunded), all audited
- [x] Pricing: admin view and replace per ride type; old rules kept in history
- [x] Reports: summary with daily breakdown (UK days, max 366-day range), recent admin activity, driver gross earnings
- [ ] Commission and driver payouts are not modelled yet; earnings are gross customer fares

Secrets: never commit `.env`. `.gitignore` already excludes it.
