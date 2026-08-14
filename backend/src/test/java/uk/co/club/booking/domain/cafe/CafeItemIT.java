package uk.co.club.booking.domain.cafe;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.HttpClient;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * The cafe menu, over real HTTP.
 *
 * <p>Phase 9. The properties worth asserting are the ones that would cost the club money or
 * history if they broke: a price is stored as the integer pence it was sent as, a withdrawn item
 * is still there afterwards, and neither a negative price nor a duplicate name gets through as a
 * 500.
 */
@AutoConfigureTestRestTemplate
class CafeItemIT extends AbstractIntegrationTest {

    private static final String ADMIN_PASSWORD = "AdminPass123!";

    @Autowired private TestRestTemplate rest;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private JdbcTemplate jdbc;

    private HttpClient admin;

    @BeforeEach
    void signIn() {
        fixtures.anAdmin("cafe-admin@test.local", ADMIN_PASSWORD);
        admin = HttpClient.anonymous(rest).login("cafe-admin@test.local", ADMIN_PASSWORD);
    }

    @Test
    @DisplayName("a price is stored as the integer pence it was sent as")
    void storesPriceAsIntegerPence() {
        // £2.75. The figure matters: 275/100 is exact in binary, but 2.75 * 100 through a float
        // column is where a penny goes missing, and reading the column back is the only way to
        // see whether that happened.
        long id = createItem(Map.of("name", "Flat white", "pricePence", 275));

        Integer stored =
                jdbc.queryForObject("SELECT price_pence FROM cafe_item WHERE id = ?", Integer.class, id);
        assertThat(stored).isEqualTo(275);

        // Round-trips over the wire as pence too, not as a formatted string.
        assertThat(listItems()).anySatisfy(item -> {
            assertThat(item.get("name")).isEqualTo("Flat white");
            assertThat(item.get("pricePence")).isEqualTo(275);
        });
    }

    @Test
    @DisplayName("free is allowed, negative is refused by name rather than by stack trace")
    void refusesNegativePrice() {
        // Zero is a real price — tap water, a birthday slice — so the guard must not be "> 0".
        assertThat(admin.statusOf(
                        HttpMethod.POST,
                        "/api/admin/cafe/items",
                        Map.of("name", "Tap water", "pricePence", 0)))
                .isEqualTo(201);

        ResponseEntity<String> refused = admin.post(
                "/api/admin/cafe/items",
                Map.of("name", "Impossible", "pricePence", -1),
                String.class);

        // 400 with a per-field message, which is what every other malformed body gets here — the
        // bean-validation annotation answers before the request reaches the service. The service
        // keeps its own guard for callers that never cross HTTP, but 400 is the API contract and
        // asserting 422 would be asserting a second, contradictory one.
        assertThat(refused.getStatusCode().value()).isEqualTo(400);
        assertThat(refused.getBody()).contains("pricePence").contains("cannot be negative");
        // A stack trace here would mean the CHECK constraint caught it instead of validation.
        assertThat(refused.getBody()).doesNotContain("Exception").doesNotContain("uk.co.club");
    }

    @Test
    @DisplayName("a duplicate name is a 422, not a 500 from the unique constraint")
    void refusesDuplicateName() {
        createItem(Map.of("name", "Lager", "pricePence", 480));

        ResponseEntity<String> refused = admin.post(
                "/api/admin/cafe/items", Map.of("name", "Lager", "pricePence", 500), String.class);

        assertThat(refused.getStatusCode().value()).isEqualTo(422);
        assertThat(refused.getBody()).contains("already on the menu");
    }

    @Test
    @DisplayName("deactivating keeps the row, so a withdrawn item stays explicable")
    void deactivatesRatherThanDeletes() {
        long id = createItem(Map.of("name", "Discontinued crisps", "pricePence", 120));

        assertThat(admin.statusOf(
                        HttpMethod.PUT, "/api/admin/cafe/items/" + id + "/active?active=false", null))
                .isEqualTo(200);

        Integer surviving =
                jdbc.queryForObject("SELECT COUNT(*) FROM cafe_item WHERE id = ?", Integer.class, id);
        assertThat(surviving).isEqualTo(1);

        // And it is still listed for staff, marked inactive — invisible would leave them unable
        // to put it back.
        assertThat(listItems()).anySatisfy(item -> {
            assertThat(item.get("id")).isEqualTo((int) id);
            assertThat(item.get("active")).isEqualTo(false);
        });
    }

