package uk.co.club.booking.domain.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
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
 * Telephone bookings over real HTTP — the Phase 5 hard gate.
 *
 * <p>Two properties matter, and they pull in opposite directions:
 *
 * <ol>
 *   <li><strong>Staff can do what customers cannot.</strong> Take a booking for ten minutes'
 *       time, or for next year, and have it confirmed without payment.
 *   <li><strong>Staff cannot do what nobody can.</strong> Double-book a table, book over
 *       maintenance, or book an inactive table. Those are not policies but facts about the
 *       physical world, and {@code BookingPolicy} has no field that could relax them.
 * </ol>
 *
 * <p>The stub gateway is imported so that a Stripe call would be <em>observable</em>: the test
 * asserts it was never used. Without it a telephone booking that wrongly started a checkout
 * would fail with a connection error rather than a meaningful assertion.
 */
@Import(StubCheckoutGateway.Config.class)
@AutoConfigureTestRestTemplate
class TelephoneBookingIT extends AbstractIntegrationTest {

    private static final String ADMIN_PASSWORD = "AdminPass123!";
    private static final String CUSTOMER_PASSWORD = "CustomerPass123!";

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
        tableId = fixtures.aTable("Phone Table");
        fixtures.anAdmin("phone-admin@test.local", ADMIN_PASSWORD);
        admin = new HttpClient(rest).login("phone-admin@test.local", ADMIN_PASSWORD);
        day = clubClock.today().plusDays(3);
    }

    @Test
    @DisplayName("creates a confirmed booking for a brand new customer, with no payment")
    void createsForNewCustomer() {
        ResponseEntity<Map> response = admin.post(
                "/api/admin/bookings/telephone", request("newcaller@test.local", 14, 0, 60), Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        Map<String, Object> body = response.getBody();
        assertThat(body).isNotNull();

        // Straight to CONFIRMED. A hold exists to reserve inventory while an unsupervised
        // customer fetches a card; on the phone there is nothing to hold against.
        assertThat(body.get("status")).isEqualTo("CONFIRMED");
        assertThat(body.get("source")).isEqualTo("TELEPHONE");
        assertThat(body.get("holdExpiresAt")).isNull();
        // Priced by the club's own rules, not by whatever staff said on the phone.
        assertThat(body.get("pricePence")).isEqualTo(1200);

        assertThat(gateway.created())
                .as("a telephone booking must never start a Stripe checkout")
                .isEmpty();

        // The shell account exists so the customer finds the booking if they later sign up.
        assertThat(userCountFor("newcaller@test.local")).isEqualTo(1);
    }

    @Test
    @DisplayName("reuses an existing account rather than creating a duplicate")
    void reusesExistingCustomer() {
        long existingId = fixtures.aCustomer("regular@test.local", CUSTOMER_PASSWORD);

        ResponseEntity<Map> response = admin.post(
                "/api/admin/bookings/telephone", request("regular@test.local", 15, 0, 60), Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(userCountFor("regular@test.local"))
                .as("a second account would split this customer's history in two")
                .isEqualTo(1);

        // The booking must be attached to the real account, or it will not appear in the
        // customer's own dashboard.
        Long userId = jdbcTemplate.queryForObject(
                "SELECT user_id FROM booking WHERE reference = ?",
                Long.class,
                response.getBody().get("reference"));
        assertThat(userId).isEqualTo(existingId);
    }

    @Test
    @DisplayName("an existing customer's password is never overwritten")
    void doesNotTouchExistingCredentials() {
        fixtures.aCustomer("regular@test.local", CUSTOMER_PASSWORD);
        String hashBefore = passwordHashFor("regular@test.local");

        admin.post("/api/admin/bookings/telephone", request("regular@test.local", 15, 0, 60), Map.class);

        // Find-or-create must never reset a real account to the unusable placeholder hash —
        // that would lock a paying customer out of their own account after a phone call.
        assertThat(passwordHashFor("regular@test.local")).isEqualTo(hashBefore);
    }

    @Test
    @DisplayName("staff may book inside the notice period, which a customer may not")
    void bypassesMinimumNotice() {
        // Half an hour from now: comfortably inside any sane notice window, and the entire
        // reason somebody rings the club rather than using the website.
        var soon = clubClock.now().plus(java.time.Duration.ofMinutes(30));
        Map<String, Object> body = new HashMap<>(
                request("shortnotice@test.local", 0, 0, 60));
        body.put("date", clubClock.toLocalDate(soon).toString());
        body.put("startTime", clubClock.toLocalTime(soon).withSecond(0).withNano(0).toString());

        ResponseEntity<Map> response =
                admin.post("/api/admin/bookings/telephone", body, Map.class);

        // 201 or a club-closed refusal depending on the hour the suite runs; what must never
        // happen is a notice-period rejection.
        if (response.getStatusCode().value() != 201) {
            assertThat(String.valueOf(response.getBody()))
                    .as("staff must never be refused for insufficient notice")
                    .doesNotContain("INSUFFICIENT_NOTICE");
        } else {
            assertThat(response.getBody().get("status")).isEqualTo("CONFIRMED");
        }
    }

    @Test
    @DisplayName("staff still cannot double-book a table")
    void cannotDoubleBook() {
        admin.post("/api/admin/bookings/telephone", request("first@test.local", 16, 0, 60), Map.class);

        ResponseEntity<Map> second = admin.post(
                "/api/admin/bookings/telephone", request("second@test.local", 16, 0, 60), Map.class);

        // Refused, and the code says why. 422 rather than 409 because the validator's advisory
        // pre-check sees the clash first and produces the readable message; 409 is reserved for
        // the genuine race, where two concurrent inserts reach the EXCLUDE constraint and the
        // database adjudicates. Both carry SLOT_UNAVAILABLE, which is what the client acts on,
        // so this asserts the code rather than pinning the status of whichever layer won.
        assertThat(second.getStatusCode().value()).isIn(409, 422);
        assertThat(String.valueOf(second.getBody())).contains("SLOT_UNAVAILABLE");
        assertThat(bookingCount())
                .as("overlap is not a policy staff may override")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("staff still cannot book over maintenance")
    void cannotBookOverMaintenance() {
        fixtures.aMaintenanceBlock(
                tableId,
                clubClock.toInstant(day, LocalTime.of(14, 0)),
                clubClock.toInstant(day, LocalTime.of(18, 0)),
                "Re-clothing");

        ResponseEntity<Map> response = admin.post(
                "/api/admin/bookings/telephone", request("blocked@test.local", 15, 0, 60), Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(422);
        assertThat(bookingCount()).isZero();
    }

    @Test
    @DisplayName("staff still cannot book an inactive table")
    void cannotBookInactiveTable() {
        long retired = fixtures.anInactiveTable("Retired Table");
        Map<String, Object> body = new HashMap<>(request("inactive@test.local", 14, 0, 60));
        body.put("tableId", retired);

        ResponseEntity<Map> response =
                admin.post("/api/admin/bookings/telephone", body, Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(422);
    }

    @Test
    @DisplayName("a malformed email is refused before any account is created")
    void rejectsMalformedEmail() {
        Map<String, Object> body = new HashMap<>(request("not-an-email", 14, 0, 60));

        ResponseEntity<Map> response =
                admin.post("/api/admin/bookings/telephone", body, Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(bookingCount()).isZero();
    }

    private Map<String, Object> request(String email, int hour, int minute, int minutes) {
        Map<String, Object> body = new HashMap<>();
        body.put("tableId", tableId);
        body.put("date", day.toString());
        body.put("startTime", LocalTime.of(hour, minute).toString());
        body.put("durationMinutes", minutes);
        body.put("customerEmail", email);
        body.put("firstName", "Phone");
        body.put("lastName", "Caller");
        body.put("customerPhone", "07700 900999");
        return body;
    }

    private int userCountFor(String email) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM app_user WHERE email = ?", Integer.class, email);
    }

    private String passwordHashFor(String email) {
        return jdbcTemplate.queryForObject(
                "SELECT password_hash FROM app_user WHERE email = ?", String.class, email);
    }

    private int bookingCount() {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM booking", Integer.class);
    }
}
