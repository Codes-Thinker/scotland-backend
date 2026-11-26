# Scotland Ride App — Live Backend Handoff

**Audience:** Backend / DevOps developer who will take this API **live** (AWS or similar).  
**Repos:** `scotland-backend` (NestJS 12 + PostgreSQL + TypeORM + Socket.IO)  
**Related apps:**
- Flutter: `scotland-app` → API base `/api/v1`
- Admin: `scotland-admin-panel` → `NEXT_PUBLIC_API_URL`

This document is the **single source of truth** for what already works locally, what must be done for production, and how to verify.

---

## 1. Current status (clear)

| Area | Status | Notes |
|------|--------|--------|
| Auth (register / login / refresh / logout / me) | ✅ Done | JWT + refresh rotation |
| Passenger booking + estimate | ✅ Done | Distance is approx (straight-line × 1.3) until real routing |
| Driver online / location / offers / accept | ✅ Done | Dispatch to nearest drivers |
| Ride lifecycle (arrive → start → complete / cancel / rate) | ✅ Done | |
| Realtime Socket.IO `/realtime` | ✅ Done | `ride.offer`, `ride.status`, `chat.message`, `alert.new`, `ready` |
| Ride chat | ✅ Done | Opens when driver assigned |
| Alerts | ✅ Done | List + mark read |
| Driver documents + admin review | ✅ Done | Local disk in dev; **S3 required in production** |
| Driver earnings (gross) | ✅ Done | Commission / payouts **not** modelled |
| Payments (admin status transitions) | ✅ Backend done | Flutter payments UI still **mock** |
| Pricing + admin reports | ✅ Done | |
| Production AWS deploy | ❌ Todo (your job) | Not live yet |
| Real Google / map routing for fare distance | ❌ Todo (optional) | Decision D6 |

**Bottom line:** Backend is **functionally complete for local end-to-end testing**. Your job is to **host it live** (server + Postgres + env + HTTPS + S3) and hand the public API URL to mobile/admin.

---

## 2. What you must deliver (live)

1. **Public HTTPS API**  
   Example: `https://api.<domain>/api/v1`
2. **PostgreSQL** (managed RDS recommended) with migrations applied  
3. **Socket.IO** reachable at `https://api.<domain>/realtime` (same host, WebSocket/polling OK)  
4. **S3** private bucket for driver documents (`STORAGE_DRIVER=s3`)  
5. **CORS** allowing admin origin(s) and any web tools you use  
6. **Env secrets** set securely (never commit `.env`)  
7. Share with mobile team:
   - `API_BASE_URL` (e.g. `https://api.<domain>/api/v1`)
   - Confirm realtime URL (derived: strip `/api/v1` → `/realtime`)

---

## 3. Repos & local proof (already working)

```text
scotland-backend   → Nest API (this repo)
scotland-app       → Flutter passenger + driver (wired to API)
scotland-admin-panel
```

### Local run (dev machine)

```bash
cd backend
cp .env.example .env   # fill DB + JWT (min 32 chars)
npm install
# Postgres must exist: DB_NAME (e.g. fnt_dev), user from .env
npm run migration:run
npm run seed           # demo data (dev only)
npm run start:dev      # http://localhost:3000
```

- Health: `GET http://localhost:3000/health`
- Swagger: `http://localhost:3000/docs` (disabled / not served in production by design)
- API prefix: `/api/v1`

### Demo accounts (seed password default `DemoPass123`)

| Role | Email |
|------|--------|
| Passenger | `smith@demo.local` |
| Driver | `driver@demo.local` |
| Admin | `ops@demo.local` |

Reset seed (dev only): `SEED_RESET=true npm run seed`

### Optional Docker Postgres

```bash
docker compose up -d
# then set DB_HOST=localhost DB_PORT=5432 DB_USERNAME=fnt_app
# DB_PASSWORD=fnt_local_dev DB_NAME=fnt_dev
```

---

## 4. Production environment checklist

Copy from `.env.example` and set **production** values. App **refuses to start** in production unless safety rules pass (see `README.md`).

### Required

