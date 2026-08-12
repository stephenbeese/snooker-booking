-- One row per weekday. day_of_week uses ISO-8601 numbering (1=Monday) to match
-- java.time.DayOfWeek.getValue(), so no translation layer is needed.
--
-- Times are LocalTime (wall clock), not instants: the club opens at 10:00 whatever
-- the UTC offset happens to be that month. Converting to instants for a given date
-- is ClubClock's job.
--
-- Structured so holiday/special-date overrides can be added later as a separate
-- table consulted ahead of this one, without changing this shape.
CREATE TABLE opening_hours (
    id          BIGSERIAL PRIMARY KEY,
    day_of_week SMALLINT  NOT NULL UNIQUE,
    closed      BOOLEAN   NOT NULL DEFAULT FALSE,
    open_time   TIME,
    close_time  TIME,

    CONSTRAINT opening_hours_day_valid CHECK (day_of_week BETWEEN 1 AND 7),
    -- An open day must have both times and they must be ordered. This makes a
    -- half-configured day impossible to store.
    CONSTRAINT opening_hours_times_present CHECK (
        closed
        OR (open_time IS NOT NULL AND close_time IS NOT NULL AND close_time > open_time)
    )
);

INSERT INTO opening_hours (day_of_week, closed, open_time, close_time) VALUES
    (1, FALSE, '10:00', '23:00'),
    (2, FALSE, '10:00', '23:00'),
    (3, FALSE, '10:00', '23:00'),
    (4, FALSE, '10:00', '23:00'),
    (5, FALSE, '10:00', '23:00'),
    (6, FALSE, '10:00', '23:00'),
    (7, FALSE, '12:00', '20:00');
