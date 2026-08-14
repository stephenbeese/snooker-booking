-- The cafe and bar menu: what the club sells alongside table time.
--
-- Deliberately just a priced list. No bills, no stock, no POS — those need a till, a payment
-- flow and a session-per-table concept, and pre-building tables for them now would fix design
-- decisions nobody has made yet. What is here is the part a manager needs on day one: the menu
-- itself, editable without a deployment.
CREATE TABLE cafe_item (
    id            BIGSERIAL   PRIMARY KEY,
    name          TEXT        NOT NULL UNIQUE,
    description   TEXT,
    -- Integer pence, exactly as every other amount in this system. A NUMERIC or a float would
    -- be a second money representation to convert between, and the conversion is where the
    -- rounding errors live.
    price_pence   INT         NOT NULL,
    -- A URL, not an upload. Storing bytes needs an object store, a size limit, a content-type
    -- allowlist and a serving path; a link to an image the club already has costs none of that.
    -- If real uploads are wanted later this column holds their URL too, so nothing here blocks
    -- that.
    image_url     TEXT,
    display_order INT         NOT NULL DEFAULT 0,
    -- Deactivated rather than deleted, as tables and table types are. Today that keeps a
    -- withdrawn item explicable; once bills exist it is what stops a historic line item
    -- pointing at nothing.
    active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Free is a legitimate price (tap water, a birthday slice); negative is always a mistake,
    -- and one that would subtract from a bill the moment bills exist.
    CONSTRAINT cafe_item_price_not_negative CHECK (price_pence >= 0),
    CONSTRAINT cafe_item_name_present CHECK (length(trim(name)) > 0)
);

CREATE INDEX idx_cafe_item_ordering ON cafe_item (display_order, id) WHERE active;
