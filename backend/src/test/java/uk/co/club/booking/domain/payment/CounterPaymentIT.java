package uk.co.club.booking.domain.payment;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.ResponseEntity;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.HttpClient;
import uk.co.club.booking.support.IntegrationFixtures;
import uk.co.club.booking.support.StubCheckoutGateway;

/**
 * Settling a telephone booking at the counter, over real HTTP.
 *
 * <p>The property under test is that money taken in person is recorded as durably and as
 * auditably as money taken by card. Three things follow from that and are asserted here: the
 * booking stops reading as owing anything, the row records <em>who</em> took it, and a second
 * attempt to settle is refused rather than silently swallowed.
 *
 * <p>The stub gateway is imported so a stray Stripe call would be an assertion failure rather
 * than a connection error — none of this may reach the card processor.
 */
@Import(StubCheckoutGateway.Config.class)
@AutoConfigureTestRestTemplate
class CounterPaymentIT extends AbstractIntegrationTest {

    private static final String ADMIN_PASSWORD = "AdminPass123!";
    private static final String STAFF_PASSWORD = "StaffPass123!";

    @Autowired private TestRestTemplate rest;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private StubCheckoutGateway gateway;
    @Autowired private ClubClock clubClock;

    private long tableId;
    private HttpClient admin;
    private LocalDate day;

    @BeforeEach
    void setUp() {
        gateway.reset();
        tableId = fixtures.aTable("Counter Table");
        fixtures.anAdmin("counter-admin@test.local", ADMIN_PASSWORD);
        admin = new HttpClient(rest).login("counter-admin@test.local", ADMIN_PASSWORD);
        day = clubClock.today().plusDays(4);
    }

    @Test
    @DisplayName("marking a booking paid clears what it owes and records who took the money")
    void recordsPaymentAtCounter() {
        String reference = takeTelephoneBooking(14);

        ResponseEntity<Map> response = admin.post(
                "/api/admin/bookings/" + reference + "/payment",
                Map.of("status", "PAID_AT_COUNTER"),
                Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("paymentStatus")).isEqualTo("PAID_AT_COUNTER");
        assertThat(response.getBody().get("amountOutstandingPence")).isEqualTo(0);
        // The badge staff act on must clear, or they will ask a paying customer for money twice.
        assertThat(response.getBody().get("payableAtCounter")).isEqualTo(false);

        // The audit trail is the point of the column: "who let this through" is the question
        // asked when the till does not balance.
        assertThat(recordedByFor(reference)).isNotNull();

        // Settling reuses the row created with the booking rather than adding a second, which
        // would leave two unsettled-looking attempts for one debt.
        assertThat(paymentCountFor(reference)).isEqualTo(1);

        assertThat(gateway.created()).isEmpty();
    }

    @Test
    @DisplayName("a waived booking is settled without money changing hands")
    void waivesPayment() {
        String reference = takeTelephoneBooking(15);

        ResponseEntity<Map> response = admin.post(
                "/api/admin/bookings/" + reference + "/payment",
                Map.of("status", "WAIVED"),
                Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("paymentStatus")).isEqualTo("WAIVED");
        // Comped is settled: the club is owed nothing, so nothing must be chased.
        assertThat(response.getBody().get("amountOutstandingPence")).isEqualTo(0);
        assertThat(response.getBody().get("payableAtCounter")).isEqualTo(false);
    }

    @Test
    @DisplayName("settling twice is refused rather than quietly taking the money again")
    void refusesDoubleSettlement() {
        String reference = takeTelephoneBooking(16);
        admin.post(
                "/api/admin/bookings/" + reference + "/payment",
                Map.of("status", "PAID_AT_COUNTER"),
                Map.class);

        ResponseEntity<Map> second = admin.post(
                "/api/admin/bookings/" + reference + "/payment",
                Map.of("status", "PAID_AT_COUNTER"),
                Map.class);

        // A double click is far likelier than a genuine retry, and a silent success would tell
        // staff they had taken payment twice when they had taken it once.
        assertThat(second.getStatusCode().value()).isEqualTo(422);
        assertThat(String.valueOf(second.getBody())).contains("PAYMENT_NOT_REQUIRED");
        assertThat(paymentCountFor(reference)).isEqualTo(1);
    }