| Variable | Production expectation |
|----------|------------------------|
| `NODE_ENV` | `production` |
| `PORT` | e.g. `3000` (behind reverse proxy) |
| `API_PREFIX` | `api/v1` |
| `CORS_ORIGINS` | Comma-separated admin (and any web) origins |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | Live Postgres |
| `DB_SSL` | `true` |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` (default) |
| `DB_SYNCHRONIZE` | `false` (migrations only) |
| `JWT_ACCESS_SECRET` | ≥ 32 random chars (strong secret) |
| `JWT_ACCESS_TTL` | e.g. `15m` |
| `JWT_REFRESH_TTL_DAYS` | e.g. `30` |
| `STORAGE_DRIVER` | **`s3`** (mandatory in production) |
| `S3_BUCKET` | Private bucket name |
| `AWS_REGION` | e.g. `eu-west-2` |
| `TRUST_PROXY` | Number of reverse proxies (usually `1`) |

### Dispatch (defaults OK unless product asks otherwise)

`DISPATCH_SWEEP_MS`, `DISPATCH_OFFER_SECONDS`, `DISPATCH_RADIUS_KM`, `DISPATCH_MAX_OFFERS`, `DISPATCH_LOCATION_MAX_AGE_SEC`

### Notes

- AWS credentials for S3: use IAM role on EC2/ECS (preferred) or env keys via AWS default chain.
- Run **exactly one** API instance until the dispatch sweeper is moved to a single scheduler (each instance runs its own sweep today).
- Do **not** run `npm run seed` on production with real users unless explicitly requested.

---

## 5. Deploy steps (recommended order)

1. Create AWS account / server (EC2 or container) + security groups (80/443; DB not public).  
2. Provision Postgres (RDS) → create empty database.  
3. Create private S3 bucket + IAM policy for document upload/read.  
4. Clone `scotland-backend`, install Node **≥ 22.22.3**, set production `.env`.  
5. `npm ci` → `npm run build` → `npm run migration:run`.  
6. Process manager: `npm run start:prod` (or PM2 / systemd / ECS).  
7. Nginx/ALB: terminate TLS, proxy `/api/v1` and `/realtime` (WebSocket upgrade headers).  
8. Verify:
   - `GET https://api.<domain>/health` → `database: up`
   - Login via `POST /api/v1/auth/login`
   - Socket connect to `/realtime` with `auth: { token: <accessToken> }`
9. Give mobile team the live `API_BASE_URL`.  
10. Admin: set `NEXT_PUBLIC_API_URL=https://api.<domain>/api/v1` and redeploy admin.

---

## 6. Flutter / Admin wiring (after you go live)

### Flutter (`scotland-app`)

Default local:

- Android emulator: `http://10.0.2.2:3000/api/v1`
- iOS simulator: `http://localhost:3000/api/v1`

Live build override:

```bash
flutter run --dart-define=API_BASE_URL=https://api.<domain>/api/v1
# or release build with the same define
```

Realtime URL is derived automatically (host without `/api/v1` + `/realtime`).

**Already integrated in the app (local tested):** auth, rides, realtime, chat, alerts, earnings.  
**Still mock in the app:** passenger payment methods UI (backend payments admin exists).

### Admin (`scotland-admin-panel`)

```env
NEXT_PUBLIC_API_URL=https://api.<domain>/api/v1
```

---

## 7. Main API surface (for smoke tests)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness + DB |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/register/passenger` | Passenger signup |
| POST | `/api/v1/auth/register/driver` | Driver signup |
| GET | `/api/v1/auth/me` | Current user |
| POST | `/api/v1/rides/estimate` | Fare estimate |
| POST | `/api/v1/rides` | Create ride |
| GET | `/api/v1/rides` | List rides |
| POST | `/api/v1/rides/:id/accept` | Driver accept |
| POST | `/api/v1/rides/:id/arrive` / `start` / `complete` | Lifecycle |
| GET | `/api/v1/drivers/me/offers` | Driver offers |
| PUT | `/api/v1/drivers/me/status` | online/offline |
| POST | `/api/v1/drivers/me/location` | GPS ping |
| GET/POST | `/api/v1/rides/:id/messages` | Chat |
| GET/POST | `/api/v1/me/alerts` (+ `/read`) | Alerts |
| GET | `/api/v1/drivers/me/earnings` | Driver earnings |
| Admin | `/api/v1/admin/*` | Users, drivers, docs, rides, payments, pricing, reports |

Full contract: `docs/API_CONTRACT.md` (if present in repo).

---

## 8. Acceptance checklist (sign-off before calling it “live”)

- [ ] HTTPS health returns `ok` / DB `up`
- [ ] Passenger can register + login from Flutter against live URL
- [ ] Driver can go online, receive offer (REST and/or socket `ride.offer`), accept ride
- [ ] Passenger sees status updates (`ride.status` / poll)
- [ ] Chat messages send/receive on assigned ride
- [ ] Alerts appear for status changes
- [ ] Driver document upload lands in **S3**
- [ ] Admin can login and see users/rides
- [ ] CORS OK for admin origin
- [ ] No Swagger exposed publicly (or locked down) in production
- [ ] Backups enabled on Postgres
- [ ] Mobile release build uses live `API_BASE_URL`

---

## 9. Known gaps (do not block go-live unless product requires)

1. Fare distance is approximate until real routing is plugged in.  
2. Commission / driver payouts not in schema yet (earnings = gross fares).  
3. Flutter payment-method screens are still mock; admin payment status APIs exist.  
4. Multi-instance deploy needs a single dispatch sweeper owner.

---

## 10. Contact / handoff fields (fill when live)

| Item | Value |
|------|--------|
| Public API base | `_https://api.___/api/v1_` |
| Realtime | `_wss/https host_/realtime` |
| Region | `_e.g. eu-west-2_` |
| DB | `_RDS endpoint (private)_` |
| S3 bucket | `_name_` |
| Deployed by | `________________` |
| Date live | `________________` |

---

**Owner note:** Mobile integration and local backend verification are done. **Making the backend live on AWS (or any host) is the remaining backend developer task** described above.
