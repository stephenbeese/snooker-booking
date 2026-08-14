package uk.co.club.booking.domain.table;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.domain.club.SettingsService;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * Table types as data, and the ordering of tables.
 *
 * <p>Types were a Java enum until Phase 7. Moving them into the database is what lets a manager
 * add one without a deployment, but it also removes the compiler's guarantee that a type
 * exists — so the rules that replace that guarantee are what this class exercises. In
 * particular: a type in use cannot be withdrawn, and neither a table nor a pricing rule can be
 * given a type that is not on offer.
 */
class TableTypeIT extends AbstractIntegrationTest {

    @Autowired private TableTypeService tableTypeService;
    @Autowired private SnookerTableService tableService;
    @Autowired private SettingsService settingsService;
    @Autowired private uk.co.club.booking.domain.booking.BookingService bookingService;
    @Autowired private uk.co.club.booking.common.time.ClubClock clubClock;
    @Autowired private IntegrationFixtures fixtures;

    @Nested
    @DisplayName("adding types")
    class Adding {

        @Test
        @DisplayName("a manager can add a type and immediately give a table that type")
        void addingATypeMakesItUsable() {
            // The whole point of item 14: this used to require adding an enum constant, a
            // migration and a deployment.
            tableTypeService.create("Chinese pool", null);

            SnookerTable table = tableService.create("Table 9", "CHINESE_POOL", 9, null);

            assertThat(table.getTableType()).isEqualTo("CHINESE_POOL");
        }

        @Test
        @DisplayName("the code is derived from the label rather than typed separately")
        void codeIsDerivedFromTheLabel() {
            assertThat(tableTypeService.create("Chinese pool", null).getCode())
                    .isEqualTo("CHINESE_POOL");
            // Punctuation collapses rather than producing a code the CHECK would reject.
            assertThat(tableTypeService.create("Pool (8-ball)", null).getCode())
                    .isEqualTo("POOL_8_BALL");
        }

        @Test
        @DisplayName("a label that would collide with an existing type is refused")
        void refusesADuplicate() {
            assertThatThrownBy(() -> tableTypeService.create("Snooker", null))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("already exists");
        }

        @Test
        @DisplayName("a label with no letters or digits is refused rather than saved empty")
        void refusesAnUnusableLabel() {
            // Would otherwise produce an empty primary key and a 500 out of the CHECK.
            assertThatThrownBy(() -> tableTypeService.create("!!!", null))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("at least one letter or digit");
        }

        @Test
        @DisplayName("renaming a type leaves the tables that carry it alone")
        void renamingKeepsTheCode() {
            long tableId = fixtures.aTable("Table 5", "ENGLISH_POOL", true);

            tableTypeService.update("ENGLISH_POOL", "UK pool", null);

            // The label changed; the code the table references did not, so the table is intact.
            assertThat(tableTypeService.require("ENGLISH_POOL").getLabel()).isEqualTo("UK pool");
            assertThat(tableService.require(tableId).getTableType()).isEqualTo("ENGLISH_POOL");
        }
    }

    @Nested
    @DisplayName("withdrawing types")
    class Withdrawing {

        @Test
        @DisplayName("a type still in use by a table cannot be withdrawn")
        void refusesToWithdrawATypeInUse() {
            fixtures.aTable("Table 3", "AMERICAN_POOL", true);

            // The foreign key would allow this — the row survives — but the effect would be a
            // table whose type is offered nowhere, which staff can neither explain nor fix
            // without first guessing that the type was deactivated.
            assertThatThrownBy(() -> tableTypeService.setActive("AMERICAN_POOL", false))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("1 table");
        }

        @Test
        @DisplayName("an inactive table still counts as using its type")
        void inactiveTablesStillCount() {
            // Otherwise deactivating the table and then the type would leave the table
            // unrestorable without re-creating a type the club had deliberately withdrawn.
            fixtures.aTable("Table 4", "AMERICAN_POOL", false);

            assertThatThrownBy(() -> tableTypeService.setActive("AMERICAN_POOL", false))
                    .isInstanceOf(BusinessRuleException.class);
        }

        @Test
        @DisplayName("a type nothing uses can be withdrawn, and then is no longer offered")
        void withdrawingAnUnusedType() {
            tableTypeService.setActive("AMERICAN_POOL", false);

            assertThat(tableTypeService.findActive())
                    .extracting(TableTypeEntity::getCode)
                    .doesNotContain("AMERICAN_POOL");
            // Still readable, so a historic table carrying it can still be explained.
            assertThat(tableTypeService.findAll())
                    .extracting(TableTypeEntity::getCode)
                    .contains("AMERICAN_POOL");
        }

