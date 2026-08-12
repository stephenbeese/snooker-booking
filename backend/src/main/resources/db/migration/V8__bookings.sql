CREATE TABLE booking (
    id                  BIGSERIAL   PRIMARY KEY,
    -- Opaque human-facing identifier for URLs and phone support (e.g. SNK-7F3K2A).
    reference           TEXT        NOT NULL UNIQUE,
    snooker_table_id    BIGINT      NOT NULL REFERENCES snooker_table (id),

    -- Instants, not local times. A booking occupies a physical interval; timestamptz
    -- is unambiguous across DST and is what tstzrange needs below.
    start_at            TIMESTAMPTZ NOT NULL,
    end_at              TIMESTAMPTZ NOT NULL,
    duration_minutes    INT         NOT NULL,

    -- Price captured at creation time, in integer pence. A later rate change must
    -- not silently reprice an existing booking.
    price_pence         INT         NOT NULL,

    status              TEXT        NOT NULL,
    source              TEXT        NOT NULL,

    -- Registered customer. Nullable so a telephone booking can be taken for a
    -- walk-in whose details we hold on the booking itself.
    user_id             BIGINT      REFERENCES app_user (id),
    customer_name       TEXT        NOT NULL,
    customer_email      TEXT,
    customer_phone      TEXT,

    -- Set only while status is PENDING_PAYMENT; see the CHECK below.
    hold_expires_at     TIMESTAMPTZ,

    notes               TEXT,
    created_by_user_id  BIGINT      REFERENCES app_user (id),
    cancelled_at        TIMESTAMPTZ,
    cancelled_by_user_id BIGINT     REFERENCES app_user (id),
    cancellation_reason TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT      NOT NULL DEFAULT 0,

    CONSTRAINT booking_status_valid CHECK (status IN (
        'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'
    )),
    CONSTRAINT booking_source_valid CHECK (source IN ('ONLINE', 'TELEPHONE', 'ADMIN')),
    CONSTRAINT booking_time_order CHECK (end_at > start_at),
    CONSTRAINT booking_duration_positive CHECK (duration_minutes > 0),
    CONSTRAINT booking_price_non_negative CHECK (price_pence >= 0),
    -- A hold has an expiry; anything else must not carry a stale one.
    CONSTRAINT booking_hold_expiry_iff_pending CHECK (
        (status = 'PENDING_PAYMENT') = (hold_expires_at IS NOT NULL)
    )
);

-- The core invariant of the whole system: no two bookings may occupy overlapping
-- time on the same table.
--
-- Why a constraint rather than an application check: "SELECT to see if it's free,
-- then INSERT" is a race by construction. Verified against PostgreSQL: two
-- concurrent overlapping transactions cause the second to block on the first's
-- uncommitted row and then fail on its commit, leaving exactly one booking. No
-- application-level locking, no SERIALIZABLE, and no retry loop is required.
--
-- '[)' is load-bearing: half-open bounds mean a booking ending at 15:00 and one
-- starting at 15:00 do NOT conflict. Any application-side overlap query must use
-- the matching strict comparison (a.start < b.end AND a.end > b.start), or it will
-- disagree with this constraint on abutting bookings.
--
-- The partial predicate releases a slot automatically on transition to CANCELLED or
-- EXPIRED, because a partial index is maintained by the same MVCC machinery as a
-- full one. COMPLETED and NO_SHOW stay in the predicate so history cannot be
-- retroactively double-booked.
--
-- Note the predicate cannot test hold_expires_at > now(): index predicates must be
-- IMMUTABLE. An expired-but-unswept hold therefore still blocks its slot, which is
-- the safe failure direction (over-blocking, never double-booking). The sweeper and
-- the read/write paths close that window.
ALTER TABLE booking
    ADD CONSTRAINT booking_no_overlap
    EXCLUDE USING gist (
        snooker_table_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'));

-- Availability reads a day at a time per table.
CREATE INDEX idx_booking_table_start ON booking (snooker_table_id, start_at);

-- Customer dashboard: most recent first.
CREATE INDEX idx_booking_user_start ON booking (user_id, start_at DESC) WHERE user_id IS NOT NULL;

-- Drives the expired-hold sweeper.
CREATE INDEX idx_booking_hold_expiry ON booking (hold_expires_at)
    WHERE status = 'PENDING_PAYMENT';
