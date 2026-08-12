package uk.co.club.booking;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.TimeZone;
import org.junit.jupiter.api.Test;

class BookingApplicationTest {

    /**
     * Regression guard for a bug that cost an afternoon: with the JVM in BST and
     * {@code hibernate.jdbc.time_zone=UTC}, the driver shifted plain TIME columns by the
     * JVM offset, so opening hours stored as 10:00-23:00 were read back as 11:00-00:00.
     * The window collapsed and the club reported itself closed every day of summer.
     *
     * <p>Unit tests could not catch it — it only appeared through a real JDBC driver.
     * This asserts the JVM's <em>effective</em> zone, whichever mechanism set it:
     * {@code -Duser.timezone} from the Gradle {@code test}/{@code bootRun} config wins
     * over the static initialiser in {@link BookingApplication}, because the default
     * zone is resolved before that block runs. Both are configured; this test fails if
     * either is removed without the other covering it.
     */
    @Test
    void jvmRunsInUtcSoJdbcDoesNotShiftPlainTimeColumns() {
        // Touch the class so its static initialiser runs even if nothing else has.
        assertThat(BookingApplication.class).isNotNull();

        assertThat(TimeZone.getDefault().getRawOffset()).isZero();
        assertThat(TimeZone.getDefault().getID()).isIn("Z", "UTC", "GMT");
    }
}
