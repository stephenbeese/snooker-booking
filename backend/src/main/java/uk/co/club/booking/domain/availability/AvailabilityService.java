package uk.co.club.booking.domain.availability;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingRepository;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.BookingSettingsRepository;
import uk.co.club.booking.domain.club.OpeningHours;
import uk.co.club.booking.domain.club.OpeningHoursRepository;
import uk.co.club.booking.domain.club.PricingService;
import uk.co.club.booking.domain.table.MaintenanceBlock;
import uk.co.club.booking.domain.table.MaintenanceBlockRepository;
import uk.co.club.booking.domain.table.SnookerTable;
import uk.co.club.booking.domain.table.SnookerTableRepository;

/**
 * Computes what a customer may book. The backend is the only authority on availability;
 * the frontend renders what this returns and never decides for itself.
 *
 * <p>Read-only. Concurrency safety comes from the {@code booking_no_overlap} database
 * constraint at write time, not from anything here — a grid is always a snapshot, and by
 * the time a customer clicks, a slot may already be gone.
 */
@Service
public class AvailabilityService {

    private final SnookerTableRepository tableRepository;
    private final BookingRepository bookingRepository;
    private final MaintenanceBlockRepository blockRepository;
    private final OpeningHoursRepository openingHoursRepository;
    private final BookingSettingsRepository bookingSettingsRepository;
    private final SlotGenerator slotGenerator;
    private final PricingService pricingService;
    private final ClubClock clubClock;

    public AvailabilityService(
            SnookerTableRepository tableRepository,
            BookingRepository bookingRepository,
            MaintenanceBlockRepository blockRepository,
            OpeningHoursRepository openingHoursRepository,
            BookingSettingsRepository bookingSettingsRepository,
            SlotGenerator slotGenerator,
            PricingService pricingService,
            ClubClock clubClock) {
        this.tableRepository = tableRepository;
        this.bookingRepository = bookingRepository;
        this.blockRepository = blockRepository;
        this.openingHoursRepository = openingHoursRepository;
        this.bookingSettingsRepository = bookingSettingsRepository;
        this.slotGenerator = slotGenerator;
        this.pricingService = pricingService;
        this.clubClock = clubClock;
    }

    /**
     * Availability for a date across active tables.
     *
     * @param requestedDurationMinutes when supplied, each slot also reports whether a
     *     booking of exactly this length can start there, and what it would cost
     */
    @Transactional(readOnly = true)
    public DayAvailability availability(
            LocalDate date, Integer requestedDurationMinutes, List<Long> tableIds) {

        BookingSettings settings = BookingSettings.require(bookingSettingsRepository.findSingleton());
        Instant now = clubClock.now();

        List<SnookerTable> tables = selectTables(tableIds);

        Optional<OpeningWindow> maybeWindow =
                openingHoursRepository
                        .findByDayValue(OpeningHoursRepository.dayValue(date.getDayOfWeek()))
                        .flatMap(hours -> slotGenerator.openingWindow(date, hours));

        List<DayAvailability.DurationOption> durationOptions = durationOptions(settings);

        // A day beyond the advance window is reported as a whole-day condition rather
        // than as every slot being individually unavailable.
        UnavailableReason dayReason = wholeDayReason(date, maybeWindow, settings, now);
        if (maybeWindow.isEmpty() || dayReason != null) {
            LocalTime open = maybeWindow.map(OpeningWindow::openTime).orElse(null);
            LocalTime close = maybeWindow.map(OpeningWindow::closeTime).orElse(null);
            return new DayAvailability(
                    date,
                    date.getDayOfWeek(),
                    clubClock.zone().getId(),
                    maybeWindow.isPresent(),
                    open,
                    close,
                    settings.getIncrementMinutes(),
                    List.of(),
                    durationOptions,
                    requestedDurationMinutes,
                    dayReason == null ? UnavailableReason.CLUB_CLOSED : dayReason,
                    List.of());
        }

        OpeningWindow window = maybeWindow.get();
        List<Instant> slotStarts = slotGenerator.slotStarts(window, settings);
        List<LocalTime> slotTimes =
                slotStarts.stream().map(clubClock::toLocalTime).toList();

        // Two queries for the whole day rather than per table, to avoid N+1.
        Map<Long, List<Booking>> bookingsByTable = groupByTable(bookingRepository.findOverlapping(
                window.openAt(), window.closeAt(), BookingStatus.slotOccupying()));
        Map<Long, List<MaintenanceBlock>> blocksByTable = groupBlocksByTable(
                blockRepository.findOverlapping(window.openAt(), window.closeAt()));

        List<TableAvailability> rows = new ArrayList<>(tables.size());
        for (SnookerTable table : tables) {
            rows.add(buildRow(
                    table,
                    slotStarts,
                    window,
                    settings,
                    now,
                    requestedDurationMinutes,
                    bookingsByTable.getOrDefault(table.getId(), List.of()),
                    blocksByTable.getOrDefault(table.getId(), List.of())));
        }

        return new DayAvailability(
                date,
                date.getDayOfWeek(),
                clubClock.zone().getId(),
                true,
                window.openTime(),
                window.closeTime(),
                settings.getIncrementMinutes(),
                slotTimes,
                durationOptions,
                requestedDurationMinutes,
                null,
                rows);
    }

