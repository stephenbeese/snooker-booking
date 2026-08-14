package uk.co.club.booking.support;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.function.Consumer;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingSource;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.OpeningHours;
import uk.co.club.booking.domain.club.PricingRule;
import uk.co.club.booking.domain.table.MaintenanceBlock;
import uk.co.club.booking.domain.table.SnookerTable;
import uk.co.club.booking.domain.table.TableTypeEntity;

/**
 * Builders for domain objects in unit tests.
 *
 * <p>Entities keep protected no-arg constructors for JPA and expose no public
 * constructor for id-bearing fields, so fixtures instantiate reflectively rather than
 * widening production APIs purely for tests.
 */
public final class TestFixtures {

    /** Matches the defaults seeded by migration V6. */
    public static BookingSettings bookingSettings() {
        return bookingSettings(settings -> {});
    }

    public static BookingSettings bookingSettings(Consumer<BookingSettings> customiser) {
        BookingSettings settings = instantiate(BookingSettings.class);
        settings.setMinDurationMinutes(30);
        settings.setMaxDurationMinutes(240);
        settings.setIncrementMinutes(30);
        settings.setMinNoticeMinutes(60);
        settings.setMaxAdvanceDays(30);
        settings.setCancellationNoticeHours(24);
        settings.setPaymentHoldMinutes(15);
        customiser.accept(settings);
        return settings;
    }

    public static OpeningHours openingHours(LocalTime open, LocalTime close) {
        OpeningHours hours = instantiate(OpeningHours.class);
        hours.setDay(DayOfWeek.MONDAY);
        hours.setClosed(false);
        hours.setOpenTime(open);
        hours.setCloseTime(close);
        return hours;
    }

    public static OpeningHours closedDay() {
        OpeningHours hours = instantiate(OpeningHours.class);
        hours.setDay(DayOfWeek.SUNDAY);
        hours.setClosed(true);
        return hours;
    }

    public static SnookerTable table(long id, String name) {
        return table(id, name, TableTypeEntity.SNOOKER, true);
    }

    public static SnookerTable table(long id, String name, String type, boolean active) {
        SnookerTable table = new SnookerTable(name, type, (int) id);
        table.setActive(active);
        setField(table, "id", id);
        return table;
    }

    public static Booking booking(
            SnookerTable table, Instant startAt, Instant endAt, BookingStatus status) {
        Booking booking = instantiate(Booking.class);
        booking.setReference("SNK-TEST" + startAt.getEpochSecond());
        booking.setSnookerTable(table);
        booking.setStartAt(startAt);
        booking.setEndAt(endAt);
        booking.setDurationMinutes(
                (int) java.time.Duration.between(startAt, endAt).toMinutes());
        booking.setPricePence(1200);
        booking.setStatus(status);
        booking.setSource(BookingSource.ONLINE);
        booking.setCustomerName("Test Customer");
        return booking;
    }

    /** A hold that expires at the given instant. */
    public static Booking pendingHold(
            SnookerTable table, Instant startAt, Instant endAt, Instant holdExpiresAt) {
        Booking booking = booking(table, startAt, endAt, BookingStatus.PENDING_PAYMENT);
        booking.setHoldExpiresAt(holdExpiresAt);
        return booking;
    }

    /** A catch-all pricing rule: matches any table, day and time. */
    public static PricingRule pricingRule(String name, int hourlyRatePence, int priority) {
        return pricingRule(name, hourlyRatePence, priority, null, null);
    }

    /** A pricing rule narrowed to a time window (null bounds match anything). */
    public static PricingRule pricingRule(
            String name, int hourlyRatePence, int priority, LocalTime startTime, LocalTime endTime) {
        PricingRule rule = instantiate(PricingRule.class);
        setField(rule, "name", name);
        setField(rule, "hourlyRatePence", hourlyRatePence);
        setField(rule, "priority", priority);
        setField(rule, "active", true);
        setField(rule, "startTime", startTime);
        setField(rule, "endTime", endTime);
        return rule;
    }

    public static MaintenanceBlock block(
            SnookerTable table, Instant startAt, Instant endAt, String reason) {
        return new MaintenanceBlock(table, startAt, endAt, reason);
    }

    private static <T> T instantiate(Class<T> type) {
        try {
            Constructor<T> constructor = type.getDeclaredConstructor();
            constructor.setAccessible(true);
            return constructor.newInstance();
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Could not instantiate " + type.getSimpleName(), e);
        }
    }

    private static void setField(Object target, String fieldName, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(target, value);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Could not set " + fieldName, e);
        }
    }

    private TestFixtures() {}
}
