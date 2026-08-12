package uk.co.club.booking.domain.club;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OpeningHoursRepository extends JpaRepository<OpeningHours, Long> {

    /**
     * Opening hours for one ISO weekday (1 = Monday, matching {@link DayOfWeek#getValue()}).
     *
     * <p>Takes a {@code short} rather than a {@code DayOfWeek} because the column is a
     * {@code SMALLINT}. Callers convert with {@link #dayValue(DayOfWeek)}.
     *
     * <p>Deliberately no {@code default findForDay(DayOfWeek)} wrapper: a default interface
     * method on a Mockito mock returns null without running its body, so a test that stubs
     * this method would still get null from the wrapper — and the resulting "the club is
     * closed" looks like a genuine rule rejection rather than a mocking artefact.
     */
    @Query("SELECT o FROM OpeningHours o WHERE o.dayOfWeek = :day")
    Optional<OpeningHours> findByDayValue(@Param("day") short day);

    List<OpeningHours> findAllByOrderByDayOfWeekAsc();

    /** ISO weekday number as stored. A static helper, so it is not mockable state. */
    static short dayValue(DayOfWeek day) {
        return (short) day.getValue();
    }
}
