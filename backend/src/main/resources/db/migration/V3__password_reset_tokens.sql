CREATE TABLE password_reset_token (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    -- SHA-256 hex of the raw token; the raw token is emailed and never stored.
    -- A fast hash is correct here (unlike for passwords): the token is 32 bytes of
    -- SecureRandom output so it is not brute-forceable, and a salted slow hash
    -- could not be indexed for lookup-by-token.
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_token_user ON password_reset_token (user_id);
