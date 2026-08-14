package uk.co.club.booking.domain.club;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Day matching after V12, where a rule covers a <em>set</em> of days.
 *
 * <p>The load-bearing rule is that an empty set means <strong>every</strong> day, carrying over
 * exactly what a null {@code day_of_week} meant before. Read as "no days" instead, every
 * unrestricted rule — the club's catch-all included — would match nothing, {@code
 * PricingService} would throw, and every booking attempt would become a 500. That is the club
 * silently unable to sell, so it gets its own tests rather than being implied by the others.
 */
class PricingRuleDaysTest {

    private static final LocalTime NOON = LocalTime.of(12, 0);

    private static PricingRule rule(DayOfWeek... days) {
        PricingRule rule = new PricingRule();
        rule.setName("Test rule");
        rule.setHourlyRatePence(1200);
        rule.setDaysOfWeek(List.of(days));
        return rule;
    }

    @Test
    void aRuleWithNoDaysAppliesEveryDay() {
        PricingRule everyDay = rule();

        for (DayOfWeek day : DayOfWeek.values()) {
            assertThat(everyDay.matches("SNOOKER", day, NOON))
                    .as("an unrestricted rule must apply on %s", day)
                    .isTrue();
        }
    }

    @Test
    void aRuleAppliesOnEveryDayItNames() {
        PricingRule weekdayEvenings = rule(
                DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY);

        assertThat(weekdayEvenings.matches("SNOOKER", DayOfWeek.MONDAY, NOON)).isTrue();
        assertThat(weekdayEvenings.matches("SNOOKER", DayOfWeek.THURSDAY, NOON)).isTrue();
    }

    @Test
    void aRuleDoesNotApplyOnADayItOmits() {
        // The point of the whole feature: "Monday to Thursday" must leave Friday alone, which
        // one rule per day could only achieve by staff remembering to create exactly four.
        PricingRule weekdays = rule(
                DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY);

        assertThat(weekdays.matches("SNOOKER", DayOfWeek.FRIDAY, NOON)).isFalse();
        assertThat(weekdays.matches("SNOOKER", DayOfWeek.SATURDAY, NOON)).isFalse();
        assertThat(weekdays.matches("SNOOKER", DayOfWeek.SUNDAY, NOON)).isFalse();
    }

    @Test
    void nullIsTreatedAsEveryDayRatherThanRejected() {
        // A client that omits the field entirely — including any older one written against the
        // pre-V12 API — must get an every-day rule, not a rule that can never apply.
        PricingRule rule = new PricingRule();
        rule.setDaysOfWeek(null);

        assertThat(rule.getDaysOfWeek()).isEmpty();
        assertThat(rule.matches("SNOOKER", DayOfWeek.WEDNESDAY, NOON)).isTrue();
    }

    @Test
    void daysComeBackInWeekOrderWhateverOrderTheyWereSet() {
        // So "Monday, Friday" never renders as "Friday, Monday" depending on which checkbox
        // staff happened to tick first.
        PricingRule rule = rule(DayOfWeek.FRIDAY, DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY);

        assertThat(rule.getDaysOfWeek())
                .containsExactly(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY);
    }

    @Test
    void settingDaysAgainReplacesThePreviousSet() {
        // Editing a rule from "Monday and Tuesday" to "Sunday" must not leave the old days
        // behind — the rule would go on applying on days staff believe they removed.
        PricingRule rule = rule(DayOfWeek.MONDAY, DayOfWeek.TUESDAY);
        rule.setDaysOfWeek(Set.of(DayOfWeek.SUNDAY));

        assertThat(rule.getDaysOfWeek()).containsExactly(DayOfWeek.SUNDAY);
        assertThat(rule.matches("SNOOKER", DayOfWeek.MONDAY, NOON)).isFalse();
        assertThat(rule.matches("SNOOKER", DayOfWeek.SUNDAY, NOON)).isTrue();
    }

    @Test
    void theDaySetCombinesWithTheOtherNarrowingFields() {
        // Each narrowing field is an AND, not an OR: a Saturday-evening snooker rule must not
        // apply to a pool table, nor on a Saturday morning.
        PricingRule rule = rule(DayOfWeek.SATURDAY);
        rule.setTableType("SNOOKER");
        rule.setStartTime(LocalTime.of(18, 0));
        rule.setEndTime(LocalTime.of(23, 0));

        assertThat(rule.matches("SNOOKER", DayOfWeek.SATURDAY, LocalTime.of(19, 0)))
                .isTrue();
        assertThat(rule.matches("ENGLISH_POOL", DayOfWeek.SATURDAY, LocalTime.of(19, 0)))
                .as("wrong table type")
                .isFalse();
        assertThat(rule.matches("SNOOKER", DayOfWeek.SATURDAY, LocalTime.of(11, 0)))
                .as("outside the time window")
                .isFalse();
        assertThat(rule.matches("SNOOKER", DayOfWeek.SUNDAY, LocalTime.of(19, 0)))
                .as("wrong day")
                .isFalse();
    }
}
