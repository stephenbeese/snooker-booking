-- Development seed data. Loaded ONLY by the dev profile, which appends
-- classpath:db/seed to spring.flyway.locations. Production loads db/migration alone.
--
-- Repeatable migration (R__), written to be idempotent so re-running is harmless.
--
-- The password hashes below are BCrypt(strength 12) of well-known DEVELOPMENT
-- passwords, guarded by SeedPasswordHashTest:
--     admin@snookerclub.test    / Admin123!
--     customer@snookerclub.test / Customer123!
-- These are for a local database only and must never exist in a deployed system.

-- ---------------------------------------------------------------- users
INSERT INTO app_user (email, password_hash, first_name, last_name, phone, role)
VALUES ('admin@snookerclub.test',
        '$2a$12$fsgQIPwM2GVsuZbiGT6tPORv86U6QoLUMvNciv9hcNPcr2cwU56ae',
        'Club', 'Manager', '0161 000 0001', 'ADMIN')
ON CONFLICT (email) DO NOTHING;

-- A STAFF account, so the role split can be exercised without an admin first creating one.
-- Reaches bookings, the telephone grid and maintenance; refused settings, tables and users.
INSERT INTO app_user (email, password_hash, first_name, last_name, phone, role)
VALUES ('staff@snookerclub.test',
        '$2a$12$yVgaitypNGmYI448aFb6NOe3z5t6MxG6TfFXaoH2pUXSsOpEy02I2',
        'Sam', 'Counter', '0161 000 0002', 'STAFF')
ON CONFLICT (email) DO NOTHING;

INSERT INTO app_user (email, password_hash, first_name, last_name, phone, role)
VALUES ('customer@snookerclub.test',
        '$2a$12$iwawPf4TEAo6wCZolJnPvuUB3KlLXgo/iRr7ENRSLnlDZQOOtyCYW',
        'Joe', 'Davis', '07700 900001', 'CUSTOMER'),
       ('ronnie@snookerclub.test',
        '$2a$12$iwawPf4TEAo6wCZolJnPvuUB3KlLXgo/iRr7ENRSLnlDZQOOtyCYW',
        'Ronnie', 'Higgins', '07700 900002', 'CUSTOMER')
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------- tables
-- Deliberately a mix of types and a non-sequential name ("Match Table") so nothing
-- downstream can assume "Table N" naming or a fixed count.
INSERT INTO snooker_table (name, table_type, display_order, active) VALUES
    ('Table 1',     'SNOOKER',       1, TRUE),
    ('Table 2',     'SNOOKER',       2, TRUE),
    ('Table 3',     'SNOOKER',       3, TRUE),
    ('Match Table', 'SNOOKER',       4, TRUE),
    ('Pool 1',      'ENGLISH_POOL',  5, TRUE),
    ('Pool 2',      'ENGLISH_POOL',  6, TRUE)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------- maintenance block
-- Tomorrow 14:00-18:00 on Pool 2, so the availability grid demonstrates a block on
-- first run. Times are built in the club's timezone rather than UTC so the block
-- lands on the intended wall-clock hours whatever the season.
INSERT INTO maintenance_block (snooker_table_id, start_at, end_at, reason)
SELECT t.id,
       ((CURRENT_DATE + 1) + TIME '14:00') AT TIME ZONE 'Europe/London',
       ((CURRENT_DATE + 1) + TIME '18:00') AT TIME ZONE 'Europe/London',
       'Cloth replacement'
FROM snooker_table t
WHERE t.name = 'Pool 2'
  AND NOT EXISTS (
      SELECT 1 FROM maintenance_block b
      WHERE b.snooker_table_id = t.id
        AND b.reason = 'Cloth replacement'
        AND b.start_at = ((CURRENT_DATE + 1) + TIME '14:00') AT TIME ZONE 'Europe/London'
  );

-- ---------------------------------------------------------------- demo bookings
-- One future confirmed booking (tomorrow 19:00-20:00, Table 1) and one past
-- completed booking, so the customer dashboard and admin lists are not empty.
INSERT INTO booking (reference, snooker_table_id, start_at, end_at, duration_minutes,
                     price_pence, status, source, user_id, customer_name,
                     customer_email, customer_phone)
SELECT 'SNK-DEMO01', t.id,
       ((CURRENT_DATE + 1) + TIME '19:00') AT TIME ZONE 'Europe/London',
       ((CURRENT_DATE + 1) + TIME '20:00') AT TIME ZONE 'Europe/London',
       60, 1200, 'CONFIRMED', 'ONLINE', u.id,
       u.first_name || ' ' || u.last_name, u.email, u.phone
FROM snooker_table t
CROSS JOIN app_user u
WHERE t.name = 'Table 1'
  AND u.email = 'customer@snookerclub.test'
ON CONFLICT (reference) DO NOTHING;

INSERT INTO booking (reference, snooker_table_id, start_at, end_at, duration_minutes,
                     price_pence, status, source, user_id, customer_name,
                     customer_email, customer_phone)
SELECT 'SNK-DEMO02', t.id,
       ((CURRENT_DATE - 7) + TIME '18:00') AT TIME ZONE 'Europe/London',
       ((CURRENT_DATE - 7) + TIME '19:30') AT TIME ZONE 'Europe/London',
       90, 1800, 'COMPLETED', 'ONLINE', u.id,
       u.first_name || ' ' || u.last_name, u.email, u.phone
FROM snooker_table t
CROSS JOIN app_user u
WHERE t.name = 'Table 2'
  AND u.email = 'customer@snookerclub.test'
ON CONFLICT (reference) DO NOTHING;
