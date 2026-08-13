package uk.co.club.booking.domain.club;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.FetchType;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import uk.co.club.booking.domain.table.TableType;

/**
 * An hourly rate, optionally narrowed to a table type, weekday or time window.
 *
 * <p>The MVP seeds exactly one catch-all rule (all narrowing fields null). The shape
 * exists so peak/off-peak, weekend and per-table-type pricing can be added as data
 * later rather than as a migration; a null field means "matches anything" and the
 * highest-priority match wins.
 */
@Entity
@Table(name = "pricing_rule")
public class PricingRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "table_type")
    private TableType tableType;

    /**
     * The days this rule applies to. <strong>Empty means every day</strong>, matching what a
     * null {@code day_of_week} meant before V12 — not "no days", which would make the rule
     * dead and is never a thing anyone wants to configure.
     *
     * <p>Eager because {@code PricingService} reads every active rule and immediately asks each
     * one whether it matches: lazy loading here would be a query per rule on the pricing path,
     * which runs for every cell of every availability grid.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "pricing_rule_day",
            joinColumns = @JoinColumn(name = "rule_id"))
    @Column(name = "day_of_week", nullable = false)
    private Set<Short> daysOfWeek = new LinkedHashSet<>();

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "hourly_rate_pence", nullable = false)
    private int hourlyRatePence;

    @Column(nullable = false)
    private int priority;

    @Column(nullable = false)
    private boolean active = true;

    protected PricingRule() {
        // for JPA
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public TableType getTableType() {
        return tableType;
    }

    public void setTableType(TableType tableType) {
        this.tableType = tableType;
    }

    /**
     * The days this rule applies to, in week order. Empty means every day.
     *
     * <p>Sorted rather than in insertion order so "Monday, Tuesday" never renders as "Tuesday,
     * Monday" depending on which checkbox staff ticked first.
     */
    public Set<DayOfWeek> getDaysOfWeek() {
        return daysOfWeek.stream()
                .map(day -> DayOfWeek.of(day))
                .sorted()
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** Null or empty both mean every day. Stored as ISO weekday numbers (Monday = 1). */
    public void setDaysOfWeek(Collection<DayOfWeek> days) {
        // Mutated in place, not replaced: Hibernate tracks this collection instance, and
        // assigning a new Set makes it delete every row and reinsert them on each save.
        this.daysOfWeek.clear();
        if (days != null) {
            days.stream()
                    .filter(java.util.Objects::nonNull)
                    .sorted()
                    .forEach(day -> this.daysOfWeek.add((short) day.getValue()));
        }
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public void setStartTime(LocalTime startTime) {
        this.startTime = startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }

    public void setEndTime(LocalTime endTime) {
        this.endTime = endTime;
    }

    public int getHourlyRatePence() {
        return hourlyRatePence;
    }

    public void setHourlyRatePence(int hourlyRatePence) {
        this.hourlyRatePence = hourlyRatePence;
    }

    public int getPriority() {
        return priority;
    }

    public void setPriority(int priority) {
        this.priority = priority;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    /**
     * The club-local times at which this rule starts or stops applying.
     *
     * <p>Used to price a booking that spans a rate change: the rate can only change where some
     * rule begins or ends, so these are the only instants a quote has to split on. A rule with
     * no time window never changes anything mid-day and contributes nothing.
     */
    public List<LocalTime> boundaryTimes() {
        List<LocalTime> boundaries = new java.util.ArrayList<>(2);
        if (startTime != null) {
            boundaries.add(startTime);
        }
        if (endTime != null) {
            boundaries.add(endTime);
        }
        return boundaries;
    }

    /**
     * Whether this rule applies to a booking of the given type starting at the given
     * club-local day and time. Null narrowing fields match anything.
     */
    public boolean matches(TableType type, DayOfWeek day, LocalTime localStart) {
        if (tableType != null && tableType != type) {
            return false;
        }
        // Empty means every day, exactly as a null day_of_week did before V12. Testing
        // membership without the emptiness check would make every unrestricted rule match
        // nothing — including the catch-all, so no booking could be priced at all.
        if (!daysOfWeek.isEmpty() && !daysOfWeek.contains((short) day.getValue())) {
            return false;
        }
        if (startTime != null && localStart.isBefore(startTime)) {
            return false;
        }
        return endTime == null || localStart.isBefore(endTime);
    }
}
