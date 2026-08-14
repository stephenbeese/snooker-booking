package uk.co.club.booking.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.HttpClient;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * The authorisation boundary, over real HTTP.
 *
 * <p>Phase 4's hard gate. Two distinct properties, both of which have to hold:
 *
 * <ol>
 *   <li><strong>Role boundary</strong> — an anonymous visitor and a signed-in customer are both
 *       refused every admin endpoint. Enumerated as a matrix rather than spot-checked, because
 *       the realistic failure is a <em>new</em> endpoint added under a path nobody re-tested.
 *   <li><strong>IDOR</strong> — a customer cannot read or act on another customer's booking by
 *       guessing its reference, and the refusal leaks nothing about whether it exists.
 * </ol>
 *
 * <p>Driven through the running server rather than through MockMvc: the checks under test are
 * implemented by the Spring Security filter chain, and calling controllers directly would bypass
 * the very layer being asserted.
 */
// Spring Boot 4 no longer registers TestRestTemplate just because the web environment is a real
// one; the bean comes from spring-boot-resttestclient and this annotation is what switches its
// auto-configuration on.
@AutoConfigureTestRestTemplate
class AuthorizationBoundaryIT extends AbstractIntegrationTest {

    private static final String CUSTOMER_PASSWORD = "CustomerPass123!";
    private static final String ADMIN_PASSWORD = "AdminPass123!";
    private static final String STAFF_PASSWORD = "StaffPass123!";

    @Autowired private TestRestTemplate rest;
    @Autowired private IntegrationFixtures fixtures;

    private long tableId;
    private String victimReference;

    /** A valid full week, so the opening-hours PUT is exercised rather than 400-ing on shape. */
    private static final List<Map<String, Object>> ALL_SEVEN_DAYS = List.of(
            day("MONDAY"), day("TUESDAY"), day("WEDNESDAY"), day("THURSDAY"),
            day("FRIDAY"), day("SATURDAY"), day("SUNDAY"));

    private static Map<String, Object> day(String name) {
        return Map.of("day", name, "closed", false, "openTime", "10:00:00", "closeTime", "23:00:00");
    }

    private static final Map<String, Object> DEFAULT_RULES = Map.of(
            "minDurationMinutes", 30,
            "maxDurationMinutes", 240,
            "incrementMinutes", 30,
            "minNoticeMinutes", 60,
            "maxAdvanceDays", 30,
            "cancellationNoticeHours", 24,
            "paymentHoldMinutes", 15);

    private static final Map<String, Object> CATCH_ALL_RULE = Map.of(
            "name", "Standard hourly rate",
            "hourlyRatePence", 1200,
            "priority", 0,
            "active", true);

    /**
     * The day job: what someone working the counter needs. STAFF and ADMIN both reach these.
     *
     * <p>Kept separate from {@link #ADMIN_ONLY_ENDPOINTS} because the STAFF matrix has to
     * assert both halves — that STAFF get in here, and that they are refused there. A single
     * combined list could only ever test one of the two.
     */
    private static final List<Endpoint> STAFF_ENDPOINTS = List.of(
            new Endpoint(HttpMethod.GET, "/api/admin/dashboard", null),
            new Endpoint(HttpMethod.GET, "/api/admin/bookings", null),
            new Endpoint(HttpMethod.GET, "/api/admin/bookings/day", null),
            // The staff availability grid. It answers under BookingPolicy.staff() — notice
            // and advance limits lifted — so a customer reaching it would be handed slots the
            // public endpoint deliberately withholds from them.
            new Endpoint(HttpMethod.GET, "/api/admin/availability?date=2030-01-02", null),
            new Endpoint(HttpMethod.GET, "/api/admin/bookings/SNK-VICTIM", null),
            new Endpoint(
                    HttpMethod.POST,
                    "/api/admin/bookings/SNK-VICTIM/cancel",
                    Map.of("reason", "test")),
            // Taking money at the counter, and waiving it. Staff rather than admin because
            // settling up as a customer walks in is the job the role exists for.
            new Endpoint(
                    HttpMethod.POST,
                    "/api/admin/bookings/SNK-VICTIM/payment",
                    Map.of("status", "PAID_AT_COUNTER")),
            // A telephone booking commits a slot and records what is owed at the counter, and
            // table/maintenance changes alter what the whole club can sell — all strictly staff.
            new Endpoint(
                    HttpMethod.POST,
                    "/api/admin/bookings/telephone",
                    Map.of(
                            "tableId", 1,
                            "date", "2030-01-01",
                            "startTime", "14:00:00",
                            "durationMinutes", 60,
                            "customerEmail", "boundary@test.local",
                            "firstName", "Bound",
                            "lastName", "Ary")),
            new Endpoint(
                    HttpMethod.GET, "/api/admin/maintenance-blocks?from=2030-01-01&to=2030-01-02", null),
            new Endpoint(
                    HttpMethod.POST,
                    "/api/admin/maintenance-blocks",
                    Map.of(
                            "tableId", 1,
                            "date", "2030-01-01",
                            "startTime", "14:00:00",
                            "endTime", "18:00:00")),
            new Endpoint(HttpMethod.DELETE, "/api/admin/maintenance-blocks/1", null),
            // The customer directory. Staff rather than admin because "when is this caller in
            // next" is a counter question — and deliberately a separate path from
            // /api/admin/users, which is admin-only precisely so that reaching customers does
            // not also hand out the account directory.
            new Endpoint(HttpMethod.GET, "/api/admin/customers", null),
            new Endpoint(HttpMethod.GET, "/api/admin/customers/1", null));

