-- Menu categories, so a menu longer than a handful of items can be read.
--
-- Modelled exactly on table_type (V15) rather than as an enum or a free-text column: a manager
-- adds a category without a deployment, the code is a stable identifier that travels in URLs,
-- and the label stays editable because it is only ever displayed.
CREATE TABLE cafe_category (
    code          TEXT        PRIMARY KEY,
    label         TEXT        NOT NULL,
    display_order INT         NOT NULL DEFAULT 0,
    -- Withdrawn rather than deleted, as everything else here is: a category still carried by an
    -- item cannot be removed without orphaning it.
    active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Uppercase, no spaces: the code is an identifier, and a category called "Hot drinks" would
    -- otherwise arrive back as three different strings.
    CONSTRAINT cafe_category_code_shape CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT cafe_category_label_present CHECK (length(trim(label)) > 0)
);

-- A starting set covering what a club counter actually sells. Deliberately short: six that are
-- each worth having beats a dozen where half stay empty, and a manager can add their own.
-- Wine and spirits are separate from beer and cider because clubs stock, price and licence them
-- differently — the one split worth making up front.
INSERT INTO cafe_category (code, label, display_order) VALUES
    ('HOT_DRINKS',      'Hot drinks',      0),
    ('COLD_DRINKS',     'Cold drinks',     1),
    ('BEER_AND_CIDER',  'Beer & cider',    2),
    ('WINE_AND_SPIRITS','Wine & spirits',  3),
    ('SNACKS',          'Snacks',          4),
    ('FOOD',            'Food',            5);

-- Nullable, like pricing_rule.table_type: NULL means uncategorised. Forcing a category would
-- need a backfill guess for items that predate this migration, and would make staff classify a
-- one-off that genuinely fits nowhere. The FK is enforced only on rows that name one.
ALTER TABLE cafe_item ADD COLUMN category_code TEXT;
ALTER TABLE cafe_item
    ADD CONSTRAINT cafe_item_category_fk
    FOREIGN KEY (category_code) REFERENCES cafe_category (code);

-- Menus are read category by category, so that is how they are ordered and fetched.
CREATE INDEX idx_cafe_item_category ON cafe_item (category_code, display_order, id) WHERE active;
CREATE INDEX idx_cafe_category_ordering ON cafe_category (display_order, code) WHERE active;
