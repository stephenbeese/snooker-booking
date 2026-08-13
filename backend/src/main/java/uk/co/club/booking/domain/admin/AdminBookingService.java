package uk.co.club.booking.domain.admin;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingRepository;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.payment.PaymentExceptionRepository;

/**
 * Read side of the admin dashboard.
 *
 * <p>Deliberately read-only. Every admin <em>write</em> — cancelling, and later creating and
 * editing — goes through {@code BookingService}, so the rules cannot fork into an admin copy
 * that drifts from the customer one. The one thing admins get is a {@code BookingPolicy} that
 * relaxes notice and advance limits; overlap and maintenance are not policies, and no code path
 * here can skip them.
 */
@Service
public class AdminBookingService {

    private final BookingRepository bookingRepository;
    private final PaymentExceptionRepository paymentExceptionRepository;
    private final ClubClock clubClock;

    public AdminBookingService(
            BookingRepository bookingRepository,
            PaymentExceptionRepository paymentExceptionRepository,
            ClubClock clubClock) {
        this.bookingRepository = bookingRepository;
        this.paymentExceptionRepository = paymentExceptionRepository;
        this.clubClock = clubClock;
    }

    /**
     * The filtered, paged booking list.
     *
     * <p>Sorted by start time descending so the most recent work is first — the same order the
     * customer list uses, for the same reason.
     */
    @Transactional(readOnly = true)
    public Page<Booking> search(AdminBookingQuery query) {
        return bookingRepository.search(
                query.statusesOrNull(),
                startOfDayOrNull(query.from()),
                // Exclusive upper bound at the start of the *next* day, so a `to` of today
                // includes today. Using the same day's midnight would silently exclude every
                // booking on the day the user asked for.
                query.to() == null ? null : startOfDay(query.to().plusDays(1)),
                query.tableId(),
                query.searchPattern(),
                PageRequest.of(query.page(), query.size(), Sort.by(Sort.Direction.DESC, "startAt")));
    }

    /** Everything starting on one club-local day, for the day view. */
    @Transactional(readOnly = true)
    public List<Booking> forDay(LocalDate date) {
        return bookingRepository.findStartingBetween(startOfDay(date), startOfDay(date.plusDays(1)));
    }

    /**
     * The numbers on the dashboard.
     *
     * <p>All computed here from the database rather than assembled in the browser: a figure the
     * client derives is a figure that disagrees with the list next to it the moment either
     * changes.
     */
    @Transactional(readOnly = true)
    public AdminDashboard dashboard() {
        LocalDate today = clubClock.today();
        Instant dayStart = startOfDay(today);
        Instant dayEnd = startOfDay(today.plusDays(1));
        Instant now = clubClock.now();

        Map<BookingStatus, Long> todayByStatus = countsByStatus(dayStart, dayEnd);
        List<Booking> todaysBookings = bookingRepository.findStartingBetween(dayStart, dayEnd);

        // Revenue actually committed for today, not merely quoted: a pending hold may never be
        // paid, and counting it would report money the club does not have.
        int expectedRevenuePence = todaysBookings.stream()
                .filter(booking -> booking.getStatus() == BookingStatus.CONFIRMED
                        || booking.getStatus() == BookingStatus.COMPLETED)
                .mapToInt(Booking::getPricePence)
                .sum();

        // Only holds still counting down. A lapsed hold is the sweeper's problem, and showing it
        // as "awaiting payment" would have staff chasing a slot that is already free.
        long awaitingPayment = bookingRepository.countByStatusAndHoldExpiresAtAfter(
                BookingStatus.PENDING_PAYMENT, now);

        long stillToCome = todaysBookings.stream()
                .filter(booking -> booking.getStatus().occupiesSlot())
                .filter(booking -> booking.getStartAt().isAfter(now))
                .count();

        return new AdminDashboard(
                today,
                todayByStatus.getOrDefault(BookingStatus.CONFIRMED, 0L)
                        + todayByStatus.getOrDefault(BookingStatus.COMPLETED, 0L),
                stillToCome,
                todayByStatus.getOrDefault(BookingStatus.CANCELLED, 0L),
                awaitingPayment,
                expectedRevenuePence,
                paymentExceptionRepository.findByResolvedAtIsNullOrderByCreatedAtAsc().size());
    }

    private Map<BookingStatus, Long> countsByStatus(Instant from, Instant to) {
        Map<BookingStatus, Long> counts = new EnumMap<>(BookingStatus.class);
        for (Object[] row : bookingRepository.countByStatusBetween(from, to)) {
            counts.put((BookingStatus) row[0], (Long) row[1]);
        }
        return counts;
    }

    private Instant startOfDayOrNull(LocalDate date) {
        return date == null ? null : startOfDay(date);
    }

    /** Via ClubClock, so a day boundary is the club's midnight and not the server's. */
    private Instant startOfDay(LocalDate date) {
        return clubClock.toInstant(date, LocalTime.MIDNIGHT);
    }
}