    /**
     * Configuring the club, and deciding who may do so. ADMIN only.
     *
     * <p>The users endpoints are the load-bearing ones. A STAFF member who could reach
     * {@code PUT /api/admin/users/{id}/role} could make themselves ADMIN, and every other
     * line in this list would become advisory.
     */
    private static final List<Endpoint> ADMIN_ONLY_ENDPOINTS = List.of(
            new Endpoint(HttpMethod.GET, "/api/admin/tables", null),
            new Endpoint(
                    HttpMethod.POST,
                    "/api/admin/tables",
                    Map.of("name", "Boundary New Table", "tableType", "SNOOKER", "displayOrder", 9)),
            new Endpoint(
                    HttpMethod.PUT,
                    "/api/admin/tables/1",
                    Map.of("name", "Renamed", "tableType", "SNOOKER", "displayOrder", 1)),
            new Endpoint(HttpMethod.PUT, "/api/admin/tables/1/active?active=false", null),
            new Endpoint(HttpMethod.GET, "/api/admin/users", null),
            new Endpoint(HttpMethod.GET, "/api/admin/users/1", null),
            new Endpoint(
                    HttpMethod.POST,
                    "/api/admin/users",
                    Map.of(
                            "email", "boundary-new-staff@test.local",
                            "password", "BoundaryPass123!",
                            "firstName", "Bound",
                            "lastName", "Ary",
                            "role", "STAFF")),
            new Endpoint(HttpMethod.PUT, "/api/admin/users/1/role", Map.of("role", "ADMIN")),
            new Endpoint(HttpMethod.PUT, "/api/admin/users/1/active?active=true", null),
            new Endpoint(
                    HttpMethod.PUT,
                    "/api/admin/users/1/password",
                    Map.of("password", "BoundaryPass123!")),
            // Phase 6. Settings decide what the whole club can sell and what it charges, so
            // they are the most consequential writes in the admin area.
            new Endpoint(HttpMethod.GET, "/api/admin/settings/club", null),
            new Endpoint(
                    HttpMethod.PUT, "/api/admin/settings/club", Map.of("name", "Boundary Club")),
            new Endpoint(HttpMethod.GET, "/api/admin/settings/opening-hours", null),
            new Endpoint(
                    HttpMethod.PUT,
                    "/api/admin/settings/opening-hours",
                    Map.of("days", ALL_SEVEN_DAYS)),
            new Endpoint(HttpMethod.GET, "/api/admin/settings/booking-rules", null),
            new Endpoint(HttpMethod.PUT, "/api/admin/settings/booking-rules", DEFAULT_RULES),
            new Endpoint(HttpMethod.GET, "/api/admin/settings/pricing-rules", null),
            new Endpoint(HttpMethod.POST, "/api/admin/settings/pricing-rules", CATCH_ALL_RULE),
            new Endpoint(HttpMethod.PUT, "/api/admin/settings/pricing-rules/1", CATCH_ALL_RULE),
            // Deliberately an id that will not exist: the admin sweep asserts "not a 4xx that
            // means refused", and deleting the seeded catch-all rule would break every later
            // test in the class by leaving the club unable to price anything.
            new Endpoint(HttpMethod.DELETE, "/api/admin/settings/pricing-rules/999999", null));

