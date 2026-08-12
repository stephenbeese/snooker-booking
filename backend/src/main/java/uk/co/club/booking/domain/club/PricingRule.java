package uk.co.club.booking.domain.club;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.DayOfWeek;
import java.time.LocalTime;
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

    @Column(name = "day_of_week")
    private Short dayOfWeek;

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

    public TableType getTableType() {
        return tableType;
    }

    public DayOfWeek getDayOfWeek() {
        return dayOfWeek == null ? null : DayOfWeek.of(dayOfWeek);
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
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

    public boolean isActive() {
        return active;
    }

    /**
     * Whether this rule applies to a booking of the given type starting at the given
     * club-local day and time. Null narrowing fields match anything.
     */
    public boolean matches(TableType type, DayOfWeek day, LocalTime localStart) {
        if (tableType != null && tableType != type) {
            return false;
        }
        if (dayOfWeek != null && DayOfWeek.of(dayOfWeek) != day) {
            return false;
        }
        if (startTime != null && localStart.isBefore(startTime)) {
            return false;
        }
        return endTime == null || localStart.isBefore(endTime);
    }
}
