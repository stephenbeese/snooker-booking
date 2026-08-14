-- Who moved a booking, and when.
--
-- The mirror of cancelled_at / cancelled_by_user_id, and needed for the same reason: this is a
-- staff-initiated change to somebody else's booking, and "the time on my booking is wrong" is
-- unanswerable without a record of who last changed it.
--
-- Nullable and unset for every existing row: a booking that has never been moved has no
-- amendment to describe, and a backfilled timestamp would claim one that never happened.
ALTER TABLE booking ADD COLUMN amended_at TIMESTAMPTZ;
ALTER TABLE booking ADD COLUMN amended_by_user_id BIGINT REFERENCES app_user (id);

-- Both together or neither. The cancellation columns carry no such CHECK, but they are written
-- by a single guarded UPDATE that always sets both; these are set by an ordinary entity save,
-- where half a pair is one forgotten setter away. A time with nobody attached to it is exactly
-- the state that makes an audit trail useless.
ALTER TABLE booking
    ADD CONSTRAINT booking_amendment_complete
    CHECK ((amended_at IS NULL) = (amended_by_user_id IS NULL));