        @Test
        @DisplayName("a withdrawn type cannot be given to a new table")
        void refusesAWithdrawnTypeOnCreate() {
            tableTypeService.setActive("AMERICAN_POOL", false);

            assertThatThrownBy(() -> tableService.create("Table 6", "AMERICAN_POOL", 6, null))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("not available");
        }

        @Test
        @DisplayName("a table keeping a withdrawn type it already has can still be edited")
        void editingATableKeepsItsWithdrawnType() {
            long tableId = fixtures.aTable("Table 7", "AMERICAN_POOL", true);
            // Withdraw by going around the in-use check, which is exactly the state a club
            // reaches by retiring a format while a table still carries it.
            tableTypeService.require("AMERICAN_POOL").setActive(false);

            // Renaming must not be blocked by the type, or the table becomes uneditable.
            SnookerTable renamed =
                    tableService.update(tableId, "Table 7a", "AMERICAN_POOL", 7, null);

            assertThat(renamed.getName()).isEqualTo("Table 7a");
        }
    }

    @Nested
    @DisplayName("pricing rules")
    class Pricing {

        @Test
        @DisplayName("a pricing rule for a type that does not exist is refused")
        void refusesAnUnknownTypeOnAPricingRule() {
            // Before V15 this column had no constraint at all: the rule saved happily and then
            // matched nothing, so staff set a rate, saw the fallback price, and had nothing to
            // tell them why.
            assertThatThrownBy(() -> settingsService.savePricingRule(
                            null, "Darts rate", "DARTS", null, null, null, 900, 5, true))
                    .isInstanceOf(BusinessRuleException.class);
        }

        @Test
        @DisplayName("a pricing rule for a type that does exist is accepted")
        void acceptsAKnownType() {
            tableTypeService.create("Darts", null);

            assertThat(settingsService
                            .savePricingRule(
                                    null, "Darts rate", "DARTS", null, null, null, 900, 5, true)
                            .getTableType())
                    .isEqualTo("DARTS");
        }

        @Test
        @DisplayName("a rule narrowed to a type charges that rate for a table of that type")
        void aTypeNarrowedRuleActuallyPrices() {
            // The guard against the trap in this migration. While types were enum constants,
            // PricingRule.matches compared them with !=, which was correct for enums and became
            // reference comparison the moment they were strings — leaving every type-narrowed
            // rule silently unmatched and the club charging the catch-all rate for everything.
            // Codes here arrive from the database rather than as literals, so they are not the
            // same String instance and identity comparison genuinely fails.
            long poolTable = fixtures.aTable("Pool 1", "ENGLISH_POOL", true);
            long snookerTable = fixtures.aTable("Snooker 1", "SNOOKER", true);

            settingsService.savePricingRule(
                    null, "Pool rate", "ENGLISH_POOL", null, null, null, 800, 10, true);

            var start = clubClock.toInstant(clubClock.today().plusDays(2), java.time.LocalTime.of(14, 0));
            assertThat(bookingService.quotePence(poolTable, start, 60))
                    .as("the pool rate applies to the pool table")
                    .isEqualTo(800);
            assertThat(bookingService.quotePence(snookerTable, start, 60))
                    .as("and the snooker table still pays the catch-all rate")
                    .isEqualTo(1200);
        }
    }

    @Nested
    @DisplayName("table order")
    class Order {

        @Test
        @DisplayName("reordering rewrites every position in one go")
        void reorderRewritesPositions() {
            long first = fixtures.aTable("Alpha");
            long second = fixtures.aTable("Bravo");
            long third = fixtures.aTable("Charlie");

            List<SnookerTable> reordered = tableService.reorder(List.of(third, first, second));

            assertThat(reordered).extracting(SnookerTable::getName)
                    .containsExactly("Charlie", "Alpha", "Bravo");
        }

        @Test
        @DisplayName("a list missing a table is refused rather than partially applied")
        void refusesAPartialList() {
            long first = fixtures.aTable("Alpha");
            fixtures.aTable("Bravo");

            // A partial list would leave the omitted table at whatever position it held,
            // interleaved unpredictably with the new order — far harder to diagnose than this.
            assertThatThrownBy(() -> tableService.reorder(List.of(first)))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("every table exactly once");
        }

        @Test
        @DisplayName("a list naming the same table twice is refused")
        void refusesDuplicates() {
            long first = fixtures.aTable("Alpha");
            fixtures.aTable("Bravo");

            assertThatThrownBy(() -> tableService.reorder(List.of(first, first)))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("more than once");
        }

        @Test
        @DisplayName("an unknown table id is refused")
        void refusesAnUnknownId() {
            long first = fixtures.aTable("Alpha");

            assertThatThrownBy(() -> tableService.reorder(List.of(first, 9_999L)))
                    .isInstanceOf(BusinessRuleException.class);
        }
    }
}
