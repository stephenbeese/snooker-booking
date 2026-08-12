-- Single-club system: this is a settings row, not a tenant table. The CHECK makes
-- "there is exactly one club" a database invariant rather than a convention, so the
-- application never has to handle a missing or duplicated settings row.
CREATE TABLE club_settings (
    id            SMALLINT    PRIMARY KEY DEFAULT 1,
    name          TEXT        NOT NULL,
    address_line1 TEXT,
    address_line2 TEXT,
    city          TEXT,
    postcode      TEXT,
    phone         TEXT,
    email         TEXT,
    website       TEXT,
    description   TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT club_settings_singleton CHECK (id = 1)
);

INSERT INTO club_settings (id, name, address_line1, city, postcode, phone, email, description)
VALUES (1,
        'The Snooker Club',
        '1 High Street',
        'Manchester',
        'M1 1AA',
        '0161 000 0000',
        'bookings@snookerclub.example',
        'Championship tables, open seven days a week.');
