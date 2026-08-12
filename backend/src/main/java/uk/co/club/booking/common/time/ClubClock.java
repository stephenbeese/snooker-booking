package uk.co.club.booking.common.time;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The single owner of every wall-clock &lt;-&gt; instant conversion in the application.
 *
 * <p>Booking times are physical instants ({@code timestamptz}); opening hours are
 * wall-clock rules ({@code LocalTime}). Converting between them is where all the DST
 * danger lives, so it happens here and nowhere else. Nothing in this codebase may call
 * {@link ZoneId#systemDefault()} — the club's zone is configuration, not an accident of
 * where the server runs.
 */
@Component
public class ClubClock {

    private final Clock clock;
    private final ZoneId zone;

    public ClubClock(Clock clock, @Value("${app.club.timezone}") String timezone) {
        this.clock = clock;
        this.zone = ZoneId.of(timezone);
    }

    public ZoneId zone() {
        return zone;
    }

    public Instant now() {
        return clock.instant();
    }

    /** Today's date in the club's timezone — not the server's. */
    public LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), zone);
    }

    /**
     * Resolves a club-local date and time to an instant.
     *
     * <p>DST caveats, both handled by {@link ZonedDateTime#of}: in the spring-forward
     * gap the time does not exist and is shifted forward; in the autumn overlap the
     * time occurs twice and the earlier (summer-time) offset wins. Callers that build
     * slot grids must step instants rather than local times, or a 25-hour day loses an
     * hour.
     */
    public Instant toInstant(LocalDate date, LocalTime time) {
        return ZonedDateTime.of(date, time, zone).toInstant();
    }

    /** The club-local date an instant falls on. */
    public LocalDate toLocalDate(Instant instant) {
        return LocalDate.ofInstant(instant, zone);
    }

    /** The club-local wall-clock time an instant falls on. */
    public LocalTime toLocalTime(Instant instant) {
        return LocalTime.ofInstant(instant, zone);
    }
}
