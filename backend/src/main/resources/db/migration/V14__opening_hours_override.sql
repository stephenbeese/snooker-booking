-- Special opening hours for named dates: bank holidays, Christmas, a private function.
--
-- Consulted ahead of the weekly opening_hours rows, which V5 was shaped to allow
-- ("holiday/special-date overrides can be added later as a separate table consulted
-- ahead of this one, without changing this shape").
--
-- The date is the primary key: a date has exactly one answer, and making a second row
-- for the same date unstorable is cheaper than deciding at read time which one wins.
--
-- DATE, not TIMESTAMPTZ: an override applies to a club-local calendar day, exactly as
-- opening_hours applies to a weekday. Storing an instant would make "Christmas Day"
-- depend on the server's offset.
CREATE TABLE opening_hours_override (
    override_date DATE        PRIMARY KEY,
    closed        BOOLEAN     NOT NULL DEFAULT FALSE,
    open_time     TIME,
    close_time    TIME,
    -- Why the club is closed or on different hours. Shown to customers on the booking
    -- grid, so "Christmas Day" explains an empty day that would otherwise look broken.
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Same invariant as opening_hours: an open day must have both times, ordered. A
    -- half-configured override is impossible to store rather than something the
    -- resolver has to defend against.
    CONSTRAINT opening_hours_override_times_present CHECK (
        closed
        OR (open_time IS NOT NULL AND close_time IS NOT NULL AND close_time > open_time)
    )
);