    /**
     * Every admin path, so a new one added without a test still has to pass this list.
     *
     * <p>The union of both tiers, built rather than written out again: a third copy of these
     * endpoints is a third place to forget one, and the sweeps that use it — anonymous and
     * customer — care only that nothing under /api/admin is reachable, not which tier it is in.
     */
    private static final List<Endpoint> ADMIN_ENDPOINTS =
            Stream.concat(STAFF_ENDPOINTS.stream(), ADMIN_ONLY_ENDPOINTS.stream()).toList();

    /** Endpoints any signed-in user may reach, but an anonymous one may not. */
    private static final List<Endpoint> CUSTOMER_ENDPOINTS = List.of(
            new Endpoint(HttpMethod.GET, "/api/bookings", null),
            new Endpoint(HttpMethod.GET, "/api/profile", null));

    /** Endpoints that must stay open, or the club cannot sell anything. */
    private static final List<Endpoint> PUBLIC_ENDPOINTS = List.of(
            new Endpoint(HttpMethod.GET, "/api/health", null),
            new Endpoint(HttpMethod.GET, "/api/club", null),
            new Endpoint(HttpMethod.GET, "/api/tables", null),
            new Endpoint(HttpMethod.GET, "/api/auth/me", null));

    private record Endpoint(HttpMethod method, String path, Object body) {
        @Override
        public String toString() {
            return method + " " + path;
        }
    }

    @BeforeEach
    void seedPeopleAndABooking() {
        tableId = fixtures.aTable("Boundary Table");
        long victimId = fixtures.aCustomer("victim@test.local", CUSTOMER_PASSWORD);
        fixtures.aCustomer("attacker@test.local", CUSTOMER_PASSWORD);
        fixtures.anAdmin("boundary-admin@test.local", ADMIN_PASSWORD);
        fixtures.aUser("boundary-staff@test.local", STAFF_PASSWORD, "STAFF");

        Instant start = Instant.now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
        fixtures.aBooking("SNK-VICTIM", tableId, start, 60, "CONFIRMED", victimId, null);
        victimReference = "SNK-VICTIM";
    }

    @Test
    @DisplayName("an anonymous visitor is refused every admin endpoint")
    void anonymousCannotReachAdmin() {
        HttpClient anonymous = HttpClient.anonymous(rest);

        List<String> allowed = new ArrayList<>();
        for (Endpoint endpoint : ADMIN_ENDPOINTS) {
            int status = anonymous.statusOf(endpoint.method(), endpoint.path(), endpoint.body());
            // 401 (not signed in) is the correct answer. Anything in the 2xx range is a breach;
            // a 404 or 500 would mean the request reached application code it should not have.
            if (status != 401) {
                allowed.add(endpoint + " -> " + status);
            }
        }

        assertThat(allowed).as("admin endpoints reachable while anonymous").isEmpty();
    }

