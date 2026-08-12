-- Payment status is kept distinct from booking status: the slot and the money have
-- independent lifecycles. A CANCELLED booking may legitimately hold a SUCCEEDED
-- payment awaiting refund.
--
-- One booking may have several payment attempts (a declined card followed by a
-- successful retry, or a later refund), so this is 1:N rather than 1:1.
CREATE TABLE payment (
    id                         BIGSERIAL   PRIMARY KEY,
    booking_id                 BIGINT      NOT NULL REFERENCES booking (id) ON DELETE CASCADE,
    status                     TEXT        NOT NULL,
    provider                   TEXT        NOT NULL DEFAULT 'STRIPE',
    amount_pence               INT         NOT NULL,
    currency                   TEXT        NOT NULL DEFAULT 'gbp',

    -- Stripe identifiers. UNIQUE is load-bearing for webhook idempotency.
    stripe_checkout_session_id TEXT        UNIQUE,
    stripe_payment_intent_id   TEXT        UNIQUE,
    stripe_charge_id           TEXT,

    failure_code               TEXT,
    failure_message            TEXT,
    -- Who keyed in a counter payment.
    recorded_by_user_id        BIGINT      REFERENCES app_user (id),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    version                    BIGINT      NOT NULL DEFAULT 0,

    CONSTRAINT payment_status_valid CHECK (status IN (
        'REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED',
        'REFUNDED', 'PARTIALLY_REFUNDED', 'PAID_AT_COUNTER', 'WAIVED'
    )),
    CONSTRAINT payment_provider_valid CHECK (provider IN ('STRIPE', 'COUNTER', 'NONE')),
    CONSTRAINT payment_amount_non_negative CHECK (amount_pence >= 0)
);

CREATE INDEX idx_payment_booking ON payment (booking_id);

-- Stripe delivers webhooks more than once and out of order. Inserting the event id
-- in the same transaction as processing it makes replay a no-op: the primary key
-- violation rolls back the duplicate work.
CREATE TABLE webhook_event_log (
    event_id     TEXT        PRIMARY KEY,
    event_type   TEXT        NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    payload      JSONB       NOT NULL
);

-- Queue of "money taken but the slot was gone" anomalies for an admin to resolve by
-- rebooking or refunding. Reachable because Stripe's minimum session expiry (30 min)
-- outlives our hold TTL (15 min), so a late payment can arrive after a sweep.
CREATE TABLE payment_exception (
    id          BIGSERIAL   PRIMARY KEY,
    booking_id  BIGINT      NOT NULL REFERENCES booking (id),
    payment_id  BIGINT      NOT NULL REFERENCES payment (id),
    reason      TEXT        NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id BIGINT REFERENCES app_user (id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_exception_unresolved ON payment_exception (created_at)
    WHERE resolved_at IS NULL;
