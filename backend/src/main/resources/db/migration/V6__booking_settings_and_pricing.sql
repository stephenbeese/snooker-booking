-- These values actively control the booking engine; they are not informational.
CREATE TABLE booking_settings (
    id                        SMALLINT    PRIMARY KEY DEFAULT 1,
    min_duration_minutes      INT         NOT NULL DEFAULT 30,
    max_duration_minutes      INT         NOT NULL DEFAULT 240,
    increment_minutes         INT         NOT NULL DEFAULT 30,
    min_notice_minutes        INT         NOT NULL DEFAULT 60,
    max_advance_days          INT         NOT NULL DEFAULT 30,
    cancellation_notice_hours INT         NOT NULL DEFAULT 24,
    -- How long a PENDING_PAYMENT booking holds its slot while the customer pays.
    payment_hold_minutes      INT         NOT NULL DEFAULT 15,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT booking_settings_singleton CHECK (id = 1),
    CONSTRAINT booking_settings_increment_positive CHECK (increment_minutes > 0),
    CONSTRAINT booking_settings_duration_order CHECK (max_duration_minutes >= min_duration_minutes),
    -- Durations must be reachable by stepping the increment, or the UI would offer
    -- options the validator rejects.
    CONSTRAINT booking_settings_min_divisible CHECK (min_duration_minutes % increment_minutes = 0),
    CONSTRAINT booking_settings_max_divisible CHECK (max_duration_minutes % increment_minutes = 0),
    CONSTRAINT booking_settings_notice_non_negative CHECK (min_notice_minutes >= 0),
    CONSTRAINT booking_settings_advance_positive CHECK (max_advance_days > 0),
    CONSTRAINT booking_settings_cancellation_non_negative CHECK (cancellation_notice_hours >= 0),
    -- A 30-second hold would look like valid config and produce constant mystery
    -- failures.
    CONSTRAINT booking_settings_hold_sane CHECK (payment_hold_minutes >= 5)
);

INSERT INTO booking_settings (id) VALUES (1);

-- MVP pricing is a single hourly rate, but the shape supports peak/off-peak,
-- weekend and per-table-type rates later without a migration: NULL means
-- "matches anything", and the highest priority matching rule wins.
CREATE TABLE pricing_rule (
    id                BIGSERIAL   PRIMARY KEY,
    name              TEXT        NOT NULL,
    table_type        TEXT,
    day_of_week       SMALLINT,
    start_time        TIME,
    end_time          TIME,
    hourly_rate_pence INT         NOT NULL,
    priority          INT         NOT NULL DEFAULT 0,
    active            BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pricing_rule_rate_positive CHECK (hourly_rate_pence > 0),
    CONSTRAINT pricing_rule_day_valid CHECK (day_of_week IS NULL OR day_of_week BETWEEN 1 AND 7),
    CONSTRAINT pricing_rule_time_order CHECK (
        start_time IS NULL OR end_time IS NULL OR end_time > start_time
    )
);

-- Catch-all: £12.00/hour. Money is integer pence throughout — never a float.
INSERT INTO pricing_rule (name, hourly_rate_pence, priority)
VALUES ('Standard hourly rate', 1200, 0);

CREATE INDEX idx_pricing_rule_lookup ON pricing_rule (priority DESC) WHERE active;
