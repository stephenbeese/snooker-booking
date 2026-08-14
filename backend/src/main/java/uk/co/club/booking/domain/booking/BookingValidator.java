package uk.co.club.booking.domain.booking;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Component;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.availability.OpeningWindow;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.BookingSettingsRepository;
import uk.co.club.booking.domain.club.OpeningHoursResolver;
import uk.co.club.booking.domain.table.MaintenanceBlockRepository;
import uk.co.club.booking.domain.table.SnookerTable;
import uk.co.club.booking.domain.table.SnookerTableRepository;

/**
 * Every booking rule, in one place.
 *
 * <p>This is the only implementation of these checks in the system. The online booking
 * endpoint, the admin endpoint and any future integration all route through here, so a rule
 * cannot be enforced in one entry point and forgotten in another — the failure mode that
 * makes booking systems double-sell tables.
 *
 * <p>Rules are checked cheapest-and-most-informative first, so a customer who has picked an
 * inactive table is told that rather than being told the club is closed. The order is
 * deliberate and tested.
 *
 * <p>The overlap check here is for a <em>good error message only</em>. The actual guarantee
 * is the {@code booking_no_overlap} database constraint — see {@link BookingService}. Any
 * check-then-insert in application code is a race by construction, and this one is no
 * exception; it just loses harmlessly.
 */
@Component
public class BookingValidator {

    private final SnookerTableRepository tableRepository;
    private final BookingRepository bookingRepository;
    private final MaintenanceBlockRepository blockRepository;
    private final OpeningHoursResolver openingHoursResolver;
    private final BookingSettingsRepository bookingSettingsRepository;
    private final ClubClock clubClock;

    public BookingValidator(
            SnookerTableRepository tableRepository,
            BookingRepository bookingRepository,
            MaintenanceBlockRepository blockRepository,
            OpeningHoursResolver openingHoursResolver,
            BookingSettingsRepository bookingSettingsRepository,
            ClubClock clubClock) {
        this.tableRepository = tableRepository;
        this.bookingRepository = bookingRepository;
        this.blockRepository = blockRepository;
        this.openingHoursResolver = openingHoursResolver;
        this.bookingSettingsRepository = bookingSettingsRepository;
        this.clubClock = clubClock;
    }

    /**
     * Validates a booking request and returns the table it is for.
     *
     * @throws BusinessRuleException (422) if a club rule rejects it
     * @throws NotFoundException (404) if the table does not exist
     */
    public SnookerTable validate(CreateBookingCommand command, BookingPolicy policy) {
        return validate(command, policy, null);
    }

