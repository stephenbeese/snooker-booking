-- Table types become data rather than a Java enum, so a manager can add one (Chinese pool,
-- darts, a new format the club takes up) without a deployment.
--
-- The code column stays TEXT on snooker_table and pricing_rule, exactly as it was: existing
-- rows are already correct, and referencing types by their code rather than a surrogate id
-- keeps every existing query, index and test fixture working unchanged.
CREATE TABLE table_type (
    code          TEXT        PRIMARY KEY,
    -- What staff and customers actually read. Editable, unlike the code.
    label         TEXT        NOT NULL,
    display_order INT         NOT NULL DEFAULT 0,
    -- Deactivated rather than deleted, as tables are: a type in use by a table or a pricing
    -- rule cannot be removed without orphaning them, and history must stay explicable.
    active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Uppercase, no spaces: the code is an identifier that travels over the wire and appears
    -- in URLs, and a type called "Chinese Pool" would arrive back as three different strings.
    CONSTRAINT table_type_code_shape CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT table_type_label_present CHECK (length(trim(label)) > 0)
);

-- The three values the enum held, preserving the order the UI listed them in.
INSERT INTO table_type (code, label, display_order) VALUES
    ('SNOOKER',       'Snooker',       0),
    ('ENGLISH_POOL',  'English pool',  1),
    ('AMERICAN_POOL', 'American pool', 2);

-- The CHECK becomes a foreign key. It enforces the same thing, except the permitted set is now
-- a table a manager can add to instead of a constraint only a migration can widen.
ALTER TABLE snooker_table DROP CONSTRAINT snooker_table_type_valid;
ALTER TABLE snooker_table
    ADD CONSTRAINT snooker_table_type_fk
    FOREIGN KEY (table_type) REFERENCES table_type (code);

-- pricing_rule.table_type had no CHECK at all — an asymmetry that let a rule be written for a
-- table type that never existed, where it would simply never match and the club would quietly
-- charge the fallback rate. NULL still means "any type", so the FK is only enforced on rows
-- that name one.
ALTER TABLE pricing_rule
    ADD CONSTRAINT pricing_rule_type_fk
    FOREIGN KEY (table_type) REFERENCES table_type (code);

CREATE INDEX idx_table_type_ordering ON table_type (display_order, code) WHERE active;
