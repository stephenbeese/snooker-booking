-- Makes a table unavailable for a period without deleting it (cloth replacement,
-- re-levelling, private hire).
CREATE TABLE maintenance_block (
    id                 BIGSERIAL   PRIMARY KEY,
    snooker_table_id   BIGINT      NOT NULL REFERENCES snooker_table (id) ON DELETE CASCADE,
    start_at           TIMESTAMPTZ NOT NULL,
    end_at             TIMESTAMPTZ NOT NULL,
    reason             TEXT,
    created_by_user_id BIGINT      REFERENCES app_user (id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT maintenance_block_time_order CHECK (end_at > start_at)
);

-- Blocks on one table may not overlap each other. Same half-open semantics as
-- bookings so a block ending at 18:00 and one starting at 18:00 are fine.
--
-- Note what this does NOT cover: an EXCLUDE constraint cannot span two tables, so
-- block-versus-booking overlap is enforced in the service layer instead — for admin
-- and online bookings alike. That asymmetry is deliberate: merging bookings and
-- blocks into one physical table to get a single constraint would mean a pile of
-- mutually-exclusive nullable columns.
ALTER TABLE maintenance_block
    ADD CONSTRAINT maintenance_block_no_overlap
    EXCLUDE USING gist (
        snooker_table_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
    );

CREATE INDEX idx_maintenance_block_table_start ON maintenance_block (snooker_table_id, start_at);