    @Test
    @DisplayName("a signed-in customer is refused every admin endpoint")
    void customerCannotReachAdmin() {
        HttpClient customer =
                HttpClient.anonymous(rest).login("attacker@test.local", CUSTOMER_PASSWORD);

        // Guards the assertion below: if the session were not travelling, every admin endpoint
        // would answer 401 and the test would be asserting "anonymous is refused" all over
        // again while appearing to test the customer boundary.
        assertThat(customer.get("/api/bookings", String.class).getStatusCode().value())
                .as("customer session is established")
                .isEqualTo(200);

        List<String> allowed = new ArrayList<>();
        for (Endpoint endpoint : ADMIN_ENDPOINTS) {
            int status = customer.statusOf(endpoint.method(), endpoint.path(), endpoint.body());
            // 403: authenticated, but not entitled.
            if (status != 403) {
                allowed.add(endpoint + " -> " + status);
            }
        }

        assertThat(allowed).as("admin endpoints reachable as a customer").isEmpty();

        // And the booking really is still live — proving the refusals above were refusals, not
        // an endpoint that happens to fail for an unrelated reason after doing the work.
        assertThat(statusOfBooking(victimReference)).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("an admin reaches every admin endpoint")
    void adminIsAdmitted() {
        HttpClient admin =
                HttpClient.anonymous(rest).login("boundary-admin@test.local", ADMIN_PASSWORD);

        List<String> refused = new ArrayList<>();
        for (Endpoint endpoint : ADMIN_ENDPOINTS) {
            int status = admin.statusOf(endpoint.method(), endpoint.path(), endpoint.body());
            if (status == 401 || status == 403) {
                refused.add(endpoint + " -> " + status);
            }
        }

        // The mirror image of the tests above. Without it, a filter chain that denied everything
        // to everybody would pass them both and lock staff out of their own club.
        assertThat(refused).as("admin endpoints refused to an admin").isEmpty();
    }

    @Test
    @DisplayName("a staff member reaches the day job")
    void staffIsAdmitted() {
        // The half of the STAFF split that is easy to get wrong in the safe direction: a
        // matcher that denied everything would pass the refusal test below and leave the
        // counter unable to take a booking.
        HttpClient staff =
                HttpClient.anonymous(rest).login("boundary-staff@test.local", STAFF_PASSWORD);

        List<String> refused = new ArrayList<>();
        for (Endpoint endpoint : STAFF_ENDPOINTS) {
            int status = staff.statusOf(endpoint.method(), endpoint.path(), endpoint.body());
            if (status == 401 || status == 403) {
                refused.add(endpoint + " -> " + status);
            }
        }

        assertThat(refused).as("staff endpoints refused to a staff member").isEmpty();
    }

    @Test
    @DisplayName("a staff member cannot configure the club or hand out roles")
    void staffCannotReachAdminOnly() {
        // The half that matters for security. 403 specifically, not merely "not 2xx": a 401
        // would send the SPA to the login page, where signing in again changes nothing
        // because the session was never the problem.
        HttpClient staff =
                HttpClient.anonymous(rest).login("boundary-staff@test.local", STAFF_PASSWORD);

        List<String> allowed = new ArrayList<>();
        for (Endpoint endpoint : ADMIN_ONLY_ENDPOINTS) {
            int status = staff.statusOf(endpoint.method(), endpoint.path(), endpoint.body());
            if (status != 403) {
                allowed.add(endpoint + " -> " + status);
            }
        }

        assertThat(allowed)
                .as("admin-only endpoints reachable by staff — a staff member who reaches "
                        + "/api/admin/users/{id}/role can make themselves an admin")
                .isEmpty();
    }

    @Test
    @DisplayName("an anonymous visitor is refused customer endpoints but keeps the public ones")
    void anonymousBoundary() {
        HttpClient anonymous = HttpClient.anonymous(rest);

        List<String> leaked = new ArrayList<>();
        for (Endpoint endpoint : CUSTOMER_ENDPOINTS) {
            int status = anonymous.statusOf(endpoint.method(), endpoint.path(), endpoint.body());
            if (status != 401) {
                leaked.add(endpoint + " -> " + status);
            }
        }
        assertThat(leaked).as("customer endpoints reachable while anonymous").isEmpty();

        List<String> blocked = new ArrayList<>();
        for (Endpoint endpoint : PUBLIC_ENDPOINTS) {
            int status = anonymous.statusOf(endpoint.method(), endpoint.path(), endpoint.body());
            if (status >= 400) {
                blocked.add(endpoint + " -> " + status);
            }
        }
        // Browsing must not require an account: this is the conversion path, and locking it
        // would be as much a defect as leaving admin open.
        assertThat(blocked).as("public endpoints blocked").isEmpty();
    }

    @Test
    @DisplayName("an inactive table is hidden from customers but visible to staff")
    void inactiveTablesAreStaffOnly() {
        fixtures.anInactiveTable("Retired Table");

        String publicView =
                HttpClient.anonymous(rest).get("/api/tables", String.class).getBody();
        String staffView = HttpClient.anonymous(rest)
                .login("boundary-admin@test.local", ADMIN_PASSWORD)
                .get("/api/tables", String.class)
                .getBody();

        assertThat(publicView).doesNotContain("Retired Table");
        assertThat(publicView).contains("Boundary Table");
        // Staff still need it: a deactivated table has history to filter and report on.
        assertThat(staffView).contains("Retired Table");
    }

    @Test
    @DisplayName("a customer cannot read another customer's booking, and is told nothing about it")
    void idorOnRead() {
        HttpClient attacker =
                HttpClient.anonymous(rest).login("attacker@test.local", CUSTOMER_PASSWORD);

        ResponseEntity<String> response =
                attacker.get("/api/bookings/" + victimReference, String.class);

        // 404, not 403. A 403 confirms the reference exists, which turns this endpoint into an
        // oracle for enumerating the club's entire booking table one guess at a time.
        assertThat(response.getStatusCode().value()).isEqualTo(404);

        // The body must not leak by another route either: no name, no email, no times.
        String body = response.getBody() == null ? "" : response.getBody();
        assertThat(body).doesNotContain("Fixture Customer");
        assertThat(body).doesNotContain("victim@test.local");
        assertThat(body).doesNotContain("Boundary Table");
    }

    @Test
    @DisplayName("a customer cannot cancel another customer's booking")
    void idorOnCancel() {
        HttpClient attacker =
                HttpClient.anonymous(rest).login("attacker@test.local", CUSTOMER_PASSWORD);

        int status = attacker.statusOf(
                HttpMethod.POST,
                "/api/bookings/" + victimReference + "/cancel",
                Map.of("reason", "not mine"));

        assertThat(status).isEqualTo(404);
        // The decisive assertion: the refusal must be a refusal, not a 404 rendered after the
        // cancellation already committed.
        assertThat(statusOfBooking(victimReference)).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("a customer's own booking list contains only their own bookings")
    void listIsScopedToTheCaller() {
        HttpClient attacker =
                HttpClient.anonymous(rest).login("attacker@test.local", CUSTOMER_PASSWORD);

        String body = attacker.get("/api/bookings", String.class).getBody();

        assertThat(body).isNotNull();
        // The attacker has no bookings; the victim's must not appear in the list either.
        assertThat(body).doesNotContain(victimReference);
    }

    @Test
    @DisplayName("a write without a CSRF token is rejected")
    void csrfIsEnforced() {
        // Deliberately bypasses HttpClient, which echoes the token like a real browser. A
        // cross-site form post has the session cookie but cannot read the token cookie, and
        // that difference is the entire protection.
        HttpClient customer =
                HttpClient.anonymous(rest).login("victim@test.local", CUSTOMER_PASSWORD);

        ResponseEntity<String> response = rest.exchange(
                "/api/bookings/" + victimReference + "/cancel",
                HttpMethod.POST,
                new org.springframework.http.HttpEntity<>(Map.of("reason", "csrf")),
                String.class);

        assertThat(response.getStatusCode().value()).isIn(401, 403);
        assertThat(statusOfBooking(victimReference)).isEqualTo("CONFIRMED");
        // Keeps the client referenced so the session it established is genuinely in play.
        assertThat(customer).isNotNull();

        // No error envelope on a CSRF rejection. The client uses exactly this to tell "your
        // token is stale, fetch a new one and retry" apart from "you may not do this" — and a
        // body here would make a recoverable failure look permanent to the user.
        assertThat(response.getBody()).isNullOrEmpty();
    }

    @Test
    @DisplayName("a role refusal explains itself, so the client does not retry it")
    void roleRefusalCarriesAnEnvelope() {
        HttpClient customer =
                HttpClient.anonymous(rest).login("attacker@test.local", CUSTOMER_PASSWORD);

        ResponseEntity<String> response = customer.get("/api/admin/dashboard", String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        // The mirror image of the CSRF case above: this one is a decision about the user and
        // will not change on a retry, so it says so.
        assertThat(response.getBody()).contains("ACCESS_DENIED");
    }

    @Test
    @DisplayName("an admin may cancel a booking belonging to someone else")
    void adminMayActOnAnyBooking() {
        HttpClient admin =
                HttpClient.anonymous(rest).login("boundary-admin@test.local", ADMIN_PASSWORD);

        int status = admin.statusOf(
                HttpMethod.POST,
                "/api/admin/bookings/" + victimReference + "/cancel",
                Map.of("reason", "Customer rang the club"));

        assertThat(status).isEqualTo(200);
        assertThat(statusOfBooking(victimReference)).isEqualTo("CANCELLED");
    }

    private String statusOfBooking(String reference) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM booking WHERE reference = ?", String.class, reference);
    }
}
