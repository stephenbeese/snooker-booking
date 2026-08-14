package uk.co.club.booking.domain.club;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OpeningHoursOverrideRepository
        extends JpaRepository<OpeningHoursOverride, LocalDate> {

    /** Overrides from {@code from} onwards, soonest first — what the admin screen lists. */
    List<OpeningHoursOverride> findByDateGreaterThanEqualOrderByDateAsc(LocalDate from);
}