    /**
     * As {@link #validate(CreateBookingCommand, BookingPolicy)}, ignoring one booking's own row.
     *
     * @param excludedBookingId the booking being moved, which must not be treated as clashing
     *     with itself. Every other rule applies unchanged — an amendment is subject to the same
     *     opening hours, maintenance and duration rules as a new booking, and giving it its own
     *     validator would be a second place for those rules to drift.
     */
    public SnookerTable validate(
            CreateBookingCommand command, BookingPolicy policy, Long excludedBookingId) {
        BookingSettings settings = BookingSettings.require(bookingSettingsRepository.findSingleton());
        Instant now = clubClock.now();

        // 1. Duration must be positive, within bounds and aligned to the increment.
        validateDuration(command.durationMinutes(), settings);

        // 2. Notice period. Skippable by staff: someone standing at the counter wanting
        //    the next hour is a sale, not a rule violation.
        if (policy.enforceMinNotice() && command.startAt().isBefore(now.plus(settings.minNotice()))) {
            throw new BusinessRuleException(
                    ErrorCode.INSUFFICIENT_NOTICE,
                    "Bookings must be made at least "
                            + describeMinutes(settings.getMinNoticeMinutes())
                            + " in advance.");
        }

        // Even staff cannot book the past — that is not a policy, it is arithmetic.
        if (!command.startAt().isAfter(now)) {
            throw new BusinessRuleException(
                    ErrorCode.INSUFFICIENT_NOTICE, "That start time has already passed.");
        }

        // 3. Advance window, computed on LocalDate. Adding days to an Instant drifts by an
        //    hour across a DST boundary and moves the cutoff.
        LocalDate startDate = clubClock.toLocalDate(command.startAt());
        if (policy.enforceMaxAdvance()) {
            LocalDate latest = clubClock.toLocalDate(now).plusDays(settings.getMaxAdvanceDays());
            if (startDate.isAfter(latest)) {
                throw new BusinessRuleException(
                        ErrorCode.TOO_FAR_IN_ADVANCE,
                        "Bookings can only be made up to "
                                + settings.getMaxAdvanceDays()
                                + " days ahead.");
            }
        }

        // 4. Table must exist.
        SnookerTable table = tableRepository
                .findById(command.tableId())
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.TABLE_NOT_FOUND, "That table does not exist."));

        // 5. Table must be in service. Never skippable — an out-of-service table cannot
        //    host a game whoever is asking.
        if (!table.isActive()) {
            throw new BusinessRuleException(
                    ErrorCode.TABLE_INACTIVE,
                    "%s is out of service and cannot be booked.".formatted(table.getName()));
        }

        // 6. The booking must sit inside opening hours, on the day it starts.
        validateWithinOpeningHours(command, startDate);

        // 7. No maintenance block. Never skippable.
        if (!blockRepository
                .findOverlappingForTable(command.tableId(), command.startAt(), command.endAt())
                .isEmpty()) {
            throw new BusinessRuleException(
                    ErrorCode.TABLE_UNDER_MAINTENANCE,
                    "%s is unavailable for maintenance at that time.".formatted(table.getName()));
        }

        // 8. No overlapping booking. Advisory only — see the class javadoc.
        List<Booking> clashes = bookingRepository.findOverlappingForTable(
                command.tableId(), command.startAt(), command.endAt(), BookingStatus.slotOccupying());
        boolean liveClash = clashes.stream()
                // A booking being moved always overlaps its own current slot, so without this
                // no amendment could ever pass — including one that only shortens it.
                //
                // Guarded on the excluded id being present, and compared from it rather than
                // from the booking's. An unsaved booking has a null id: calling equals on it
                // throws, and matching null to null would make an unsaved clash exclude itself
                // and disappear — which is worse, because it looks like the slot is free.
                .filter(booking ->
                        excludedBookingId == null
                                || !excludedBookingId.equals(booking.getId()))
                .anyMatch(booking -> !booking.isLapsedHold(now));
        if (liveClash) {
            throw new BusinessRuleException(
                    ErrorCode.SLOT_UNAVAILABLE,
                    "That time has just been taken. Please choose another slot.");
        }

        return table;
    }

    /** The table, or 404. Exposed for the quote endpoint, which needs no other rule. */
    public SnookerTable requireTable(long tableId) {
        return tableRepository
                .findById(tableId)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.TABLE_NOT_FOUND, "That table does not exist."));
    }

    /** Rule 1, extracted because the quote endpoint needs it without the rest. */
    public void validateDuration(int durationMinutes, BookingSettings settings) {
        if (durationMinutes <= 0) {
            throw new BusinessRuleException(
                    ErrorCode.INVALID_DURATION, "Booking length must be a positive number of minutes.");
        }
        if (durationMinutes % settings.getIncrementMinutes() != 0) {
            throw new BusinessRuleException(
                    ErrorCode.INVALID_DURATION,
                    "Bookings must be in multiples of "
                            + describeMinutes(settings.getIncrementMinutes())
                            + ".");
        }
        if (durationMinutes < settings.getMinDurationMinutes()) {
            throw new BusinessRuleException(
                    ErrorCode.INVALID_DURATION,
                    "The shortest booking is " + describeMinutes(settings.getMinDurationMinutes()) + ".");
        }
        if (durationMinutes > settings.getMaxDurationMinutes()) {
            throw new BusinessRuleException(
                    ErrorCode.INVALID_DURATION,
                    "The longest booking is " + describeMinutes(settings.getMaxDurationMinutes()) + ".");
        }
    }

    /**
     * Rules 6: within opening hours.
     *
     * <p>Resolved against the opening hours of the day the booking <em>starts</em>. A booking
     * that would run past closing is rejected on its end time, which is also what stops a
     * booking silently spanning into the next day's hours.
     */
    private void validateWithinOpeningHours(CreateBookingCommand command, LocalDate startDate) {
        // Through the resolver, never the repository directly: this is the write-side half of
        // the pair that must agree with the grid. Resolving weekday hours here independently
        // is what would let a date-specific override hide a day on the grid while this method
        // went on accepting bookings for it.
        OpeningWindow window = openingHoursResolver
                .windowFor(startDate)
                .orElseThrow(() -> new BusinessRuleException(
                        ErrorCode.CLUB_CLOSED, "The club is closed on that day."));

        if (command.startAt().isBefore(window.openAt())) {
            throw new BusinessRuleException(
                    ErrorCode.CLUB_CLOSED,
                    "The club opens at " + window.openTime() + " that day.");
        }
        if (command.endAt().isAfter(window.closeAt())) {
            throw new BusinessRuleException(
                    ErrorCode.CLUB_CLOSED,
                    "That booking would run past closing time (" + window.closeTime() + ").");
        }
    }

    /** "90 minutes" reads worse than "1 hour 30 minutes" in an error a customer sees. */
    private static String describeMinutes(int minutes) {
        long hours = Duration.ofMinutes(minutes).toHours();
        int remainder = minutes % 60;
        if (hours == 0) {
            return remainder + " minutes";
        }
        String hourPart = hours == 1 ? "1 hour" : hours + " hours";
        return remainder == 0 ? hourPart : hourPart + " " + remainder + " minutes";
    }
}
