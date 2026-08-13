-- A pricing rule may apply to several days.
--
-- Until now day_of_week was one nullable SMALLINT, so "Monday to Thursday, £10" needed four
-- near-identical rules. Staff had to keep them in step by hand, and the settings list showed
-- four rows for one intent.
--
-- A child table rather than an array column or a bitmask: it is the shape a foreign key and a
-- CHECK can police, it reads in psql without decoding, and "which rules apply on a Friday" is
-- an ordinary join rather than a scan.

CREATE TABLE pricing_rule_day (
    rule_id     BIGINT   NOT NULL REFERENCES pricing_rule (id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    -- The PK is the uniqueness rule: a rule cannot name the same day twice, which would
    -- otherwise duplicate the rule in any join and make "applies to" read oddly.
    PRIMARY KEY (rule_id, day_of_week)
);

-- ON DELETE CASCADE covers rule deletion; this index makes the day-first lookup cheap.
CREATE INDEX idx_pricing_rule_day_lookup ON pricing_rule_day (day_of_week);

-- Carry across what is already stored. A rule with a day becomes a rule with a set of one;
-- a rule with NULL stays "any day" and is correctly represented by having no rows here.
INSERT INTO pricing_rule_day (rule_id, day_of_week)
SELECT id, day_of_week FROM pricing_rule WHERE day_of_week IS NOT NULL;

-- Dropped only after the copy above, so the data cannot be lost if this migration is
-- inspected midway. An empty pricing_rule_day now means "every day", which is exactly what
-- NULL meant before — the semantics carry over unchanged.
ALTER TABLE pricing_rule DROP COLUMN day_of_week;
