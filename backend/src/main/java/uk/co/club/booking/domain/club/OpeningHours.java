package uk.co.club.booking.domain.club;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.DayOfWeek;
import java.time.LocalTime;

/**
 * Opening hours for one weekday.
 *
 * <p>Times are {@link LocalTime} because opening hours are a wall-clock rule — the club
 * opens at 10:00 whatever the UTC offset is that month. Resolving them to instants for
 * a specific date is {@code ClubClock}'s job.
 */
@Entity
@Table(name = "opening_hours")
public class OpeningHours {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** ISO-8601 numbering, 1=Monday, matching {@link DayOfWeek#getValue()}. */
    @Column(name = "day_of_week", nullable = false, unique = true)
    private short dayOfWeek;

    @Column(nullable = false)
    private boolean closed;

    @Column(name = "open_time")
    private LocalTime openTime;

    @Column(name = "close_time")
    private LocalTime closeTime;

    protected OpeningHours() {
        // for JPA
    }

    public Long getId() {
        return id;
    }

    public DayOfWeek getDay() {
        return DayOfWeek.of(dayOfWeek);
    }

    public void setDay(DayOfWeek day) {
        this.dayOfWeek = (short) day.getValue();
    }

    public boolean isClosed() {
        return closed;
    }

    public void setClosed(boolean closed) {
        this.closed = closed;
    }

    public LocalTime getOpenTime() {
        return openTime;
    }

    public void setOpenTime(LocalTime openTime) {
        this.openTime = openTime;
    }

    public LocalTime getCloseTime() {
        return closeTime;
    }

    public void setCloseTime(LocalTime closeTime) {
        this.closeTime = closeTime;
    }
}
