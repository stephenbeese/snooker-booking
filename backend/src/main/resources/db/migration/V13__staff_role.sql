-- Adds STAFF, a role between CUSTOMER and ADMIN: it takes bookings and works the counter
-- but cannot change the club's configuration (opening hours, pricing, tables, or who else
-- has access).
--
-- One line, because V2 stored role as TEXT + CHECK rather than a Postgres ENUM precisely so
-- that adding a role would not require a type rewrite. No backfill: every existing row is
-- already CUSTOMER or ADMIN and keeps the meaning it had.
ALTER TABLE app_user DROP CONSTRAINT app_user_role_valid;

ALTER TABLE app_user
    ADD CONSTRAINT app_user_role_valid CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN'));
