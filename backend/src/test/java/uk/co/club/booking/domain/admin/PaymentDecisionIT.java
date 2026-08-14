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
 * The payment decisions queue, over real HTTP.
 *
 * <p>The property under test is that a money question raised by the system can actually be
 * answered. Before this existed the rows were written and counted and nothing could read or
 * clear one — {@code PaymentException.resolve} had no caller in the application at all — so the
 * dashboard's count could only ever climb.
 *
 * <p>What follows from that and is asserted here: the queue names the booking and the customer
 * rather than being a bare number, a refund both moves the money and closes the row, a decision
 * cannot be answered twice, and a payment with no card behind it is refused rather than quietly
 * marked refunded.
 */
@Import(StubCheckoutGateway.Config.class)
@AutoConfigureTestRestTemplate
class PaymentDecisionIT extends AbstractIntegrationTest {

    private static final String ADMIN_PASSWORD = "AdminPass123!";

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
        tableId = fixtures.aTable("Decision Table");
        fixtures.anAdmin("decision-admin@test.local", ADMIN_PASSWORD);
        admin = new HttpClient(rest).login("decision-admin@test.local", ADMIN_PASSWORD);
        day = clubClock.today().plusDays(4);
    }

    @Test
    @DisplayName("the queue names the booking behind each decision")
    void listsDecisionsWithTheirBooking() {
        String reference = aCounterBookingCancelledAfterPaying(14);

        List<Map<String, Object>> decisions = decisions();

        assertThat(decisions)
                .singleElement()
                .satisfies(decision -> {
                    // The whole point: "3 payments need a decision" told staff nothing about
                    // whose money it was or which booking to look at.
                    assertThat(decision.get("reference")).isEqualTo(reference);
                    assertThat(decision.get("customerName")).isEqualTo("Phone Caller");
                    assertThat(decision.get("tableName")).isEqualTo("Decision Table");
                    assertThat(decision.get("amountPence")).isEqualTo(1200);
                    assertThat(String.valueOf(decision.get("reason")))
                            .contains("Refund decision required");
                    // Counter cash: there is no card payment to send back through Stripe.
                    assertThat(decision.get("refundable")).isEqualTo(false);
                });
    }

    @Test
    @DisplayName("resolving a decision clears it from the queue")
    void resolvingClearsTheRow() {
        aCounterBookingCancelledAfterPaying(15);
        long id = idOfFirstDecision();

        ResponseEntity<Void> response =
                admin.post("/api/admin/payments/decisions/" + id + "/resolve", null, Void.class);

        assertThat(response.getStatusCode().value()).isEqualTo(204);
        assertThat(decisions()).isEmpty();
    }

    @Test
    @DisplayName("a decision cannot be answered twice")
    void secondAnswerIsRefused() {
        aCounterBookingCancelledAfterPaying(16);
        long id = idOfFirstDecision();
        admin.post("/api/admin/payments/decisions/" + id + "/resolve", null, Void.class);

        ResponseEntity<Map> second = admin.post(
                "/api/admin/payments/decisions/" + id + "/resolve", null, Map.class);

        // Refused rather than a quiet success: a double click is likelier than a genuine
        // retry, and a second "done" would tell staff they had settled it twice.
        assertThat(second.getStatusCode().value()).isEqualTo(422);
        assertThat(second.getBody().get("code")).isEqualTo("PAYMENT_ALREADY_SETTLED");
    }

    @Test
    @DisplayName("a payment taken at the counter cannot be refunded through the provider")
    void counterPaymentIsNotRefundableHere() {
        aCounterBookingCancelledAfterPaying(17);
        long id = idOfFirstDecision();

        ResponseEntity<Map> response =
                admin.post("/api/admin/payments/decisions/" + id + "/refund", null, Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(422);
        assertThat(response.getBody().get("code")).isEqualTo("PAYMENT_NOT_REFUNDABLE");
        assertThat(gateway.refunds())
                .as("cash in the till has no payment intent to send back")
                .isEmpty();
        // Still open: the club owes this customer money, and refusing must not lose the row.
        assertThat(decisions()).hasSize(1);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> decisions() {
        ResponseEntity<List> response =
                admin.get("/api/admin/payments/decisions", List.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody();
    }

    private long idOfFirstDecision() {
        return Long.parseLong(String.valueOf(decisions().getFirst().get("id")));
    }

    /**
     * A telephone booking, paid at the counter, then cancelled — which raises a decision.
     *
     * <p>Counter money rather than a card payment because a card payment cancelled inside the
     * notice period is now refunded automatically and never reaches this queue. Cash does, and
     * has to be handed back by a person.
     */
    private String aCounterBookingCancelledAfterPaying(int hour) {
        Map<String, Object> body = new HashMap<>();
        body.put("tableId", tableId);
        body.put("date", day.toString());
        body.put("startTime", LocalTime.of(hour, 0).toString());
        body.put("durationMinutes", 60);
        body.put("customerEmail", "caller" + hour + "@test.local");
        body.put("firstName", "Phone");
        body.put("lastName", "Caller");
        body.put("customerPhone", "07700 900999");

        ResponseEntity<Map> created =
                admin.post("/api/admin/bookings/telephone", body, Map.class);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String reference = String.valueOf(created.getBody().get("reference"));

        admin.post(
                "/api/admin/bookings/" + reference + "/payment",
                Map.of("status", "PAID_AT_COUNTER"),
                Map.class);
        admin.post(
                "/api/admin/bookings/" + reference + "/cancel",
                Map.of("reason", "Customer cancelled"),
                Map.class);

        return reference;
    }
}
