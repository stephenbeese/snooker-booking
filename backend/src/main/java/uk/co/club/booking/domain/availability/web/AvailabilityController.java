package uk.co.club.booking.domain.availability.web;

import jakarta.validation.constraints.Positive;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.availability.AvailabilityService;
import uk.co.club.booking.domain.availability.DayAvailability;

/**
 * Public availability endpoint. Deliberately unauthenticated: browsing availability is
 * the conversion path and must not require an account.
 *
 * <p>Thin by design — all computation lives in {@link AvailabilityService}.
 */
@RestController
public class AvailabilityController {

    private final AvailabilityService availabilityService;

    public AvailabilityController(AvailabilityService availabilityService) {
        this.availabilityService = availabilityService;
    }

    /**
     * @param date club-local date to show
     * @param durationMinutes optional; when present each slot reports whether a booking
     *     of this length can start there and what it would cost
     * @param tableId optional, repeatable; defaults to all active tables
     */
    @GetMapping("/api/availability")
    public DayAvailability availability(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) @Positive Integer durationMinutes,
            @RequestParam(required = false) List<Long> tableId) {
        return availabilityService.availability(date, durationMinutes, tableId);
    }
}
