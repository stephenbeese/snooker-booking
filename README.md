# Snooker Club Booking System

Booking and club-management software for a single snooker club. Customers browse live
availability and book a table; staff run the club's day from an admin area.

Single-club by design: no tenant ids, no tenant middleware, no platform admins. Anything
a club would want to change — opening hours, prices, booking rules, the tables
themselves — lives in the database rather than in code.

**Status: Phases 0–3 complete.** Customers can register, sign in, browse live
availability, book a table with payment via Stripe Checkout, manage their bookings and
cancel them, edit their profile and reset a forgotten password. The admin area is
specified but not yet built (see [Roadmap](#roadmap)).

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

Database defaults match Compose, so they need no editing. **The three Stripe keys are
required to start the backend at all** — `StripeProperties` rejects a blank value at
startup rather than letting the app fail at a customer's checkout. Placeholders are
enough to boot and to use every non-payment feature; real test keys are only needed to
actually reach Checkout.

### 3. Backend

```bash
./run-backend.sh
```

Gradle has no dotenv support, so `.env` is **not** read automatically — the script
exports it first, then runs `bootRun` with the `dev` profile. Running `./gradlew bootRun`
directly from `backend/` works only if the variables are already in your shell.

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
| Customer | `ronnie@snookerclub.test` | `Customer123!` |

The seed also creates 6 tables, a maintenance block tomorrow 14:00–18:00 on Pool 2, and
a couple of demo bookings, so the grid demonstrates every state on first run.

If a seeded login is rejected, the password was probably changed in *your* database by
earlier testing. The seed is `ON CONFLICT DO NOTHING`, so it never restores the original
hash. Compare against the seed and reset just that row:

```bash
psql -h localhost -p 5433 -U snooker -d snooker -c "UPDATE app_user SET password_hash='\$2a\$12\$iwawPf4TEAo6wCZolJnPvuUB3KlLXgo/iRr7ENRSLnlDZQOOtyCYW' WHERE email='customer@snookerclub.test'"
```

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
| `STRIPE_SECRET_KEY` | Stripe test secret. **Required at startup** | — |
| `STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key. **Required at startup** | — |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen`. **Required at startup** | — |

Never commit `.env`. Use Stripe **test** keys only — `run-backend.sh` refuses to start
on an `sk_live_` key.

`STRIPE_PUBLISHABLE_KEY` is currently validated but never used: Checkout is a redirect,
so the browser never initialises Stripe.js. It stays required so the variable is in
place for a future embedded-payment form.

The guard also rejects an **unresolved placeholder**. An unset environment variable does
not reach Spring as `null` or `""` — the value becomes the literal
`${STRIPE_WEBHOOK_SECRET}`, which is not blank. Before this was fixed the app booted with
no webhook secret and the webhook endpoint verified signatures against that string.
Covered by `StripePropertiesTest`.

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
| `POST` | `/api/auth/forgot-password` | Public | Always `202` — see below |
| `POST` | `/api/auth/reset-password` | Public | Single-use token; ends every session |
| `GET` | `/api/profile` | Customer | The caller's own account |
| `PUT` | `/api/profile` | Customer | Name and phone; email is not editable |
| `POST` | `/api/profile/password` | Customer | Requires the current password |
| `POST` | `/api/bookings` | Customer | Holds the slot, returns `checkoutUrl` |
| `GET` | `/api/bookings` | Customer | The caller's own bookings |
| `GET` | `/api/bookings/{reference}` | Customer | 404 (not 403) for someone else's |
| `POST` | `/api/bookings/{reference}/cancel` | Customer | Releases the slot |
| `POST` | `/api/bookings/{reference}/checkout` | Customer | New session after a decline |
| `GET` | `/api/tables` | Public | Active tables; staff also see inactive ones |
| `GET` | `/api/admin/dashboard` | Admin | Today's counts and committed takings |
| `GET` | `/api/admin/bookings` | Admin | `?status=&from=&to=&tableId=&search=&page=&size=` |
| `GET` | `/api/admin/bookings/day` | Admin | `?date=` — one day, in start order |
| `GET` | `/api/admin/bookings/{reference}` | Admin | Includes customer contact details |
| `POST` | `/api/admin/bookings/{reference}/cancel` | Admin | Bypasses the notice period only |
| `POST` | `/api/webhooks/stripe` | Public | HMAC-verified; CSRF-exempt |

Browsing availability deliberately needs no account — it is the conversion path.

### The admin boundary

Every `/api/admin/**` path requires the ADMIN role, enforced by one matcher in
`SecurityConfig` ahead of `anyRequest()`. `AuthorizationBoundaryIT` drives the whole matrix
over real HTTP — anonymous, customer and admin against every admin endpoint — because the
checks live in the servlet filter chain and calling a controller directly would bypass them.
The same test covers IDOR: one customer cannot read or cancel another's booking, and the
`404` it gets back leaks no name, email or table.

Two status codes that have to differ, and did not at first:

- **`401`** — not signed in. The SPA treats this as an expired session and redirects to login.
- **`403`** — signed in, not entitled. Without an explicit `accessDeniedHandler`, Spring
  answers a role failure through the *authentication* entry point and returns `401`; a
  customer who followed an admin link would be sent to sign in again, which cannot help,
  forever.

A `403` from the CSRF filter is deliberately left with an empty body, while a role refusal
carries the `ACCESS_DENIED` envelope. That difference is the signal the API client uses: a
bare `403` on a write means the page's CSRF token no longer matches the server's session
(a backend restart, or a tab left open), so it fetches a fresh token and retries **once**;
an envelope means the answer will not change and it stops.

Admin cancellation goes through the same `BookingService.cancel` as the customer path,
differing only in the `isAdmin` flag. Staff bypass the notice period — that is what ringing
the club is for — but nothing bypasses overlap, maintenance or an inactive table, and a
session that has already started cannot be cancelled by anyone.

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

## Cancellation and password reset

**Cancellation is decided server-side and published.** Every booking carries `cancellable`,
`cancellableUntil` and `cancellationBlockedReason`, so the UI disables its button from the
same decision the endpoint enforces. The client never recomputes the notice period: it
depends on a configured setting and the server's clock, so a client-side copy eventually
offers a button the API rejects.

Cancelling frees the slot without any code releasing it — `booking_no_overlap` is a
*partial* index whose predicate excludes CANCELLED, so the row stops occupying its slot the
moment the status changes. `CancellationIT` books the freed slot again to prove it, because
if that predicate and `BookingStatus.slotOccupying()` ever drift apart, cancellation
silently stops releasing anything and the grid keeps showing the slot as taken.

A cancelled booking that was already paid for is **flagged for staff, never auto-refunded**.
Refunding is the club's decision — it may owe nothing, part, or a credit — and it is close to
impossible to undo, whereas a flagged row costs a staff member one click.

**Password reset** issues a 32-byte `SecureRandom` token, emails it, and stores only its
SHA-256. A fast hash is correct here and nowhere else in the system: the token has no
dictionary to attack, and a salted slow hash could not be looked up without scanning every
row. Three properties, each covered by `PasswordResetIT`:

- `/forgot-password` answers `202` with an empty body whether or not the address is
  registered. Anything else is a free membership check for anyone holding a list of emails.
- The token is claimed by a guarded `UPDATE`, so two simultaneous submissions cannot both
  succeed and requesting a new link invalidates the old one.
- Completing a reset deletes **every** session for that user. The usual reason for resetting
  is believing somebody else has the password, and that somebody is holding a session cookie
  the new password does not affect.

Mail goes through a `Mailer` interface. With none configured, `LoggingMailer` writes it to
the log — and **refuses to start under the `prod` profile**, because a deployment that merely
forgot to configure SMTP would otherwise come up healthy and quietly log every customer's
reset link.

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
| 3 | Customer dashboard, cancellation, password reset | **Done** |
| 4 | Admin dashboard, booking management, authz boundary | **Done** |
| 5 | Telephone bookings, table CRUD, maintenance blocks | Planned |
| 6 | Settings screens | Planned |
| 7 | Playwright, accessibility, security review | Planned |

Phase 4 covers the staff dashboard, the filterable booking register, booking detail and
admin cancellation. Creating and editing bookings from the admin area is deliberately held
back to Phase 5, where it belongs with the telephone-booking flow it shares almost all of
its machinery with (find-or-create customer, straight to `CONFIRMED`, no Stripe); building
it twice would mean throwing the first one away.

Two things remain unverified rather than done, and are called out here so nobody assumes
otherwise: the **Stripe success path has never been run against real test keys** (the suite
uses a stubbed gateway, and the webhook is covered by a signed fixture), and **Playwright
is not set up** — every end-to-end claim in this README was checked by hand in a browser.

Payments will use Stripe Checkout with a `PENDING_PAYMENT` hold: the booking is created
and its slot reserved *before* Stripe is called (taking money for an unreserved slot
guarantees double-selling), confirmation is idempotent from both the webhook and the
browser return, and a sweeper releases abandoned holds.

Deliberately out of scope: cafe/bar POS, memberships, leagues, recurring bookings,
reminders, promo codes, analytics, and multi-tenancy. No abstractions have been built for
them.