    @Test
    @DisplayName("staff cannot pass off a counter payment as a Stripe success")
    void refusesFabricatedStripeOutcome() {
        String reference = takeTelephoneBooking(17);

        ResponseEntity<Map> response = admin.post(
                "/api/admin/bookings/" + reference + "/payment",
                Map.of("status", "SUCCEEDED"),
                Map.class);

        // SUCCEEDED means Stripe confirmed it. Letting this endpoint write it would put a
        // booking in a state no reconciliation against Stripe could ever explain.
        assertThat(response.getStatusCode().value()).isEqualTo(422);
        assertThat(paymentStatusFor(reference)).isEqualTo("REQUIRES_PAYMENT");
    }

    @Test
    @DisplayName("a refund decision is raised when a paid-at-counter booking is cancelled")
    void cancellingAfterPaymentRaisesRefundDecision() {
        String reference = takeTelephoneBooking(18);
        admin.post(
                "/api/admin/bookings/" + reference + "/payment",
                Map.of("status", "PAID_AT_COUNTER"),
                Map.class);

        admin.post("/api/admin/bookings/" + reference + "/cancel", Map.of(), Map.class);

        // The club is holding this customer's cash. No money moves automatically — but somebody
        // has to decide, and an unflagged cancellation is a decision nobody knows to make.
        assertThat(unresolvedExceptionCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("cancelling an unpaid telephone booking raises nothing")
    void cancellingBeforePaymentRaisesNothing() {
        String reference = takeTelephoneBooking(19);

        admin.post("/api/admin/bookings/" + reference + "/cancel", Map.of(), Map.class);

        // The counter row exists but is unsettled, so the club holds nothing to refund. Raising
        // work here would bury the real refund decisions in noise.
        assertThat(unresolvedExceptionCount()).isZero();
    }

    @Test
    @DisplayName("staff may take payment; it is the job the role exists for")
    void staffMayRecordPayment() {
        String reference = takeTelephoneBooking(20);
        fixtures.aUser("counter-staff@test.local", STAFF_PASSWORD, "STAFF");
        HttpClient staff = new HttpClient(rest).login("counter-staff@test.local", STAFF_PASSWORD);

        ResponseEntity<Map> response = staff.post(
                "/api/admin/bookings/" + reference + "/payment",
                Map.of("status", "PAID_AT_COUNTER"),
                Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("paymentStatus")).isEqualTo("PAID_AT_COUNTER");
    }

    /** Takes a booking over the phone and returns its reference. */
    private String takeTelephoneBooking(int hour) {
        Map<String, Object> body = new HashMap<>();
        body.put("tableId", tableId);
        body.put("date", day.toString());
        body.put("startTime", LocalTime.of(hour, 0).toString());
        body.put("durationMinutes", 60);
        body.put("customerEmail", "caller" + hour + "@test.local");
        body.put("firstName", "Phone");
        body.put("lastName", "Caller");
        body.put("customerPhone", "07700 900999");

        ResponseEntity<Map> response =
                admin.post("/api/admin/bookings/telephone", body, Map.class);
        assertThat(response.getStatusCode().value())
                .as("setting up a telephone booking at %d:00", hour)
                .isEqualTo(201);
        return String.valueOf(response.getBody().get("reference"));
    }

    private Long recordedByFor(String reference) {
        return jdbcTemplate.queryForObject(
                """
                SELECT p.recorded_by_user_id FROM payment p
                JOIN booking b ON b.id = p.booking_id
                WHERE b.reference = ?
                """,
                Long.class,
                reference);
    }

    private String paymentStatusFor(String reference) {
        return jdbcTemplate.queryForObject(
                """
                SELECT p.status FROM payment p
                JOIN booking b ON b.id = p.booking_id
                WHERE b.reference = ?
                """,
                String.class,
                reference);
    }

    private int paymentCountFor(String reference) {
        return jdbcTemplate.queryForObject(
                """
                SELECT count(*) FROM payment p
                JOIN booking b ON b.id = p.booking_id
                WHERE b.reference = ?
                """,
                Integer.class,
                reference);
    }

    private int unresolvedExceptionCount() {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM payment_exception WHERE resolved_at IS NULL", Integer.class);
    }
}
