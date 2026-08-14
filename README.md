# Snooker Club Booking System

Booking and club-management software for a single snooker club. Customers browse live
availability and book a table; staff run the club's day from an admin area.

Single-club by design: no tenant ids, no tenant middleware, no platform admins. Anything
a club would want to change — opening hours, prices, booking rules, the tables
themselves — lives in the database rather than in code.

**Status: all seven phases complete.** Customers can register, sign in, browse live
availability, book and pay via Stripe Checkout, manage and cancel their bookings, edit
their profile and reset a forgotten password. Staff have a dashboard, booking management,
telephone bookings, table and maintenance administration, and full control of opening
hours, booking rules and pricing. See [Still not done](#still-not-done) for what is
deliberately outstanding.

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
- The [Stripe CLI](https://stripe.com/docs/stripe-cli) (`brew install stripe/stripe-cli/stripe`,
  then `stripe login`) — required to take a payment locally, because Stripe cannot reach a
  `localhost` webhook without it

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

Serves <http://localhost:8080>. Flyway applies `V1`–`V12` and, under the `dev` profile
only, the seed data. To target a database other than the Compose one:

```bash
DATABASE_URL=jdbc:postgresql://localhost:5432/snooker_dev \
DATABASE_USERNAME=snooker DATABASE_PASSWORD=snooker \
./gradlew bootRun --args='--spring.profiles.active=dev'
```

### 4. Stripe webhooks

```bash
./run-webhooks.sh
```

**Leave this running in its own terminal whenever you intend to take a payment.** It is the
third process this app needs locally, alongside the backend and the frontend.

Stripe confirms a payment by calling `POST /api/webhooks/stripe`, which it cannot reach on
`localhost` without the CLI forwarding it. With no listener the money is taken, the
application never hears about it, the booking stays `PENDING_PAYMENT`, the page spins on
"Confirming your payment…", and the hold sweeper eventually cancels a booking the customer
has already paid for.

The script checks two things that otherwise fail silently and identically: that the CLI is
installed and authenticated, and that its signing secret matches `STRIPE_WEBHOOK_SECRET` in
`.env`. A mismatched secret means every event is rejected as unsigned — indistinguishable
from no listener at all, and the reason it prints the correct value rather than just
complaining.

To recover a payment whose webhook was missed while the listener was down, find the event
and resend it:

```bash
stripe events resend evt_XXXXXXXX
```

Since the double-charge fix, clicking **Pay now** on a booking that was in fact already paid
also repairs it: the server asks Stripe what became of the previous session, confirms the
booking from that answer, and refuses to open a second checkout.

### 5. Frontend

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

| Role | Email | Password | Reaches |
|---|---|---|---|
| Manager (ADMIN) | `admin@snookerclub.test` | `Admin123!` | Everything, including settings, pricing, tables and accounts |
| Staff (STAFF) | `staff@snookerclub.test` | `Staff123!` | Bookings, telephone bookings, maintenance — **not** the club's configuration |
| Customer | `customer@snookerclub.test` | `Customer123!` | Their own bookings |
| Customer | `ronnie@snookerclub.test` | `Customer123!` | Their own bookings |

Roles are managed at **`/admin/users`** by a manager: create an account with a role, promote
or demote an existing one, deactivate someone who has left, or set a password for someone who
has lost theirs. Two rules there are enforced by the server and cannot be clicked past — an
admin cannot remove their own access, and the club must always keep at least one active
manager.

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
cd backend  && ./gradlew test        # 224 tests: JUnit 5, Mockito, Testcontainers
cd frontend && yarn test             # 103 tests: Vitest + React Testing Library
cd frontend && yarn typecheck        # strict TypeScript, no emit
cd frontend && yarn e2e              # 28 tests: Playwright, real browser
```

Backend tests run in UTC. Integration tests use Testcontainers with `postgres:17-alpine` —
**H2 cannot express `EXCLUDE USING gist`**, so an H2-based suite would give zero coverage of
the system's core invariant.

### End-to-end

> **The e2e suite writes to your development database.** Unlike the backend integration
> tests, which get a disposable Testcontainers Postgres, Playwright drives the real app
> against `localhost:5433`. Specs create and edit real rows, and their cleanup restores
> settings to the seeded defaults. Anything you have configured by hand — pricing rules,
> opening hours, booking rules — can be overwritten by a run.
>
> A fixture may delete rows **it created**, identified by a marker it set itself (see
> `E2E_PREFIX` in `e2e/admin-pricing.spec.ts`) or by a reference it captured (see
> `releaseBookings` in `e2e/support/helpers.ts`). It must never delete rows merely because it
> does not recognise them: an earlier version of that cleanup kept "the seeded rule" and
> removed everything else, which wiped a real pricing rule a developer had configured. For the
> same reason the booking cleanup cancels the references it recorded, and never "every booking
> on this date".

Playwright starts both servers itself (see `frontend/playwright.config.ts`) and reuses them
if they are already running. First run only:

```bash
cd frontend && yarn playwright install chromium
```

Two projects: `chromium` for the desktop specs and `mobile` (Pixel 7) for `*.mobile.spec.ts`,
which needs real touch emulation rather than a narrow desktop window.

The specs run against the **dev** database and create real bookings. That is deliberate — they
exercise the same schema and settings a developer is looking at — but it means they change
data. Settings are restored in an `afterEach`, and that restore is asserted rather than
fire-and-forget: a silent failure there once left the club closed on a Wednesday and every
later spec failing for an unrelated reason.

Bookings are cleaned up too, and the suite is designed to be re-runnable back to back:

- Each spec that books gets **its own date**, allocated by `bookingDate()` in
  `e2e/support/helpers.ts`. Specs that only read the grid share `openDay()`. Two specs sharing
  a date both clicked the *first* free cell, so whichever ran second hit the other's live hold
  and failed with "that time has just been taken" — a booking-flow bug that wasn't one.
- Each spec releases what it created in an `afterEach`, via `releaseBookings()`. A successful
  card payment leaves a **CONFIRMED** booking, which no sweeper ever expires: before this,
  every green run permanently consumed another cell, 17 had piled up on one date, and the
  suite was on its way to running that day out of slots entirely.

So a booking left live after a run is a bug, not the expected state. To check:

```bash
docker exec snooker-postgres psql -U snooker -d snooker -c "select count(*) from booking where start_at > now() and status in ('PENDING_PAYMENT','CONFIRMED')"
```

Only `SNK-DEMO01` from the seed should ever appear there. Cancelled and expired rows accumulate
harmlessly — the overlap constraint ignores both — so they are left alone rather than deleted,
which keeps the history of what a run did.

`stripe-checkout.spec.ts` types a real test card into Stripe's hosted page. The webhook must
be forwarded for it to pass:

```bash
./run-webhooks.sh
```

**Without the forwarder the payment completes at Stripe but the booking does not confirm.**
The webhook is the only thing that confirms a payment — there is no browser-return
confirmation to fall back on, despite the `?payment=complete` parameter's appearance. That
parameter is only a hint to the UI to show a spinner and poll; it changes nothing on the
server. A payment taken with no listener running stays `PENDING_PAYMENT` until either the
event is resent or the customer clicks **Pay now** again, which now reconciles against Stripe
rather than charging a second time.

---

## Rate limiting

The endpoints where guessing is the attack are throttled by `RateLimitFilter`, which sits
*before* the CSRF filter so a flood costs a map lookup rather than a BCrypt comparison.

| Endpoint | Per IP | Per email |
|---|---|---|
| `POST /api/auth/login` | 10 / min | 20 / hour |
| `POST /api/auth/register` | 5 / hour | 3 / hour |
| `POST /api/auth/forgot-password` | 5 / hour | 3 / hour |
| `POST /api/auth/reset-password` | 10 / hour | 10 / hour |

Both keys matter. IP alone lets a botnet spray one account; email alone lets one address
enumerate many. A refusal is `429` with `Retry-After` and the same message whichever limit
tripped — saying which would confirm the account exists. A successful login clears that
account's failure history, so someone who mistypes their password a few times is not locked
out afterwards; the per-IP counter is deliberately left alone, since on a shared network it
is protecting other people.

BCrypt strength 12 already makes login slow, but slow is not a limit — an unthrottled
attacker still gets unlimited attempts, and an unthrottled forgot-password endpoint is a way
to make the club's mail server send arbitrary volumes of mail to an address of the attacker's
choosing.

Counters are in memory, so they reset on restart and would be per-node behind a load
balancer. For an attacker that is a marginal gain; a shared Redis counter would be a hard
dependency on infrastructure the club does not run.

`app.rate-limit.enabled` defaults to **true** — a flag that defaults to off is protection that
exists only in the config file someone forgot to write. The integration suite turns it off
(`application-test.yml`) because it logs in far harder than any real user; `RateLimitIT` turns
it back on for its own context. The dev profile keeps the filter on but scales every limit by
`app.rate-limit.multiplier: 50`, so the Playwright suite runs through the real filter without
throttling itself.

---

## API documentation

springdoc generates an OpenAPI document from the controllers and DTOs, so it cannot drift
from the code the way a hand-written spec does.

| URL | What |
|---|---|
| `http://localhost:8080/swagger-ui.html` | Browsable API |
| `http://localhost:8080/v3/api-docs` | The JSON document |

**Dev profile only.** A public `/v3/api-docs` is a complete and accurate map of every
endpoint and field, admin surface included — it saves an attacker the reconnaissance and does
nothing for a customer. `springdoc.api-docs.enabled` defaults to `false`, so a new profile has
to opt in rather than remember to opt out, and `SecurityConfig` reads that same property when
deciding whether to allowlist the docs paths, so the two cannot disagree.

`OpenApiDocumentIT` asserts the document generates and contains no secrets. Worth a test
because springdoc still uses Jackson 2 internally while Spring Boot 4 has moved to Jackson 3:
both are on the classpath, and if that ever conflicts the failure appears only when someone
opens the URL.

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
| `V12` | `pricing_rule_day`, so one pricing rule can cover several weekdays |

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
| `POST` | `/api/admin/bookings/telephone` | Admin | Find-or-create customer, straight to `CONFIRMED` |
| `GET` | `/api/admin/tables` | Admin | Includes inactive tables and staff notes |
| `POST` | `/api/admin/tables` | Admin | Duplicate name → `422 CONFLICT` |
| `PUT` | `/api/admin/tables/{id}` | Admin | Rename, retype, reorder |
| `PUT` | `/api/admin/tables/{id}/active` | Admin | `?active=` — take off sale or restore |
| `GET` | `/api/admin/maintenance-blocks` | Admin | `?from=&to=`, club-local and inclusive |
| `POST` | `/api/admin/maintenance-blocks` | Admin | Refused if live bookings fall inside |
| `DELETE` | `/api/admin/maintenance-blocks/{id}` | Admin | Frees the slot immediately |
| `GET` `PUT` | `/api/admin/settings/club` | Admin | Contact details; cannot affect a booking |
| `GET` `PUT` | `/api/admin/settings/opening-hours` | Admin | All seven days at once |
| `GET` `PUT` | `/api/admin/settings/booking-rules` | Admin | Durations, notice, advance window, hold |
| `GET` | `/api/admin/settings/pricing-rules` | Admin | Highest-priority match wins |
| `POST` `PUT` | `/api/admin/settings/pricing-rules[/{id}]` | Admin | Refuses to leave no catch-all rule |
| `DELETE` | `/api/admin/settings/pricing-rules/{id}` | Admin | Same guard as above |
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

## Maintenance blocks

A block and a booking are two promises about the same table at the same time, and only one
can be kept. The database cannot adjudicate that pair: an `EXCLUDE` constraint works within
a single table, and these live in two. Blocks are kept from overlapping *each other* by
`maintenance_block_no_overlap` in V9, but block-versus-booking is enforced in
`MaintenanceBlockService`.

**A block over live bookings is refused, and the refusal names them.** Silently accepting
one would leave a customer holding a booking for a table staff believe is out of service,
and the conflict would surface when they arrived. Cancelling somebody's game is a decision
with a person at the end of it, so it belongs to the club rather than to a default. Only
slot-occupying statuses count — a cancelled booking is history, not a promise, and must not
make a table permanently unmaintainable.

Both directions are covered by `MaintenanceBlockIT`, including the half-open `[)` boundary:
a booking ending at 14:00 and a block starting at 14:00 do not conflict, matching the
database's own semantics exactly.

---

## Settings

The settings screens drive the booking engine rather than describing it. Closing a day
removes it from the grid; changing the increment respaces every slot; changing the rate
changes the next quote. `SettingsAffectAvailabilityIT` asserts each of those through
`AvailabilityService` and `BookingService` — the same paths a customer's browser drives —
rather than by reading the settings row back, because a settings screen that saves without
changing anything is worse than none: staff believe they have closed on Christmas Day.

**Changes apply to new bookings only.** A confirmed booking is a promise the club has
already sold, and withdrawing it because policy changed afterwards would be worse than the
inconsistency it avoids. That leaves the real hazard — closing a Monday with eleven games on
it and not realising — so every settings write returns a `warnings` array naming the future
bookings the new rules would not have permitted:

```json
{ "settings": { … },
  "warnings": [{ "reference": "SNK-ABC123",
                 "detail": "The club would be closed on 2026-08-23, when this booking starts." }] }
```

Advisory, never blocking: the club may be closing *because* of an event and intend to ring
those customers. The UI shows them prominently and states that the bookings still stand.

**At least one pricing rule must match everything.** `PricingService` throws when no active
rule applies, which would turn every booking attempt into a 500 — the club silently stops
selling. Deactivating or deleting the last unrestricted rule is refused at the point of the
change rather than discovered by the first customer of the day. The UI predicts that refusal
too: the fallback rule shows "Required — the club's fallback rate" in place of a Delete
button, so staff are told before they click rather than after.

### Pricing rules

Rules are added, edited and deleted in place on the settings screen — in the list rather than
in a dialog, because which rule wins depends on the others' priorities and a modal covering
the list makes that impossible to judge.

**Rates are typed in pounds and stored in pence.** `poundsToPence` rounds rather than
truncates: `12.15 * 100` is `1214.9999999999998` in binary floating point, so truncation would
quietly charge a penny less on every booking at that rate. It returns `null` for unusable
input — including an empty field, since `Number('')` is `0` and would otherwise save a rule at
£0.00. `money.test.ts` covers both, including a round-trip property so that opening a rule and
saving it untouched cannot change the price.

**A booking spanning a rate change pays each rate for the time it covers.** A 10:00–14:00
morning rate and a booking of 10:30–14:30 is charged 3h30 at the morning rate plus 30 minutes
at the fallback, not four hours at whichever rate happened to apply at the start. `quotePence`
splits the interval at each rule boundary and rounds up once at the end — rounding per segment
would make a price depend on how many boundaries it happened to cross.

**The grid shows the rate at each slot, not one rate per row.** A rule narrowed by time of day
makes the rate a function of the slot; a single figure per row showed a morning rate all day
and never showed an evening rate at all. The row header reports a range (`£7.50–£12.00/hr`)
when the rate varies, and `varyingRate` says whether it does.

**Priority decides which rule wins, and ties go to the older rule.** A narrowed rule created
at priority 0 therefore loses to the seeded fallback and silently never applies — the single
likeliest reason to conclude pricing rules do not work. New rules default to priority 10, and
a rule that cannot beat the fallback is labelled "Never applies" in the list.

**A rule can cover several days.** `pricing_rule_day` (added in V12) holds the set, so
"Monday to Thursday at £9.50" is one rule rather than four kept in step by hand. An **empty
set means every day**, carrying over exactly what a null `day_of_week` meant before — read as
"no days" instead, every unrestricted rule including the catch-all would match nothing and no
booking could be priced at all. Ticking all seven normalises back to empty, so there is one
representation in the database rather than two that behave alike.

A rule with a start time needs an end time. That is checked in the form as well as on the
server, so the message lands on the field instead of arriving as a banner after a round trip —
the server keeps its own copy, and remains the authority.

`e2e/admin-pricing.spec.ts` is the test that matters: it types a rate into the admin screen
and asserts the new price appears on the customer's booking grid, which is the only way to
show that pounds became pence, were stored, and came back as the price a customer is quoted.

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

### Pay on arrival

A booking taken over the phone is CONFIRMED but unpaid, so it gets a `payment` row with
provider `COUNTER` and status `REQUIRES_PAYMENT` — money expected, not yet taken. Without it,
"confirmed and paid" and "confirmed and owing £12" looked identical to whoever was on the
counter. `AdminBookingResponse` carries `paymentStatus`, `amountOutstandingPence` and
`payableAtCounter`, and the admin list and detail pages show **"Pay on arrival — £X due"**.

`POST /api/admin/bookings/{reference}/payment` settles it as `PAID_AT_COUNTER` or `WAIVED`,
stamping `recorded_by_user_id` from the **session**, never the request body. STAFF as well as
ADMIN: taking payment as a customer walks in is the job the role exists for. Three rules,
each covered by `CounterPaymentIT`:

- **Only those two statuses.** `SUCCEEDED` means Stripe confirmed it; letting this endpoint
  write it would leave a booking in a state no reconciliation against Stripe could explain.
- **Settling twice is refused, not silently ignored.** A double click is far likelier than a
  genuine retry, and a quiet success would tell staff they had taken the money twice.
- **The row is reused, not duplicated** — two unsettled attempts for one debt would make the
  outstanding amount ambiguous.

Cancelling afterwards behaves exactly as it does for a card payment: `isSettled()` already
covers both statuses, so `flagForRefundIfPaid` raises a refund decision. Cancelling *before*
payment raises nothing — the club is holding no money, and noise there would bury the real
refund decisions.

**No part payments and no amount field.** The club is owed what the booking costs, priced by
its own rules; a figure typed at the counter would put the till out of step with the booking.

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

## Security

Reviewed at the end of Phase 7. `SecurityHeadersIT` pins the parts that are invisible in the
UI and would otherwise be lost silently in a refactor.

| Concern | How |
|---|---|
| Passwords | BCrypt strength 12 |
| Sessions | Spring Session JDBC; id rotated on login; every session invalidated on password reset |
| Cookies | `Secure` + `SameSite=Lax` on both; `HttpOnly` on `SESSION` but deliberately **not** on `XSRF-TOKEN`, which the SPA must read |
| CSRF | Cookie-to-header on every write; only the Stripe webhook is exempt, where HMAC is strictly stronger |
| Authorisation | `hasRole("ADMIN")` on `/api/admin/**`, default-deny `anyRequest().authenticated()`, plus per-record ownership checks |
| Headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` |
| Errors | One envelope, never a stack trace; `include-stacktrace: never` |
| Enumeration | Login and forgot-password answer identically whether or not the account exists |
| Webhooks | `Webhook.constructEvent` signature verification; replay-proofed by a PK on `event_id` |
| Secrets | Environment only; the app refuses to start without the Stripe keys |
| Rate limiting | See [Rate limiting](#rate-limiting) |

Two decisions worth knowing about, because both look like oversights:

**`SameSite=Lax`, not `Strict`.** `Strict` withholds the cookie on the cross-site top-level
redirect back from Stripe Checkout, so the customer lands back logged out with a payment they
cannot see. `Lax` still blocks cross-site POST, which is the attack CSRF cookies exist to stop.

**Reset tokens are stored SHA-256, not BCrypt** — the inverse of the password rule, and
deliberate. The token is already 32 bytes of `SecureRandom`, so stretching it buys nothing,
and BCrypt would make lookup-by-token unindexable.

`X-Forwarded-For` is deliberately ignored when identifying a caller. It is attacker-supplied
unless a trusted proxy overwrites it, and honouring it would let anyone reset their own rate
limit by varying a header — worse than no limit, because it would look like protection. Behind
a proxy, set `server.forward-headers-strategy=framework` so the container resolves the real
address before the filter sees it.

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
| 5 | Telephone bookings, table CRUD, maintenance blocks | **Done** |
| 6 | Club settings, opening hours, booking rules, pricing | **Done** |
| 7 | Rate limiting, OpenAPI, Playwright, accessibility, security review | **Done** |

Phase 5 adds the staff booking flow deferred from Phase 4. A telephone booking routes
through the same `BookingService.create` and the same `BookingValidator` as an online one;
the only difference is `BookingPolicy.staff()`, which lifts the notice and advance limits
and skips the payment hold. There is deliberately no flag for skipping overlap, maintenance
or inactive-table checks — those describe the physical world, and `TelephoneBookingIT`
asserts staff are still refused all three.

Such a booking is confirmed but unpaid, so it carries a **counter payment**: a `payment` row
with provider `COUNTER` and status `REQUIRES_PAYMENT`. See
[Pay on arrival](#pay-on-arrival).

**Editing an existing booking's time or table is still not implemented.** Staff cancel and
re-book instead. Moving a booking is a different operation from creating one — it has to
release the old slot and take the new one atomically, or it can double-sell the table it
just freed — and it was not worth doing badly to close a checklist item.

Phase 6 makes the booking engine configurable — see [Settings](#settings).

Phase 7 closes the two gaps the earlier phases carried. Both are now genuinely verified
rather than argued for:

- **The Phase 6 hard gate is a real Playwright spec.** `admin-settings-affect-availability.spec.ts`
  drives the admin UI in one browser context and asserts the result in another, as a customer.
  `SettingsAffectAvailabilityIT` remains as the faster backend-level gate.
- **Payment has been driven end to end through Stripe's hosted page**, card entry included,
  with the webhook forwarded by the Stripe CLI and its signature verified. This is the only
  test that covers the whole chain — hold, session, charge, webhook, confirmation. Every other
  payment test stubs at least one link, which is exactly how the `jsonb` webhook defect
  survived 156 passing tests while real bookings stayed unconfirmed.

Payments use Stripe Checkout with a `PENDING_PAYMENT` hold: the booking is created and its
slot reserved *before* Stripe is called (taking money for an unreserved slot guarantees
double-selling), confirmation is idempotent from both the webhook and the browser return, and
a sweeper releases abandoned holds.

### Still not done

**Editing an existing booking's time or table**, as above — staff cancel and re-book.

**Rate limiting is per-instance and in-memory.** Correct for the single instance this is built
for; behind a load balancer each node would keep its own counters. `RateLimiter` is the single
place that changes.

**No automated axe/contrast audit.** The accessibility specs drive the keyboard and assert
accessible names — which is what would actually stop someone booking — but colour contrast has
only been checked by eye.

Deliberately out of scope: cafe/bar POS, memberships, leagues, recurring bookings,
reminders, promo codes, analytics, and multi-tenancy. No abstractions have been built for
them.
