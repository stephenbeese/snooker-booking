package uk.co.club.booking.domain.club;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Opening hours for one named date, overriding that date's weekday hours.
 *
 * <p>The date is the identifier rather than a surrogate key: a date has exactly one answer,
 * and a second row for the same date is a contradiction the database refuses to store instead
 * of something the resolver has to arbitrate at read time.
 *
 * <p>Times are {@link LocalTime} for the same reason as {@link OpeningHours} — an override is a
 * wall-clock rule, and resolving it to instants for the date is {@code ClubClock}'s job.
 */
@Entity
@Table(name = "opening_hours_override")
public class OpeningHoursOverride {

    @Id
    @Column(name = "override_date", nullable = false)
    private LocalDate date;

    @Column(nullable = false)
    private boolean closed;

    @Column(name = "open_time")
    private LocalTime openTime;

    @Column(name = "close_time")
    private LocalTime closeTime;

    @Column(name = "note")
    private String note;

    protected OpeningHoursOverride() {
        // for JPA
    }

    public OpeningHoursOverride(LocalDate date) {
        this.date = date;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
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

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
