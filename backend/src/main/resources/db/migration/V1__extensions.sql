-- Extensions live in their own migration so a permissions failure here is an
-- unambiguous, isolated error rather than a confusing partial schema.

-- btree_gist lets a GiST index mix an equality column (table_id) with a range
-- column, which is what the booking overlap EXCLUDE constraint in V8 needs.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- gen_random_uuid() and digest() for token hashing.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Case-insensitive email column, so uniqueness does not depend on the
-- application remembering to lowercase.
CREATE EXTENSION IF NOT EXISTS citext;
