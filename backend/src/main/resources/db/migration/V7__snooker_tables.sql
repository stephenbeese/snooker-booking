-- Named snooker_table because "table" is a reserved word. The number of tables is
-- data, never hardcoded.
CREATE TABLE snooker_table (
    id            BIGSERIAL   PRIMARY KEY,
    name          TEXT        NOT NULL UNIQUE,
    table_type    TEXT        NOT NULL DEFAULT 'SNOOKER',
    display_order INT         NOT NULL DEFAULT 0,
    -- Deactivated rather than deleted: bookings reference tables historically.
    active        BOOLEAN     NOT NULL DEFAULT TRUE,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT snooker_table_type_valid CHECK (
        table_type IN ('SNOOKER', 'ENGLISH_POOL', 'AMERICAN_POOL')
    )
);

CREATE INDEX idx_snooker_table_ordering ON snooker_table (display_order, id) WHERE active;