    @Test
    @DisplayName("editing changes the price and clears an emptied description to NULL")
    void updatesItem() {
        long id = createItem(new HashMap<>(Map.of(
                "name", "Cola", "pricePence", 200, "description", "Chilled")));

        Map<String, Object> edit = new HashMap<>();
        edit.put("name", "Cola");
        edit.put("pricePence", 220);
        edit.put("description", "   ");

        assertThat(admin.put("/api/admin/cafe/items/" + id, edit, String.class)
                        .getStatusCode()
                        .value())
                .isEqualTo(200);

        Integer price =
                jdbc.queryForObject("SELECT price_pence FROM cafe_item WHERE id = ?", Integer.class, id);
        assertThat(price).isEqualTo(220);
        // Blank became NULL rather than "  ": otherwise "no description" has two spellings and
        // every reader has to know about both.
        String description =
                jdbc.queryForObject("SELECT description FROM cafe_item WHERE id = ?", String.class, id);
        assertThat(description).isNull();
    }

    @Test
    @DisplayName("the public menu shows on-sale items to a signed-out visitor")
    void publicMenuIsReadableWithoutAnAccount() {
        createItem(Map.of("name", "Flat white", "pricePence", 275));

        // A brand new client with no session: browsing the menu must not need an account, the
        // same as browsing availability.
        @SuppressWarnings("unchecked")
        ResponseEntity<List> response =
                HttpClient.anonymous(rest).get("/api/cafe/items", List.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).hasSize(1);
    }

    @Test
    @DisplayName("a withdrawn item never reaches a customer, though staff still see it")
    void publicMenuHidesWithdrawnItems() {
        long id = createItem(Map.of("name", "Discontinued crisps", "pricePence", 120));
        admin.put("/api/admin/cafe/items/" + id + "/active?active=false", null, String.class);

        @SuppressWarnings("unchecked")
        ResponseEntity<List> publicMenu =
                HttpClient.anonymous(rest).get("/api/cafe/items", List.class);

        // Both halves matter. Empty alone could mean the endpoint is broken; the admin list
        // still holding the item is what shows it was hidden rather than lost.
        assertThat(publicMenu.getBody()).isEmpty();
        assertThat(listItems()).hasSize(1);
    }

    @Test
    @DisplayName("the public menu withholds the fields only staff have a use for")
    void publicMenuOmitsStaffFields() {
        createItem(Map.of("name", "Tea", "pricePence", 180));

        @SuppressWarnings("unchecked")
        ResponseEntity<List> response =
                HttpClient.anonymous(rest).get("/api/cafe/items", List.class);

        @SuppressWarnings("unchecked")
        Map<String, Object> item = (Map<String, Object>) response.getBody().get(0);
        assertThat(item).containsKeys("name", "pricePence", "description", "imageUrl");
        // Everything served here is on sale by construction, and the order is the position in
        // the list. A field a customer has no use for is one that can leak a staff concern.
        assertThat(item).doesNotContainKeys("active", "displayOrder");
    }

    @Test
    @DisplayName("a new item lands at the end of the menu rather than colliding at zero")
    void appendsNewItemsToTheEnd() {
        createItem(Map.of("name", "First", "pricePence", 100));
        createItem(Map.of("name", "Second", "pricePence", 100));

        assertThat(listItems()).extracting(item -> item.get("name")).containsExactly("First", "Second");
        assertThat(listItems()).extracting(item -> item.get("displayOrder")).containsExactly(0, 1);
    }

    private long createItem(Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        ResponseEntity<Map> response = admin.post("/api/admin/cafe/items", body, Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        Object id = response.getBody().get("id");
        return ((Number) id).longValue();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listItems() {
        return admin.get("/api/admin/cafe/items", List.class).getBody();
    }
}
