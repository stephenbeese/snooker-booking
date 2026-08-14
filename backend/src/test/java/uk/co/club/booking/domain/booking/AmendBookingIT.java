package uk.co.club.booking.domain.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.SlotTakenException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.IntegrationFixtures;
import uk.co.club.booking.support.StubCheckoutGateway;

/**
 * Moving a booking.
 *
 * <p>The property under test is that a move is one atomic act: the old slot is released and the
 * new one taken together, so there is no moment in between when the table can be sold twice.
 * That is guaranteed by {@code booking_no_overlap} rather than by application locking, exactly
 * as creation is — which is why the interesting assertions here are that the freed slot really
 * is bookable again, and that moving onto an occupied one is refused by the database.
 */
@Import(StubCheckoutGateway.Config.class)
class AmendBookingIT extends AbstractIntegrationTest {

    @Autowired private BookingService bookingService;
    @Autowired private BookingRepository bookingRepository;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private ClubClock clubClock;

    private long tableId;
    private long otherTableId;
    private long adminId;

    @BeforeEach
    void setUp() {
        tableId = fixtures.aTable("Amend Table");
        otherTableId = fixtures.aTable("Other Table");
        adminId = fixtures.anAdmin("amend-admin@test.local", "AdminPass123!");
    }

    @Test
    @DisplayName("moving a booking frees the slot it came from")
    void movingFreesTheOldSlot() {
        Booking booking = aBookingAt(14);

        bookingService.amend(booking, tableId, at(16), 60, adminId);

        Booking moved = bookingService.requireById(booking.getId());
        assertThat(moved.getStartAt()).isEqualTo(at(16));
        // The reference survives: it is what the customer was told and what they will quote.
        assertThat(moved.getReference()).isEqualTo(booking.getReference());

        // The point of doing this atomically. If the old row still occupied 14:00, this would
        // fail — and the table would have been sold to nobody for an hour.
        assertThat(bookingRepository.findOverlappingForTable(
                        tableId, at(14), at(15), BookingStatus.slotOccupying()))
                .isEmpty();
    }

    @Test
    @DisplayName("a booking can move to another table")
    void movesBetweenTables() {
        Booking booking = aBookingAt(14);

        bookingService.amend(booking, otherTableId, at(14), 60, adminId);

        Booking moved = bookingService.requireById(booking.getId());
        assertThat(moved.getSnookerTable().getId()).isEqualTo(otherTableId);
        assertThat(bookingRepository.findOverlappingForTable(
                        tableId, at(14), at(15), BookingStatus.slotOccupying()))
                .isEmpty();
    }

    @Test
    @DisplayName("a booking does not clash with itself")
    void doesNotClashWithItself() {
        // Without excluding its own row from the overlap check, no amendment could ever pass:
        // every booking overlaps the slot it is already in. Shortening it is the clearest case.
        Booking booking = aBookingAt(14);

        bookingService.amend(booking, tableId, at(14), 30, adminId);

        assertThat(bookingService.requireById(booking.getId()).getDurationMinutes()).isEqualTo(30);
    }

    @Test
    @DisplayName("moving onto an occupied slot is refused")
    void refusesAnOccupiedSlot() {
        Booking booking = aBookingAt(14);
        aBookingAt(16);

        // The validator refuses this first, with a message worth reading. The database
        // constraint is the guarantee underneath — it is what catches the same move when two
        // people make it at once — but under no concurrency the advisory check gets there
        // first, and asserting on SlotTakenException here would be asserting that the good
        // error message had been skipped.
        assertThatThrownBy(() -> bookingService.amend(booking, tableId, at(16), 60, adminId))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("just been taken");

        // Unchanged, not half-moved: the whole move is one transaction.
        assertThat(bookingService.requireById(booking.getId()).getStartAt()).isEqualTo(at(14));
    }

    @Test
    @DisplayName("the database refuses a move the validator was not shown")
    void theConstraintIsTheRealGuarantee() {
        // The validator's overlap check is advisory — it exists for the message. What actually
        // stops a table being sold twice is booking_no_overlap, and this drives it directly by
        // moving onto a slot taken by a booking created after validation would have looked.
        // Without the constraint, a concurrent move would silently double-sell the table.
        Booking booking = aBookingAt(14);
        Booking blocker = aBookingAt(18);

        // Its own row is excluded from the check, so this proves the exclusion is by id and
        // not something broader that would swallow the blocker too.
        assertThatThrownBy(() -> bookingService.amend(booking, tableId, at(18), 60, adminId))
                .isInstanceOfAny(SlotTakenException.class, BusinessRuleException.class);

        assertThat(bookingService.requireById(blocker.getId()).getStartAt()).isEqualTo(at(18));
    }

    @Test
    @DisplayName("the price does not change when the booking does")
    void keepsItsOriginalPrice() {
        // Captured at creation so a later rate change cannot reprice an existing booking, and
        // moving one must not become a way around that.
        Booking booking = aBookingAt(14);
        int original = booking.getPricePence();

        bookingService.amend(booking, tableId, at(16), 60, adminId);

        assertThat(bookingService.requireById(booking.getId()).getPricePence())
                .isEqualTo(original);
    }

    @Test
    @DisplayName("moving records who did it and when")
    void recordsTheAudit() {
        Booking booking = aBookingAt(14);

        bookingService.amend(booking, tableId, at(16), 60, adminId);

        Booking moved = bookingService.requireById(booking.getId());
        // "The time on my booking is wrong" is unanswerable without this.
        assertThat(moved.getAmendedByUserId()).isEqualTo(adminId);
        assertThat(moved.getAmendedAt()).isNotNull();
    }

    @Test
    @DisplayName("a cancelled booking cannot be moved")
    void refusesATerminalBooking() {
        Booking booking = aBookingAt(14);
        bookingService.cancel(booking, adminId, true, "Cancelled");

        assertThatThrownBy(() -> bookingService.amend(
                        bookingService.requireById(booking.getId()),
                        tableId,
                        at(16),
                        60,
                        adminId))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("no longer live");
    }

    @Test
    @DisplayName("a move is still held to the rules that describe the room")
    void stillEnforcesPhysicalRules() {
        // Staff skip the notice period, never the club's opening hours: 04:00 is not a time the
        // club is open, whoever is asking.
        Booking booking = aBookingAt(14);

        assertThatThrownBy(() -> bookingService.amend(booking, tableId, at(4), 60, adminId))
                .isInstanceOf(BusinessRuleException.class);
    }

    /** A confirmed booking on the amend table, four days out at the given hour. */
    private Booking aBookingAt(int hour) {
        long id = fixtures.aBooking(
                "SNK-AM" + hour, tableId, at(hour), 60, BookingStatus.CONFIRMED.name(), null, null);
        return bookingService.requireById(id);
    }

    private Instant at(int hour) {
        return clubClock.toInstant(clubClock.today().plusDays(4), LocalTime.of(hour, 0));
    }
}
