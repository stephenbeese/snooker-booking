package uk.co.club.booking.domain.cafe;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Collections;
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
        createItem(Map.of("name", "Flat white", "pricePence", 275, "categoryCode", "HOT_DRINKS"));

        // A brand new client with no session: browsing the menu must not need an account, the
        // same as browsing availability.
        ResponseEntity<List> response = publicMenu();

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(sectionLabels()).containsExactly("Hot drinks");
        assertThat(itemsIn(0)).extracting(item -> item.get("name")).containsExactly("Flat white");
    }

    @Test
    @DisplayName("a withdrawn item never reaches a customer, though staff still see it")
    void publicMenuHidesWithdrawnItems() {
        long id = createItem(Map.of("name", "Discontinued crisps", "pricePence", 120));
        admin.put("/api/admin/cafe/items/" + id + "/active?active=false", null, String.class);

        // Both halves matter. Empty alone could mean the endpoint is broken; the admin list
        // still holding the item is what shows it was hidden rather than lost.
        assertThat(publicMenu().getBody()).isEmpty();
        assertThat(listItems()).hasSize(1);
    }

    @Test
    @DisplayName("the public menu withholds the fields only staff have a use for")
    void publicMenuOmitsStaffFields() {
        createItem(Map.of("name", "Tea", "pricePence", 180, "categoryCode", "HOT_DRINKS"));

        Map<String, Object> item = itemsIn(0).get(0);
        assertThat(item).containsKeys("name", "pricePence", "description", "imageUrl");
        // Everything served here is on sale by construction, and the order is the position in
        // the list. A field a customer has no use for is one that can leak a staff concern.
        assertThat(item).doesNotContainKeys("active", "displayOrder");
    }

    // ------------------------------------------------------------- categories

    @Test
    @DisplayName("the menu groups items into the club's own category order")
    void publicMenuGroupsByCategory() {
        // Created deliberately out of order: the sections must come back in the club's
        // display_order, not in the order the items happened to be added.
        createItem(Map.of("name", "Cheese toastie", "pricePence", 450, "categoryCode", "FOOD"));
        createItem(Map.of("name", "Flat white", "pricePence", 275, "categoryCode", "HOT_DRINKS"));
        createItem(Map.of("name", "Tea", "pricePence", 180, "categoryCode", "HOT_DRINKS"));

        // Hot drinks is display_order 0 and Food is 5, so Hot drinks leads whatever the
        // insertion order was. Empty categories are absent entirely.
        assertThat(sectionLabels()).containsExactly("Hot drinks", "Food");
        assertThat(itemsIn(0)).extracting(item -> item.get("name")).containsExactly("Flat white", "Tea");
    }

    @Test
    @DisplayName("an uncategorised item is filed under Other, last")
    void publicMenuFilesUncategorisedItemsLast() {
        // Uncategorised is deliberately allowed — see V17 for why the column is nullable.
        createItem(Map.of("name", "Pork scratchings", "pricePence", 150));
        createItem(Map.of("name", "Flat white", "pricePence", 275, "categoryCode", "HOT_DRINKS"));

        assertThat(sectionLabels()).containsExactly("Hot drinks", "Other");
    }

    @Test
    @DisplayName("an item on a withdrawn category still appears, rather than vanishing")
    void publicMenuKeepsItemsOfWithdrawnCategories() {
        // The failure this guards: a category withdrawn while an on-sale item still carries it
        // must not make that item invisible. Staff would see it listed and customers would not,
        // with nothing on either screen explaining why.
        long id = createItem(Map.of("name", "Mulled wine", "pricePence", 400, "categoryCode", "FOOD"));
        // Withdrawing is refused while in use, so this goes round the service deliberately —
        // it is the state a club could still reach by withdrawing before adding the item back.
        jdbc.update("UPDATE cafe_category SET active = FALSE WHERE code = 'FOOD'");

        assertThat(sectionLabels()).containsExactly("FOOD");
        assertThat(itemsIn(0)).extracting(item -> item.get("name")).containsExactly("Mulled wine");
        assertThat(id).isPositive();
    }

    @Test
    @DisplayName("a category is derived from its label, and refuses a duplicate")
    void createsCategoryFromLabel() {
        @SuppressWarnings("unchecked")
        ResponseEntity<Map> created = admin.post(
                "/api/admin/cafe/categories", Map.of("label", "Wine & spirits, vintage"), Map.class);

        assertThat(created.getStatusCode().value()).isEqualTo(201);
        // Punctuation collapses to single underscores and the ends are trimmed — a code with a
        // trailing underscore would be rejected by the CHECK.
        assertThat(created.getBody().get("code")).isEqualTo("WINE_SPIRITS_VINTAGE");
        assertThat(created.getBody().get("label")).isEqualTo("Wine & spirits, vintage");

        ResponseEntity<String> duplicate = admin.post(
                "/api/admin/cafe/categories", Map.of("label", "Hot drinks"), String.class);
        assertThat(duplicate.getStatusCode().value()).isEqualTo(422);
        assertThat(duplicate.getBody()).contains("already exists");
    }

    @Test
    @DisplayName("a category in use cannot be withdrawn, and says how many items block it")
    void refusesToWithdrawACategoryInUse() {
        createItem(Map.of("name", "Flat white", "pricePence", 275, "categoryCode", "HOT_DRINKS"));

        ResponseEntity<String> refused = admin.put(
                "/api/admin/cafe/categories/HOT_DRINKS/active?active=false", null, String.class);

        assertThat(refused.getStatusCode().value()).isEqualTo(422);
        assertThat(refused.getBody()).contains("is 1 item");
        // Still active: a refused withdrawal must not half-apply.
        Boolean active = jdbc.queryForObject(
                "SELECT active FROM cafe_category WHERE code = 'HOT_DRINKS'", Boolean.class);
        assertThat(active).isTrue();
    }

    @Test
    @DisplayName("an item cannot be filed under a category that is withdrawn or absent")
    void refusesAnUnavailableCategory() {
        ResponseEntity<String> unknown = admin.post(
                "/api/admin/cafe/items",
                Map.of("name", "Mystery", "pricePence", 100, "categoryCode", "NO_SUCH_THING"),
                String.class);

        // 422 naming the problem, not a 500 from the foreign key.
        assertThat(unknown.getStatusCode().value()).isEqualTo(422);
        assertThat(unknown.getBody()).contains("not available");

        jdbc.update("UPDATE cafe_category SET active = FALSE WHERE code = 'SNACKS'");
        assertThat(admin.statusOf(
                        HttpMethod.POST,
                        "/api/admin/cafe/items",
                        Map.of("name", "Peanuts", "pricePence", 100, "categoryCode", "SNACKS")))
                .isEqualTo(422);
    }

    @Test
    @DisplayName("an item on a withdrawn category can still be edited without restoring it")
    void editsAnItemWhoseCategoryWasWithdrawn() {
        // Correcting a price must not require first restoring a section the club retired. This
        // is why the category is only re-validated when it actually changes.
        long id = createItem(Map.of("name", "Cola", "pricePence", 200, "categoryCode", "COLD_DRINKS"));
        jdbc.update("UPDATE cafe_category SET active = FALSE WHERE code = 'COLD_DRINKS'");

        Map<String, Object> edit = new HashMap<>();
        edit.put("name", "Cola");
        edit.put("pricePence", 220);
        edit.put("categoryCode", "COLD_DRINKS");

        assertThat(admin.put("/api/admin/cafe/items/" + id, edit, String.class)
                        .getStatusCode()
                        .value())
                .isEqualTo(200);
        Integer price =
                jdbc.queryForObject("SELECT price_pence FROM cafe_item WHERE id = ?", Integer.class, id);
        assertThat(price).isEqualTo(220);
    }

    @Test
    @DisplayName("a new item lands at the end of the menu rather than colliding at zero")
    void appendsNewItemsToTheEnd() {
        createItem(Map.of("name", "First", "pricePence", 100));
        createItem(Map.of("name", "Second", "pricePence", 100));

        assertThat(listItems()).extracting(item -> item.get("name")).containsExactly("First", "Second");
        assertThat(listItems()).extracting(item -> item.get("displayOrder")).containsExactly(0, 1);
    }

    @Test
    @DisplayName("reordering the categories reorders the sections customers read")
    void reordersCategories() {
        // The point of the feature, asserted end to end rather than on display_order alone: a
        // number in a column proves nothing about what the menu looks like.
        createItem(Map.of(
                "name", "Flat white", "pricePence", 275, "categoryCode", "HOT_DRINKS"));
        createItem(Map.of("name", "Lager", "pricePence", 480, "categoryCode", "BEER_AND_CIDER"));
        assertThat(sectionLabels()).containsExactly("Hot drinks", "Beer & cider");

        List<String> reversed = new ArrayList<>(categoryCodes());
        Collections.reverse(reversed);
        ResponseEntity<String> response = admin.put(
                "/api/admin/cafe/categories/order",
                Map.of("categoryCodes", reversed),
                String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(sectionLabels()).containsExactly("Beer & cider", "Hot drinks");
    }

    @Test
    @DisplayName("/order routes to the reorder endpoint, not to a rename of a category called order")
    void orderIsNotTreatedAsACategoryCode() {
        // Both patterns are a single segment, so they genuinely overlap: PUT /categories/order
        // matches /{code} as readily as /order. Spring prefers the literal, but nothing in the
        // codebase says so — without this, a future refactor that reordered or renamed the
        // mappings would silently start validating the body as a rename, and the only symptom
        // would be a 400 complaining that "label must not be blank".
        ResponseEntity<String> response = admin.put(
                "/api/admin/cafe/categories/order",
                Map.of("categoryCodes", categoryCodes()),
                String.class);

        // 200 is itself the proof: /{code} would have validated this body as a rename and
        // answered 400 with "label must not be blank", since a reorder body carries no label.
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).doesNotContain("must not be blank");
    }

    @Test
    @DisplayName("a partial order is refused rather than merged")
    void refusesAPartialOrder() {
        // Whether the absent categories should lead, trail or hold their old positions has no
        // single sensible answer, so guessing one would silently rearrange sections nobody
        // touched.
        ResponseEntity<String> response = admin.put(
                "/api/admin/cafe/categories/order",
                Map.of("categoryCodes", List.of("HOT_DRINKS")),
                String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(422);
        assertThat(response.getBody()).contains("every category exactly once");
    }

    @Test
    @DisplayName("a duplicated code is refused rather than silently winning twice")
    void refusesADuplicatedCode() {
        List<String> codes = new ArrayList<>(categoryCodes());
        codes.set(1, codes.get(0));

        ResponseEntity<String> response = admin.put(
                "/api/admin/cafe/categories/order", Map.of("categoryCodes", codes), String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(422);
        assertThat(response.getBody()).contains("more than once");
    }

    @Test
    @DisplayName("a withdrawn category keeps its place, and returns to it when restored")
    void withdrawnCategoriesHoldTheirPosition() {
        // Withdrawn categories take part in the ordering: excluding them would mean a retired
        // section reappearing at the end, in a position nobody chose, whenever it came back.
        assertThat(admin.put("/api/admin/cafe/categories/SNACKS/active?active=false", null, String.class)
                        .getStatusCode()
                        .value())
                .isEqualTo(200);

        List<String> order = new ArrayList<>(categoryCodes());
        order.remove("SNACKS");
        order.add(0, "SNACKS");
        admin.put("/api/admin/cafe/categories/order", Map.of("categoryCodes", order), String.class);

        assertThat(admin.put("/api/admin/cafe/categories/SNACKS/active?active=true", null, String.class)
                        .getStatusCode()
                        .value())
                .isEqualTo(200);
        assertThat(categoryCodes().get(0)).isEqualTo("SNACKS");
    }

    /** Every category code in its current running order, withdrawn ones included. */
    @SuppressWarnings("unchecked")
    private List<String> categoryCodes() {
        return ((List<Map<String, Object>>) admin.get("/api/admin/cafe/categories", List.class)
                        .getBody())
                .stream().map(category -> (String) category.get("code")).toList();
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

    /** The menu as a signed-out visitor gets it: a list of sections, each with its items. */
    @SuppressWarnings("unchecked")
    private ResponseEntity<List> publicMenu() {
        return HttpClient.anonymous(rest).get("/api/cafe/items", List.class);
    }

    @SuppressWarnings("unchecked")
    private List<String> sectionLabels() {
        return ((List<Map<String, Object>>) publicMenu().getBody())
                .stream().map(section -> (String) section.get("label")).toList();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> itemsIn(int section) {
        return (List<Map<String, Object>>)
                ((List<Map<String, Object>>) publicMenu().getBody()).get(section).get("items");
    }
}
