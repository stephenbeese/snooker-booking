package uk.co.club.booking.domain.club;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingRepository;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.table.TableType;

/**
 * Editing the settings that drive the booking engine.
 *
 * <h2>Settings apply when a booking is made, never retroactively</h2>
 *
 * Closing Mondays does not cancel the Monday bookings the club has already sold. Rules are
 * evaluated at creation time, and a confirmed booking is a promise that survives a later
 * change of policy — the alternative, silently invalidating bookings customers are holding,
 * would be far worse than the inconsistency it avoids.
 *
 * <p>That leaves a real hazard: staff can close a day without realising anyone is booked on
 * it. So every write returns {@link Warning}s naming the future bookings that would no longer
 * be creatable under the new rules. Advisory, not blocking — the club may well be closing
 * <em>because</em> of an event and intend to ring those customers. What staff must not do is
 * find out by accident.
 *
 * <h2>Validation is duplicated here on purpose</h2>
 *
 * The CHECK constraints in V6 are the guarantee, but a violated CHECK surfaces as a
 * DataIntegrityViolationException and a 500. Checking the same conditions here turns them into
 * a 422 with a message naming the field. The database still has the last word.
 */
@Service
public class SettingsService {

    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);

    /** How many affected bookings to name before summarising. Enough to act on, not a dump. */
    private static final int MAX_WARNINGS = 20;

    private final ClubSettingsRepository clubSettingsRepository;
    private final OpeningHoursRepository openingHoursRepository;
    private final BookingSettingsRepository bookingSettingsRepository;
    private final PricingRuleRepository pricingRuleRepository;
    private final BookingRepository bookingRepository;
    private final ClubClock clubClock;

    public SettingsService(
            ClubSettingsRepository clubSettingsRepository,
            OpeningHoursRepository openingHoursRepository,
            BookingSettingsRepository bookingSettingsRepository,
            PricingRuleRepository pricingRuleRepository,
            BookingRepository bookingRepository,
            ClubClock clubClock) {
        this.clubSettingsRepository = clubSettingsRepository;
        this.openingHoursRepository = openingHoursRepository;
        this.bookingSettingsRepository = bookingSettingsRepository;
        this.pricingRuleRepository = pricingRuleRepository;
        this.bookingRepository = bookingRepository;
        this.clubClock = clubClock;
    }

    /** A future booking that the new settings would not have permitted. */
    public record Warning(String reference, String detail) {}

    // ---------------------------------------------------------------- club details

    @Transactional(readOnly = true)
    public ClubSettings club() {
        return clubSettingsRepository.current();
    }

    /** Contact details and description. Cannot affect any booking, so it returns no warnings. */
    @Transactional
    public ClubSettings updateClub(
            String name,
            String addressLine1,
            String addressLine2,
            String city,
            String postcode,
            String phone,
            String email,
            String website,
            String description) {
        ClubSettings club = clubSettingsRepository.current();
        club.setName(name.trim());
        club.setAddressLine1(trimToNull(addressLine1));
        club.setAddressLine2(trimToNull(addressLine2));
        club.setCity(trimToNull(city));
        club.setPostcode(trimToNull(postcode));
        club.setPhone(trimToNull(phone));
        club.setEmail(trimToNull(email));
        club.setWebsite(trimToNull(website));
        club.setDescription(trimToNull(description));
        return clubSettingsRepository.saveAndFlush(club);
    }

    // ---------------------------------------------------------------- opening hours

    @Transactional(readOnly = true)
    public List<OpeningHours> openingHours() {
        return openingHoursRepository.findAllByOrderByDayOfWeekAsc();
    }

    /** One day's hours as submitted. */
    public record DayHoursInput(DayOfWeek day, boolean closed, LocalTime openTime, LocalTime closeTime) {}

    /**
     * Replaces the whole week.
     *
     * <p>All seven days at once rather than one at a time: the days are a single coherent
     * schedule, and a per-day endpoint invites a half-applied week where a client fails midway.
     */
    @Transactional
    public List<Warning> updateOpeningHours(List<DayHoursInput> days) {
        Map<DayOfWeek, DayHoursInput> byDay = days.stream()
                .collect(Collectors.toMap(DayHoursInput::day, Function.identity(), (a, b) -> b));

        if (byDay.size() != 7) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "Opening hours must cover all seven days; got " + byDay.size() + ".");
        }

        for (DayHoursInput input : byDay.values()) {
            if (input.closed()) {
                continue;
            }
            if (input.openTime() == null || input.closeTime() == null) {
                throw new BusinessRuleException(
                        ErrorCode.VALIDATION_FAILED,
                        "An open day needs both an opening and a closing time ("
                                + input.day() + ").");
            }
            if (!input.closeTime().isAfter(input.openTime())) {
                throw new BusinessRuleException(
                        ErrorCode.VALIDATION_FAILED,
                        "Closing time must be after opening time (" + input.day() + ").");
            }
        }

        List<Warning> warnings = warningsForNewHours(byDay);

        for (OpeningHours row : openingHoursRepository.findAllByOrderByDayOfWeekAsc()) {
            DayHoursInput input = byDay.get(row.getDay());
            row.setClosed(input.closed());
            // Times are kept on a closed day rather than nulled, so reopening restores the
            // previous hours instead of presenting staff with an empty form. The CHECK permits
            // this: it only requires times when the day is open. Readers null them for display
            // — see ClubController.toDayHours.
            if (!input.closed()) {
                row.setOpenTime(input.openTime());
                row.setCloseTime(input.closeTime());
            }
        }
        openingHoursRepository.flush();
        log.info("Opening hours updated; {} future booking(s) now fall outside them", warnings.size());
        return warnings;
    }

    /**
     * Future bookings that the proposed hours would no longer permit.
     *
     * <p>Only future ones. A booking that has already happened cannot be un-played, and
     * reporting it would bury the actionable rows in history.
     */
    private List<Warning> warningsForNewHours(Map<DayOfWeek, DayHoursInput> byDay) {
        List<Warning> warnings = new ArrayList<>();
        for (Booking booking : futureBookings()) {
            var startLocal = clubClock.toLocalDate(booking.getStartAt());
            DayHoursInput hours = byDay.get(startLocal.getDayOfWeek());
            if (hours == null) {
                continue;
            }
            LocalTime start = clubClock.toLocalTime(booking.getStartAt());
            LocalTime end = clubClock.toLocalTime(booking.getEndAt());

            if (hours.closed()) {
                warnings.add(new Warning(
                        booking.getReference(),
                        "The club would be closed on " + startLocal + ", when this booking starts."));
            } else if (start.isBefore(hours.openTime()) || end.isAfter(hours.closeTime())) {
                warnings.add(new Warning(
                        booking.getReference(),
                        "Runs " + start + "–" + end + " on " + startLocal
                                + ", outside the new hours of " + hours.openTime() + "–"
                                + hours.closeTime() + "."));
            }
            if (warnings.size() >= MAX_WARNINGS) {
                break;
            }
        }
        return warnings;
    }

    // ---------------------------------------------------------------- booking rules

    @Transactional(readOnly = true)
    public BookingSettings bookingSettings() {
        return BookingSettings.require(bookingSettingsRepository.findSingleton());
    }

    /**
     * The rules that govern what a customer may book.
     *
     * <p>Each condition mirrors a CHECK in V6, so an invalid combination is a 422 naming the
     * problem rather than a 500 from the driver.
     */
    @Transactional
    public List<Warning> updateBookingSettings(
            int minDurationMinutes,
            int maxDurationMinutes,
            int incrementMinutes,
            int minNoticeMinutes,
            int maxAdvanceDays,
            int cancellationNoticeHours,
            int paymentHoldMinutes) {

        if (incrementMinutes <= 0) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "The slot increment must be at least 1 minute.");
        }
        if (maxDurationMinutes < minDurationMinutes) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "The maximum duration cannot be shorter than the minimum.");
        }
        // Durations have to be reachable by stepping the increment, or the grid offers options
        // the validator then rejects — the customer picks a slot and is told no for no visible
        // reason.
        if (minDurationMinutes % incrementMinutes != 0 || maxDurationMinutes % incrementMinutes != 0) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "Both durations must be a multiple of the " + incrementMinutes
                            + "-minute increment.");
        }
        if (minNoticeMinutes < 0 || cancellationNoticeHours < 0) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "Notice periods cannot be negative.");
        }
        if (maxAdvanceDays <= 0) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "Customers must be able to book at least one day ahead.");
        }
        if (paymentHoldMinutes < 5) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "A payment hold shorter than 5 minutes would expire while customers are still paying.");
        }

        List<Warning> warnings = warningsForNewBookingRules(
                minDurationMinutes, maxDurationMinutes, incrementMinutes, maxAdvanceDays);

        BookingSettings settings = bookingSettings();
        settings.setMinDurationMinutes(minDurationMinutes);
        settings.setMaxDurationMinutes(maxDurationMinutes);
        settings.setIncrementMinutes(incrementMinutes);
        settings.setMinNoticeMinutes(minNoticeMinutes);
        settings.setMaxAdvanceDays(maxAdvanceDays);
        settings.setCancellationNoticeHours(cancellationNoticeHours);
        settings.setPaymentHoldMinutes(paymentHoldMinutes);
        bookingSettingsRepository.saveAndFlush(settings);
        return warnings;
    }

    private List<Warning> warningsForNewBookingRules(
            int minDuration, int maxDuration, int increment, int maxAdvanceDays) {
        List<Warning> warnings = new ArrayList<>();
        var lastBookableDate = clubClock.today().plusDays(maxAdvanceDays);

        for (Booking booking : futureBookings()) {
            int minutes = booking.getDurationMinutes();
            if (minutes < minDuration || minutes > maxDuration) {
                warnings.add(new Warning(
                        booking.getReference(),
                        minutes + " minutes is outside the new range of " + minDuration + "–"
                                + maxDuration + " minutes."));
            } else if (minutes % increment != 0) {
                warnings.add(new Warning(
                        booking.getReference(),
                        minutes + " minutes is not a multiple of the new " + increment
                                + "-minute increment."));
            } else if (clubClock.toLocalDate(booking.getStartAt()).isAfter(lastBookableDate)) {
                // Shortening the advance window strands bookings already taken beyond it.
                warnings.add(new Warning(
                        booking.getReference(),
                        "Starts beyond the new " + maxAdvanceDays + "-day booking window."));
            }
            if (warnings.size() >= MAX_WARNINGS) {
                break;
            }
        }
        return warnings;
    }

    // ---------------------------------------------------------------- pricing

    @Transactional(readOnly = true)
    public List<PricingRule> pricingRules() {
        return pricingRuleRepository.findAll(
                org.springframework.data.domain.Sort.by(
                        org.springframework.data.domain.Sort.Direction.DESC, "priority"));
    }

    /**
     * Creates or replaces a pricing rule.
     *
     * <p>Existing bookings keep the price they were quoted: the amount is stored on the booking
     * row at creation, not recomputed on read. Changing the rate cannot silently alter what a
     * customer already owes, which is why no warning is produced here.
     */
    @Transactional
    public PricingRule savePricingRule(
            Long id,
            String name,
            TableType tableType,
            java.util.Collection<DayOfWeek> daysOfWeek,
            LocalTime startTime,
            LocalTime endTime,
            int hourlyRatePence,
            int priority,
            boolean active) {

        if (hourlyRatePence <= 0) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "The hourly rate must be more than zero.");
        }
        if (startTime != null && endTime != null && !endTime.isAfter(startTime)) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "The end time must be after the start time.");
        }

        PricingRule rule = id == null
                ? new PricingRule()
                : pricingRuleRepository
                        .findById(id)
                        .orElseThrow(() -> new NotFoundException(
                                ErrorCode.NOT_FOUND, "That pricing rule does not exist."));

        rule.setName(name.trim());
        rule.setTableType(tableType);
        rule.setDaysOfWeek(daysOfWeek);
        rule.setStartTime(startTime);
        rule.setEndTime(endTime);
        rule.setHourlyRatePence(hourlyRatePence);
        rule.setPriority(priority);
        rule.setActive(active);

        PricingRule saved = pricingRuleRepository.saveAndFlush(rule);
        requireACatchAllRemains();
        return saved;
    }

    @Transactional
    public void deletePricingRule(long id) {
        PricingRule rule = pricingRuleRepository
                .findById(id)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That pricing rule does not exist."));
        pricingRuleRepository.delete(rule);
        pricingRuleRepository.flush();
        requireACatchAllRemains();
    }

    /**
     * Refuses to leave the club unable to price a booking.
     *
     * <p>{@code PricingService} throws when no active rule matches, which would make every
     * booking attempt fail with a 500 — the club silently stops selling. Deleting or
     * deactivating the last unrestricted rule is therefore rejected outright rather than
     * discovered by the first customer of the day.
     *
     * <p>Checked after the write and rolled back by the exception, so the same guard covers
     * create, update and delete without three separate pre-checks that could disagree.
     */
    private void requireACatchAllRemains() {
        boolean catchAll = pricingRuleRepository.findAllByActiveTrueOrderByPriorityDesc().stream()
                .anyMatch(rule -> rule.getTableType() == null
                        && rule.getDaysOfWeek().isEmpty()
                        && rule.getStartTime() == null
                        && rule.getEndTime() == null);
        if (!catchAll) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "At least one active rule must apply to every table at every time, "
                            + "or bookings that match no rule cannot be priced.");
        }
    }

    // ---------------------------------------------------------------- shared

    /**
     * Live bookings from now on, in start order.
     *
     * <p>Only slot-occupying statuses: a cancelled or expired booking is not a promise the club
     * has to keep, so warning about it would be noise.
     */
    private List<Booking> futureBookings() {
        Instant now = clubClock.now();
        // 400 days rather than "everything": comfortably beyond any sane advance window, and
        // it keeps a settings save from scanning the club's entire history.
        return bookingRepository.findStartingBetween(now, now.plus(java.time.Duration.ofDays(400)))
                .stream()
                .filter(booking -> BookingStatus.slotOccupying().contains(booking.getStatus()))
                .toList();
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
