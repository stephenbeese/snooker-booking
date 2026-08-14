package uk.co.club.booking.domain.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.HttpClient;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * The customer directory over real HTTP.
 *
 * <p>Two things are worth a test here, and neither is "the list returns rows".
 *
 * <p>The first is the <strong>boundary between customers and accounts</strong>. This endpoint
 * exists as a separate path from {@code /api/admin/users} so that STAFF can look a caller up
 * without gaining the account directory. That separation is only real if the endpoint refuses
 * to return staff and admin rows — otherwise it is the same directory reached by a different
 * URL, and {@code AuthorizationBoundaryIT} would be guarding a door with no wall beside it.
 *
 * <p>The second is <strong>search escaping</strong>. A search for {@code %} must match the
 * literal character. Without escaping it matches every customer the club has, which reads as a
 * working screen right up until someone notices the results ignore what they typed.
 */
@AutoConfigureTestRestTemplate
class AdminCustomerIT extends AbstractIntegrationTest {

    private static final String PASSWORD = "AdminPass123!";

    @Autowired private TestRestTemplate rest;
    @Autowired private IntegrationFixtures fixtures;

    private HttpClient admin;
    private long tableId;

    @BeforeEach
    void setUp() {
        tableId = fixtures.aTable("Customer Table");
        fixtures.anAdmin("customers-admin@test.local", PASSWORD);
        admin = new HttpClient(rest).login("customers-admin@test.local", PASSWORD);
    }

    @Test
    @DisplayName("lists customers with how many bookings each has")
    void listsCustomersWithBookingCounts() {
        long withTwo = fixtures.aCustomer("counted@test.local", PASSWORD);
        fixtures.aCustomer("never-booked@test.local", PASSWORD);
        aBookingFor(withTwo, "SNK-CUST01", 2);
        aBookingFor(withTwo, "SNK-CUST02", 3);

        Map<String, Object> body = listCustomers("");
        List<Map<String, Object>> items = items(body);

        assertThat(counted(items, "counted@test.local")).isEqualTo(2);
        // Zero rather than absent: a customer who has never booked has no rows to group, so
        // the count map has no entry for them. If that were read as "missing", the screen
        // would either omit them or show a blank where a number belongs.
        assertThat(counted(items, "never-booked@test.local")).isEqualTo(0);
    }

    @Test
    @DisplayName("never returns staff or admin accounts")
    void excludesStaffAndAdmins() {
        fixtures.aCustomer("a-customer@test.local", PASSWORD);
        fixtures.aUser("a-staffer@test.local", PASSWORD, "STAFF");

        List<Map<String, Object>> items = items(listCustomers(""));
        List<String> emails = items.stream().map(item -> (String) item.get("email")).toList();

        assertThat(emails).contains("a-customer@test.local");
        // The admin created in setUp and the staff account above. Reaching either through this
        // endpoint would mean the customer/account split is cosmetic.
        assertThat(emails)
                .doesNotContain("a-staffer@test.local")
                .doesNotContain("customers-admin@test.local");
    }

    @Test
    @DisplayName("refuses to open a staff account as a customer record")
    void refusesStaffById() {
        long staffId = fixtures.aUser("hidden-staffer@test.local", PASSWORD, "STAFF");

        ResponseEntity<Map> response = admin.get("/api/admin/customers/" + staffId, Map.class);

        // Not found rather than forbidden: the row exists, but it is not a customer, and
        // "forbidden" would confirm to whoever probed the id that an account sits behind it.
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    @DisplayName("returns one customer with their bookings, newest first")
    void returnsCustomerWithBookings() {
        long customerId = fixtures.aCustomer("detail@test.local", PASSWORD);
        aBookingFor(customerId, "SNK-DETAIL1", 2);
        aBookingFor(customerId, "SNK-DETAIL2", 5);

        ResponseEntity<Map> response =
                admin.get("/api/admin/customers/" + customerId, Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> customer = (Map<String, Object>) response.getBody().get("customer");
        assertThat(customer.get("email")).isEqualTo("detail@test.local");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> bookings =
                (List<Map<String, Object>>) response.getBody().get("bookings");
        // Newest first, so the reference booked five days out leads. Staff open this record to
        // answer "when are they next in", and the answer should not be at the bottom.
        assertThat(bookings).hasSize(2);
        assertThat(bookings.get(0).get("reference")).isEqualTo("SNK-DETAIL2");

        // The password hash must not be anywhere on this response, on either half of it.
        assertThat(customer).doesNotContainKey("passwordHash");
        assertThat(response.getBody().toString()).doesNotContain("$2a$");
    }

    @Test
    @DisplayName("treats a wildcard in the search term as a literal character")
    void escapesSearchWildcards() {
        fixtures.aCustomer("percent@test.local", PASSWORD);
        fixtures.aCustomer("another@test.local", PASSWORD);

        // Unescaped, "%" is the LIKE wildcard and matches every customer in the club.
        assertThat(items(listCustomers("%"))).isEmpty();
    }

    /** A confirmed booking that many days out, so ordering is unambiguous. */
    private void aBookingFor(long customerId, String reference, int daysAhead) {
        fixtures.aBooking(
                reference,
                tableId,
                Instant.now().plus(daysAhead, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS),
                60,
                "CONFIRMED",
                customerId,
                null);
    }

    private Map<String, Object> listCustomers(String search) {
        ResponseEntity<Map> response =
                admin.get("/api/admin/customers?size=100&search=" + search, Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> items(Map<String, Object> body) {
        return (List<Map<String, Object>>) body.get("items");
    }

    private int counted(List<Map<String, Object>> items, String email) {
        return items.stream()
                .filter(item -> email.equals(item.get("email")))
                .findFirst()
                .map(item -> ((Number) item.get("bookingCount")).intValue())
                .orElseThrow(() -> new AssertionError("No customer row for " + email));
    }
}
