# Snooker Club Booking System

Booking and club-management software for a single snooker club. Customers browse live
availability and book a table; staff run the club's day from an admin area.

Single-club by design: no tenant ids, no tenant middleware, no platform admins. Anything
a club would want to change — opening hours, prices, booking rules, the tables
themselves — lives in the database rather than in code.

**Status: Phases 0–2 complete.** Customers can register, sign in, browse live
availability, and book a table with payment via Stripe Checkout. Cancellation, the
customer dashboard and the admin area are specified but not yet built (see
[Roadmap](#roadmap)).

---

## Architecture

```
frontend/                      backend/                        PostgreSQL 17
Vite + React 19 + TS 7    ->   Spring Boot 4.1 (Java 21)   ->   Flyway-managed schema
TanStack Query                 domain-oriented packages         booking_no_overlap
Tailwind 4                     Hibernate (validate only)        EXCLUDE constraint
     |                              ^
     +---- /api via Vite proxy -----+
```

Two separate applications with a REST boundary. The frontend never decides anything
authoritative: availability, prices, and whether a booking or cancellation is permitted
are all computed by the backend.

### Key decisions

**No double bookings, guaranteed by the database.** A PostgreSQL `EXCLUDE USING gist`
constraint over `(table_id, tstzrange(start_at, end_at, '[)'))` makes an overlapping pair
unstorable. "Check then insert" in application code is a race by construction; a
constraint cannot be raced. Verified: two concurrent overlapping transactions leave
exactly one booking, with no application locking, no `SERIALIZABLE`, and no retry loop.

Half-open `'[)'` bounds mean 14:00–15:00 and 15:00–16:00 do not conflict. Application
overlap queries use matching strict comparisons (`start < other.end AND end >
other.start`) — using `<=`/`>=` would disagree with the database about abutting bookings.

The constraint predicate is partial on slot-occupying statuses, so cancelling releases
the slot automatically. It cannot test hold expiry (index predicates must be `IMMUTABLE`,
and `now()` is not), so expired holds are handled by a sweeper plus lazy expiry on the
read and write paths.

**The JVM runs in UTC.** Not hygiene — load-bearing. Instants are stored as `timestamptz`
with `hibernate.jdbc.time_zone=UTC`, and that setting also shifts plain `TIME` columns by
the JVM's offset. Under BST it read opening hours of 10:00–23:00 back as 11:00–00:00,
collapsing the window and reporting the club closed all summer. Enforced in both
`bootRun` and `test`, with a regression test.

**Wall-clock versus instants.** Bookings are instants (a table is occupied from one
moment to another). Opening hours are wall-clock rules (the club opens at 10:00 whatever
the offset). `ClubClock` is the only place that converts between them. Slot grids step
*instants*, never local times, so a 25-hour October day keeps all its slots.

**Money is integer pence.** No floats, no `BigDecimal`. Prices are computed server-side
and a price in a request body is ignored.

**Sessions, not JWTs.** There is no cross-domain client, no mobile app and no third-party
API consumer, so every argument for a bearer token is absent while its costs (unrevocable
tokens, refresh rotation, an XSS-exfiltratable credential in `localStorage`) all apply.
Sessions live in the Postgres already being run. `SameSite=Lax`, not `Strict` — `Strict`
withholds the cookie on the top-level redirect back from Stripe and lands the user
signed out.

**The slot is held before Stripe is called.** Taking money for an unreserved slot
guarantees eventually selling one that is already gone, then owing a refund and an
apology. Holding first means the worst case is an unused hold that expires by itself. The
Stripe call also happens outside the database transaction: an HTTP round trip inside one
holds a connection open, and a slow provider becomes pool exhaustion.

**Confirmation is idempotent from both directions.** The webhook and the customer's
browser return arrive in an unpredictable order, and either may not arrive at all. Both
call the same guarded update (`WHERE status = 'PENDING_PAYMENT'`), so whichever is second
updates zero rows instead of double-confirming. Only `checkout.session.completed` confirms
a booking — also handling `payment_intent.succeeded` is the classic double-confirmation
bug, since Stripe sends both.

**Expired holds are swept, never deleted.** The constraint predicate cannot test hold
expiry (index predicates must be `IMMUTABLE`, and `now()` is not), so a lapsed hold keeps
blocking its slot until a row update. Three layers cover it: availability treats a lapsed
hold as free, booking creation expires conflicting holds in-transaction, and a sweeper
handles the rest. A deleted booking could not be reinstated when a late payment arrives —
which is reachable, because Stripe's minimum session expiry (30 min) outlives the hold
(15 min).

---

## Prerequisites

- Java 21 (a newer JDK on `PATH` is fine — Gradle pins the toolchain to 21)
- Node 22+ and Yarn 4 (via Corepack)
- Docker with Compose v2+, **or** a local PostgreSQL 16+

---

## Local setup

### 1. Database

```bash
docker compose up -d
```

Postgres listens on **5433**, not 5432, to avoid colliding with a host PostgreSQL.

> **Note:** on the machine this was developed on, Docker's internal disk was full and
> `initdb` failed with "no space left on device". If `docker compose up` fails that way,
> reclaim space (`docker system prune`, and prune volumes if you can afford to) or use a
> local PostgreSQL instead:
>
> ```bash
> createdb snooker && psql -d snooker -c "CREATE ROLE snooker LOGIN PASSWORD 'snooker' SUPERUSER"
> ```
>
> then point `DATABASE_URL` at it (see below). `CREATE EXTENSION btree_gist` needs
> elevated rights, which is why the dev role is a superuser.

### 2. Environment

```bash
cp .env.example .env
```

Defaults match Compose, so nothing needs editing for Phases 0–1. Stripe keys are only
required from Phase 6.

### 3. Backend

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=dev'
```

Serves <http://localhost:8080>. Flyway applies `V1`–`V11` and, under the `dev` profile
only, the seed data. To target a database other than the Compose one:

```bash
DATABASE_URL=jdbc:postgresql://localhost:5432/snooker_dev \
DATABASE_USERNAME=snooker DATABASE_PASSWORD=snooker \
./gradlew bootRun --args='--spring.profiles.active=dev'
```

### 4. Frontend

```bash
cd frontend
yarn
yarn dev
```

Serves <http://localhost:5173> and proxies `/api` to the backend, so the browser sees a
single origin and cookies behave in dev exactly as in production.

Open <http://localhost:5173/book>.

### Dev credentials

Seeded by the `dev` profile only. **Local development only.**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@snookerclub.test` | `Admin123!` |
| Customer | `customer@snookerclub.test` | `Customer123!` |

The seed also creates 6 tables, a maintenance block tomorrow 14:00–18:00 on Pool 2, and
a couple of demo bookings, so the grid demonstrates every state on first run.

---

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Compose database | `snooker` |
| `POSTGRES_PORT` | Host port for Compose Postgres | `5433` |
| `DATABASE_URL` | Backend JDBC URL | `jdbc:postgresql://localhost:5433/snooker` |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | Backend credentials | `snooker` |
| `APP_BASE_URL` | SPA origin, for redirects | `http://localhost:5173` |
| `APP_CORS_ALLOWED_ORIGINS` | Permitted CORS origins | `http://localhost:5173` |
| `STRIPE_SECRET_KEY` | Stripe test secret (Phase 6) | — |
| `STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key (Phase 6) | — |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen` (Phase 6) | — |

Never commit `.env`. Use Stripe **test** keys only.

---

## Running tests

```bash
cd backend  && ./gradlew test        # JUnit 5 + Mockito
cd frontend && yarn test             # Vitest + React Testing Library
cd frontend && yarn typecheck        # strict TypeScript, no emit
```

Backend tests run in UTC. Integration tests will use Testcontainers with
`postgres:17-alpine` — **H2 cannot express `EXCLUDE USING gist`**, so an H2-based suite
would give zero coverage of the system's core invariant.

Playwright arrives in Phase 7:

```bash
cd frontend && yarn playwright install && yarn e2e
```

---

## Database migrations

Flyway owns the schema. Hibernate is `ddl-auto: validate` in every profile — it verifies
entities match the schema and never mutates it.

| Migration | Contents |
|---|---|
| `V1` | `btree_gist`, `pgcrypto`, `citext` (isolated so a permissions failure is obvious) |
| `V2`–`V3` | Users, password reset tokens |
| `V4`–`V6` | Club settings, opening hours, booking settings, pricing rules |
| `V7` | Tables |
| `V8` | Bookings **+ the `booking_no_overlap` EXCLUDE constraint** |
| `V9` | Maintenance blocks (+ their own EXCLUDE) |
| `V10` | Payments, webhook event log, payment exceptions |
| `V11` | Spring Session DDL, copied verbatim from the jar |

`db/seed/R__dev_seed.sql` is idempotent and loaded by the `dev` profile only; production
loads `db/migration` alone.

Adding a migration: create `V12__description.sql`, restart the backend, and update the
matching JPA entity — `validate` will fail the boot if they disagree.

---

## API

Implemented:

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/health` | Public | `{status, db}` |
| `GET` | `/api/club` | Public | Identity, opening hours, "from" rate |
| `GET` | `/api/availability` | Public | `?date=&durationMinutes=&tableId=` |
| `POST` | `/api/auth/register` | Public | Always creates a CUSTOMER |
| `POST` | `/api/auth/login` | Public | Establishes the session |
| `POST` | `/api/auth/logout` | Public | Idempotent, `204` |
| `GET` | `/api/auth/me` | Public | The user, or `204` when anonymous |
| `POST` | `/api/bookings` | Customer | Holds the slot, returns `checkoutUrl` |
| `GET` | `/api/bookings` | Customer | The caller's own bookings |
| `GET` | `/api/bookings/{reference}` | Customer | 404 (not 403) for someone else's |
| `POST` | `/api/bookings/{reference}/checkout` | Customer | New session after a decline |
| `POST` | `/api/webhooks/stripe` | Public | HMAC-verified; CSRF-exempt |

Browsing availability deliberately needs no account — it is the conversion path.

The availability response is shaped so the grid renders with no further computation and
no further requests. The time axis and the server-computed duration options are sent once
at the top level, and each slot carries **two distinct booleans**:

- `available` — is this cell unoccupied? Drives the visual heat-map.
- `bookableForRequestedDuration` — can a booking of the requested length *start* here?
  Drives which cells are clickable.

They differ: a 22:30 cell in a club closing at 23:00 is available but cannot start a
90-minute booking. Conflating them is the classic bug in this kind of grid.

When unavailable, `reason` is one of `BOOKED`, `MAINTENANCE`, `TABLE_INACTIVE`,
`CLUB_CLOSED`, `PAST`, `INSUFFICIENT_NOTICE`, `TOO_FAR_IN_ADVANCE`,
`INSUFFICIENT_REMAINING_TIME`, so the grid can explain itself rather than showing an
unexplained grey cell.

Errors use one envelope and never include a stack trace:

```json
{ "code": "SLOT_UNAVAILABLE", "message": "…", "fieldErrors": {}, "traceId": "a085a4fe" }
```

`400` malformed · `422` business rule · `409` race conflict · `401`/`403` auth.

---

## Design system

The whole visual language lives in `frontend/src/index.css`, as Tailwind v4 `@theme`
tokens. Pages compose those tokens; they do not define colours of their own.

| Token family | Purpose |
|---|---|
| `felt-50…950` | Snooker baize. Every brand moment, plus the dark surfaces. |
| `brass-200…500` | The single accent — headline figures and trim on dark panels. |
| `ink-50…900` | Neutrals, very slightly green so nothing looks borrowed. |
| `shadow-card` / `shadow-lifted` | Wide, soft elevation. Diffuse reads as depth. |
| `rounded-card` | One card radius everywhere. |

Three rules keep it coherent as the admin screens arrive in later phases:

1. **Rose and amber stay Tailwind defaults.** Error and warning should look like error and
   warning on any site, not like part of the brand.
2. **Focus is defined once**, as a global `:focus-visible` rule, rather than per component.
   Component-level focus styling is how a control ships with no visible ring at all.
3. **Text sits on a token background.** A section that sets a colour but not a surface
   inherits whatever is behind it, which is how "unreadable in dark mode" starts.

The club's name, address, opening hours and headline rate are read from `/api/club` and
rendered by the header, footer and home page. Nothing about the club is hardcoded in JSX:
a page asserting "open until 11pm" would go stale the moment an admin edits the hours, and
would do so silently.

---

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 0 | Project foundation, Compose, health check | **Done** |
| 1 | Schema, settings, pricing, availability engine + grid | **Done** |
| 2 | Auth, booking creation, Stripe Checkout, webhooks, hold sweeper | **Done** |
| 3 | Customer dashboard, cancellation, password reset | Planned |
| 4 | Admin dashboard, booking management, authz boundary | Planned |
| 5 | Telephone bookings, table CRUD, maintenance blocks | Planned |
| 6 | Settings screens | Planned |
| 7 | Playwright, accessibility, security review | Planned |

Payments will use Stripe Checkout with a `PENDING_PAYMENT` hold: the booking is created
and its slot reserved *before* Stripe is called (taking money for an unreserved slot
guarantees double-selling), confirmation is idempotent from both the webhook and the
browser return, and a sweeper releases abandoned holds.

Deliberately out of scope: cafe/bar POS, memberships, leagues, recurring bookings,
reminders, promo codes, analytics, and multi-tenancy. No abstractions have been built for
them.
