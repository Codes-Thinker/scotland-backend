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
- [ ] Auth and role guards (contract §5.1)
- [ ] Users, drivers, documents
- [ ] Rides, offers, lifecycle
- [ ] Realtime gateway and chat
- [ ] Admin endpoints and pricing

Secrets: never commit `.env`. `.gitignore` already excludes it.
