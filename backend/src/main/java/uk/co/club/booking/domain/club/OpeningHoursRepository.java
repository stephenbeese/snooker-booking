package uk.co.club.booking.domain.club;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OpeningHoursRepository extends JpaRepository<OpeningHours, Long> {

    @Query("SELECT o FROM OpeningHours o WHERE o.dayOfWeek = :day ORDER BY o.dayOfWeek")
    Optional<OpeningHours> findByDayValue(@Param("day") short day);

    List<OpeningHours> findAllByOrderByDayOfWeekAsc();

    default Optional<OpeningHours> findForDay(DayOfWeek day) {
        return findByDayValue((short) day.getValue());
    }
}