    private List<SnookerTable> selectTables(List<Long> tableIds) {
        if (tableIds == null || tableIds.isEmpty()) {
            return tableRepository.findAllByActiveTrueOrderByDisplayOrderAscIdAsc();
        }
        // Explicit ids may include an inactive table; the row is still returned so the
        // grid can show it as out of service rather than silently omitting it.
        return tableRepository.findAllById(tableIds).stream()
                .sorted(Comparator.comparingInt(SnookerTable::getDisplayOrder)
                        .thenComparing(SnookerTable::getId))
                .toList();
    }

    /** Whole-day conditions that make every slot moot. */
    private UnavailableReason wholeDayReason(
            LocalDate date, Optional<OpeningWindow> window, BookingSettings settings, Instant now) {
        if (window.isEmpty()) {
            return UnavailableReason.CLUB_CLOSED;
        }
        LocalDate today = clubClock.toLocalDate(now);
        if (date.isBefore(today)) {
            return UnavailableReason.PAST;
        }
        // Computed on LocalDate, not by adding days to an Instant: adding 24-hour days
        // across a DST boundary drifts by an hour and moves the cutoff.
        if (date.isAfter(today.plusDays(settings.getMaxAdvanceDays()))) {
            return UnavailableReason.TOO_FAR_IN_ADVANCE;
        }
        return null;
    }

    private List<DayAvailability.DurationOption> durationOptions(BookingSettings settings) {
        List<DayAvailability.DurationOption> options = new ArrayList<>();
        for (int minutes = settings.getMinDurationMinutes();
                minutes <= settings.getMaxDurationMinutes();
                minutes += settings.getIncrementMinutes()) {
            options.add(new DayAvailability.DurationOption(minutes, formatDuration(minutes)));
        }
        return options;
    }

    static String formatDuration(int minutes) {
        int hours = minutes / 60;
        int remainder = minutes % 60;
        if (hours == 0) {
            return remainder + " mins";
        }
        String hourPart = hours == 1 ? "1 hour" : hours + " hours";
        return remainder == 0 ? hourPart : hourPart + " " + remainder + " mins";
    }

    private TableAvailability buildRow(
            SnookerTable table,
            List<Instant> slotStarts,
            OpeningWindow window,
            BookingSettings settings,
            Instant now,
            Integer requestedDurationMinutes,
            List<Booking> bookings,
            List<MaintenanceBlock> blocks) {

        Duration increment = settings.increment();
        int hourlyRatePence = pricingService.hourlyRatePence(table, window.openAt());

        // First pass: is each cell itself occupied, and why not if so?
        List<UnavailableReason> cellReasons = new ArrayList<>(slotStarts.size());
        for (Instant start : slotStarts) {
            cellReasons.add(cellReason(table, start, start.plus(increment), now, settings, bookings, blocks));
        }

        // Second pass: how long a booking can start in each cell. Walking backwards
        // accumulates the run of free cells in one sweep instead of rescanning.
        int[] freeRunMinutes = new int[slotStarts.size()];
        int incrementMinutes = settings.getIncrementMinutes();
        for (int i = slotStarts.size() - 1; i >= 0; i--) {
            if (cellReasons.get(i) != null) {
                freeRunMinutes[i] = 0;
            } else {
                int following = (i + 1 < slotStarts.size()) ? freeRunMinutes[i + 1] : 0;
                freeRunMinutes[i] = incrementMinutes + following;
            }
        }

        List<SlotView> slots = new ArrayList<>(slotStarts.size());
        for (int i = 0; i < slotStarts.size(); i++) {
            Instant start = slotStarts.get(i);
            UnavailableReason cellReason = cellReasons.get(i);
            boolean cellAvailable = cellReason == null;

            // Cap by the closing time as well as by the free run: the club shutting is a
            // limit on duration, not on whether the cell is occupied.
            int untilClose = (int) Duration.between(start, window.closeAt()).toMinutes();
            int longestFit = Math.min(freeRunMinutes[i], untilClose);
            int maxDuration = largestPermittedDuration(longestFit, settings);

            Boolean bookableForRequested = null;
            Integer pricePenceForRequested = null;
            UnavailableReason reason = cellReason;

            if (requestedDurationMinutes != null) {
                boolean fits = settings.isDurationAllowed(requestedDurationMinutes)
                        && requestedDurationMinutes <= longestFit;
                bookableForRequested = cellAvailable && fits;
                if (bookableForRequested) {
                    pricePenceForRequested = pricingService.quotePence(
                            table, start, start.plus(Duration.ofMinutes(requestedDurationMinutes)));
                }
            }

            // An unoccupied cell that cannot start any permitted booking is reported
            // distinctly, so the UI can show it as free-but-unstartable.
            if (cellAvailable && maxDuration == 0) {
                reason = UnavailableReason.INSUFFICIENT_REMAINING_TIME;
            }

            slots.add(new SlotView(
                    clubClock.toLocalTime(start),
                    start,
                    clubClock.toLocalTime(start.plus(increment)),
                    cellAvailable,
                    reason,
                    bookableForRequested,
                    maxDuration,
                    pricePenceForRequested));
        }

        return new TableAvailability(
                table.getId(),
                table.getName(),
                table.getTableType(),
                table.isActive(),
                hourlyRatePence,
                slots);
    }

