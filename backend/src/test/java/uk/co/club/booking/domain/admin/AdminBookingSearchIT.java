package uk.co.club.booking.domain.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * The admin booking search, against real PostgreSQL.
 *
 * <p>Worth an integration test rather than a unit test because every property under examination
 * is a property of the query itself — the null-guarded predicates, the half-open date bounds, the
 * LIKE escaping — none of which a mocked repository would exercise at all.
 */
class AdminBookingSearchIT extends AbstractIntegrationTest {

    @Autowired private AdminBookingService adminBookingService;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private ClubClock clubClock;

    private long tableOne;
    private long tableTwo;
    private LocalDate today;

    @BeforeEach
    void seedBookings() {
        tableOne = fixtures.aTable("Search Table One");
        tableTwo = fixtures.aTable("Search Table Two");
        long userId = fixtures.aCustomer("searchable@test.local", "Password123!");
        today = clubClock.today();

        fixtures.aBooking("SNK-TODAY1", tableOne, at(today, 14), 60, "CONFIRMED", userId, null);
        fixtures.aBooking("SNK-TODAY2", tableTwo, at(today, 16), 60, "CANCELLED", userId, null);
        fixtures.aBooking(
                "SNK-TOMORW", tableOne, at(today.plusDays(1), 14), 60, "CONFIRMED", userId, null);
        fixtures.aBooking(
                "SNK-LASTWK", tableOne, at(today.minusDays(7), 14), 60, "COMPLETED", userId, null);
    }

    @Test
    @DisplayName("with no filters, every booking is returned newest first")
    void unfilteredReturnsEverything() {
        List<Booking> results = search(new AdminBookingQuery(null, null, null, null, null, 0, 25));

        assertThat(references(results))
                .containsExactly("SNK-TOMORW", "SNK-TODAY2", "SNK-TODAY1", "SNK-LASTWK");
    }

    @Test
    @DisplayName("an empty status set means 'any status', not 'nothing'")
    void emptyStatusSetIsNotAFilter() {
        // The trap in a null-guarded query: passing an empty collection to `IN ()` matches
        // nothing, so "no status selected" would render an empty table rather than everything.
        List<Booking> results =
                search(new AdminBookingQuery(Set.of(), null, null, null, null, 0, 25));

        assertThat(results).hasSize(4);
    }

    @Test
    @DisplayName("filtering by status narrows to those statuses only")
    void filtersByStatus() {
        List<Booking> results = search(new AdminBookingQuery(
                Set.of(BookingStatus.CONFIRMED), null, null, null, null, 0, 25));

        assertThat(references(results)).containsExactly("SNK-TOMORW", "SNK-TODAY1");
    }

    @Test
    @DisplayName("a single-day range includes that whole day")
    void dateRangeIsInclusiveOfTheEndDay() {
        // The off-by-one that matters: an exclusive bound at the start of `to` would return
        // nothing at all here, and staff would conclude the day was empty.
        List<Booking> results =
                search(new AdminBookingQuery(null, today, today, null, null, 0, 25));

        assertThat(references(results)).containsExactly("SNK-TODAY2", "SNK-TODAY1");
    }

    @Test
    @DisplayName("filtering by table returns only that table's bookings")
    void filtersByTable() {
        List<Booking> results =
                search(new AdminBookingQuery(null, null, null, tableTwo, null, 0, 25));

        assertThat(references(results)).containsExactly("SNK-TODAY2");
    }

    @Test
    @DisplayName("search matches a reference, case-insensitively")
    void searchesByReference() {
        List<Booking> results =
                search(new AdminBookingQuery(null, null, null, null, "today1", 0, 25));

        assertThat(references(results)).containsExactly("SNK-TODAY1");
    }

    @Test
    @DisplayName("search matches the customer name")
    void searchesByCustomerName() {
        List<Booking> results =
                search(new AdminBookingQuery(null, null, null, null, "fixture", 0, 25));

        assertThat(results).hasSize(4);
    }

    @Test
    @DisplayName("a wildcard typed into the search box is treated as a literal")
    void escapesLikeWildcards() {
        // Without escaping, "%" matches every booking in the club — so a staff member typing a
        // stray character would get a full table dump and believe it was a real result set.
        List<Booking> results = search(new AdminBookingQuery(null, null, null, null, "%", 0, 25));

        assertThat(results).isEmpty();
    }

    @Test
    @DisplayName("paging splits the results and reports the true total")
    void pages() {
        var firstPage = adminBookingService.search(
                new AdminBookingQuery(null, null, null, null, null, 0, 2));

        assertThat(firstPage.getContent()).hasSize(2);
        // The count must be of all matches, not of the page — otherwise the pager shows one page.
        assertThat(firstPage.getTotalElements()).isEqualTo(4);
        assertThat(firstPage.getTotalPages()).isEqualTo(2);

        var secondPage = adminBookingService.search(
                new AdminBookingQuery(null, null, null, null, null, 1, 2));
        assertThat(references(secondPage.getContent())).containsExactly("SNK-TODAY1", "SNK-LASTWK");
    }

    @Test
    @DisplayName("an oversized page size is capped rather than honoured")
    void capsPageSize() {
        var page = adminBookingService.search(
                new AdminBookingQuery(null, null, null, null, null, 0, 10_000));

        assertThat(page.getSize()).isEqualTo(AdminBookingQuery.MAX_PAGE_SIZE);
    }

    @Test
    @DisplayName("the dashboard counts today's bookings and today's committed revenue")
    void dashboardReflectsToday() {
        AdminDashboard dashboard = adminBookingService.dashboard();

        assertThat(dashboard.date()).isEqualTo(today);
        // SNK-TODAY1 only: the cancelled one is not takings, and tomorrow's is not today.
        assertThat(dashboard.bookedToday()).isEqualTo(1);
        assertThat(dashboard.cancelledToday()).isEqualTo(1);
        assertThat(dashboard.expectedRevenuePence()).isEqualTo(1200);
    }

    @Test
    @DisplayName("a lapsed hold is not reported as awaiting payment")
    void lapsedHoldIsNotAwaitingPayment() {
        long userId = fixtures.aCustomer("holder@test.local", "Password123!");
        Instant past = Instant.now().minus(1, ChronoUnit.HOURS);
        fixtures.aBooking(
                "SNK-LAPSED", tableTwo, at(today.plusDays(2), 14), 60,
                "PENDING_PAYMENT", userId, past);

        // Counting it would send staff chasing a customer for a slot the sweeper has released.
        assertThat(adminBookingService.dashboard().awaitingPayment()).isZero();
    }

    @Test
    @DisplayName("a live hold is reported as awaiting payment")
    void liveHoldIsAwaitingPayment() {
        long userId = fixtures.aCustomer("live-holder@test.local", "Password123!");
        Instant future = Instant.now().plus(10, ChronoUnit.MINUTES);
        fixtures.aBooking(
                "SNK-LIVEHD", tableTwo, at(today.plusDays(2), 14), 60,
                "PENDING_PAYMENT", userId, future);

        assertThat(adminBookingService.dashboard().awaitingPayment()).isEqualTo(1);
    }

    private List<Booking> search(AdminBookingQuery query) {
        return adminBookingService.search(query).getContent();
    }

    private List<String> references(List<Booking> bookings) {
        return bookings.stream().map(Booking::getReference).toList();
    }

    private Instant at(LocalDate date, int hour) {
        return clubClock.toInstant(date, LocalTime.of(hour, 0));
    }
}
