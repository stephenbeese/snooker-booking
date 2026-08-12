CREATE TABLE app_user (
    id            BIGSERIAL   PRIMARY KEY,
    -- citext so uniqueness does not depend on the application remembering to
    -- lowercase every email before it writes.
    email         CITEXT      NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    first_name    TEXT        NOT NULL,
    last_name     TEXT        NOT NULL,
    phone         TEXT,
    role          TEXT        NOT NULL,
    active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- TEXT + CHECK rather than a Postgres ENUM: adding a role later is a one-line
    -- migration instead of a type rewrite, and it maps cleanly to
    -- @Enumerated(EnumType.STRING).
    CONSTRAINT app_user_role_valid CHECK (role IN ('CUSTOMER', 'ADMIN'))
);

-- Admin customer search hits phone as often as email.
CREATE INDEX idx_app_user_phone ON app_user (phone) WHERE phone IS NOT NULL;