    /** Largest permitted duration that fits in the given number of free minutes. */
    private int largestPermittedDuration(int availableMinutes, BookingSettings settings) {
        if (availableMinutes < settings.getMinDurationMinutes()) {
            return 0;
        }
        int capped = Math.min(availableMinutes, settings.getMaxDurationMinutes());
        // Round down to the increment so the value is always itself bookable.
        return capped - (capped % settings.getIncrementMinutes());
    }

    /**
     * Why this individual cell cannot be booked, or null if it is free. Ordered so the
     * most informative reason wins when several apply.
     */
    private UnavailableReason cellReason(
            SnookerTable table,
            Instant start,
            Instant end,
            Instant now,
            BookingSettings settings,
            List<Booking> bookings,
            List<MaintenanceBlock> blocks) {

        if (!table.isActive()) {
            return UnavailableReason.TABLE_INACTIVE;
        }
        if (!start.isAfter(now)) {
            return UnavailableReason.PAST;
        }
        if (start.isBefore(now.plus(settings.minNotice()))) {
            return UnavailableReason.INSUFFICIENT_NOTICE;
        }
        if (overlaps(blocks, start, end)) {
            return UnavailableReason.MAINTENANCE;
        }
        if (occupiedByBooking(bookings, start, end, now)) {
            return UnavailableReason.BOOKED;
        }
        return null;
    }

    private boolean overlaps(List<MaintenanceBlock> blocks, Instant start, Instant end) {
        // Strict comparisons for half-open semantics, matching the '[)' bounds used by
        // the database constraints. Using <=/>= would flag merely abutting periods.
        return blocks.stream()
                .anyMatch(block -> block.getStartAt().isBefore(end) && block.getEndAt().isAfter(start));
    }

    private boolean occupiedByBooking(
            List<Booking> bookings, Instant start, Instant end, Instant now) {
        return bookings.stream()
                // A hold past its expiry no longer reserves the slot. The database
                // constraint still sees it until the sweeper runs, but showing it as
                // taken would keep a slot dark for no reason.
                .filter(booking -> !booking.isLapsedHold(now))
                .anyMatch(booking ->
                        booking.getStartAt().isBefore(end) && booking.getEndAt().isAfter(start));
    }

    private Map<Long, List<Booking>> groupByTable(List<Booking> bookings) {
        Map<Long, List<Booking>> byTable = new HashMap<>();
        for (Booking booking : bookings) {
            byTable.computeIfAbsent(booking.getSnookerTable().getId(), key -> new ArrayList<>())
                    .add(booking);
        }
        return byTable;
    }

    private Map<Long, List<MaintenanceBlock>> groupBlocksByTable(List<MaintenanceBlock> blocks) {
        Map<Long, List<MaintenanceBlock>> byTable = new HashMap<>();
        for (MaintenanceBlock block : blocks) {
            byTable.computeIfAbsent(block.getSnookerTable().getId(), key -> new ArrayList<>())
                    .add(block);
        }
        return byTable;
    }
}
