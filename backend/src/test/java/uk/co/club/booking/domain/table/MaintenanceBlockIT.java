package uk.co.club.booking.domain.table;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.NotFoundException;
import uk.co.club.booking.common.error.SlotTakenException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.BookingPolicy;
import uk.co.club.booking.domain.booking.BookingService;
import uk.co.club.booking.domain.booking.BookingSource;
import uk.co.club.booking.domain.booking.CreateBookingCommand;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * Maintenance blocks against a real database — the Phase 5 hard gate.
 *
 * <p>A block and a booking are two promises about the same table at the same time. The database
 * cannot adjudicate that pair, because an EXCLUDE constraint works within one table and these
 * live in two, so the rule is enforced in the service. That makes it exactly the kind of rule
 * that quietly stops working, and exactly the kind that needs testing against real Postgres
 * rather than a mock.
 */
class MaintenanceBlockIT extends AbstractIntegrationTest {

    @Autowired private MaintenanceBlockService blockService;
    @Autowired private BookingService bookingService;
    @Autowired private MaintenanceBlockRepository blockRepository;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private ClubClock clubClock;

    private long tableId;
    private long adminId;

    /** A date comfortably inside the booking window, on a day the club is open. */
    private LocalDate day;

    @BeforeEach
    void setUp() {
        tableId = fixtures.aTable("Table 1");
        adminId = fixtures.anAdmin("admin@test.local", "AdminPassword123");
        day = clubClock.today().plusDays(3);
    }

    @Nested
    @DisplayName("creating a block")
    class Creating {

        @Test
        @DisplayName("takes the table out of service for the period")
        void createsABlock() {
            MaintenanceBlock block = blockService.create(
                    tableId, at(14, 0), at(18, 0), "Re-clothing", adminId);

            assertThat(block.getId()).isNotNull();
            assertThat(block.getReason()).isEqualTo("Re-clothing");
            // Recorded so staff can see who took the table out of service.
            assertThat(block.getCreatedByUserId()).isEqualTo(adminId);
        }

        @Test
        @DisplayName("rejects a block that ends before it starts")
        void rejectsInvertedTimes() {
            assertThatThrownBy(() -> blockService.create(tableId, at(18, 0), at(14, 0), null, adminId))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("after the start");
        }

        @Test
        @DisplayName("rejects a block on a table that does not exist")
        void rejectsUnknownTable() {
            assertThatThrownBy(
                            () -> blockService.create(999_999L, at(14, 0), at(18, 0), null, adminId))
                    .isInstanceOf(NotFoundException.class);
        }
    }

    @Nested
    @DisplayName("blocks versus other blocks")
    class AgainstBlocks {

        @Test
        @DisplayName("a second overlapping block on the same table is refused")
        void rejectsOverlappingBlock() {
            blockService.create(tableId, at(14, 0), at(18, 0), "First", adminId);

            // 409, not 422: this is a lost race in the same sense as a double booking, and the
            // EXCLUDE constraint is what actually adjudicates it.
            assertThatThrownBy(
                            () -> blockService.create(tableId, at(16, 0), at(20, 0), "Second", adminId))
                    .isInstanceOf(SlotTakenException.class);

            assertThat(blockRepository.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("abutting blocks are allowed, because touching is not overlapping")
        void allowsAbuttingBlocks() {
            blockService.create(tableId, at(14, 0), at(16, 0), "First", adminId);

            // Half-open '[)' bounds: a block ending at 16:00 and one starting at 16:00 do not
            // overlap. If this failed, staff could not schedule back-to-back work.
            assertThatCode(() -> blockService.create(tableId, at(16, 0), at(18, 0), "Second", adminId))
                    .doesNotThrowAnyException();

            assertThat(blockRepository.count()).isEqualTo(2);
        }

        @Test
        @DisplayName("the same period on a different table is fine")
        void allowsSamePeriodOnAnotherTable() {
            long otherTable = fixtures.aTable("Table 2");
            blockService.create(tableId, at(14, 0), at(18, 0), "First", adminId);

            assertThatCode(() -> blockService.create(otherTable, at(14, 0), at(18, 0), "Second", adminId))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("blocks versus bookings")
    class AgainstBookings {

        @Test
        @DisplayName("a block over a live booking is refused, naming the booking")
        void refusesToBlockOverALiveBooking() {
            var booking = bookingService.create(
                    command(at(15, 0), 60), BookingPolicy.staff());

            // The important part is the reference in the message: staff need to know *which*
            // booking is in the way so they can ring that customer, not just that something is.
            assertThatThrownBy(() -> blockService.create(tableId, at(14, 0), at(18, 0), null, adminId))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining(booking.getReference());

            assertThat(blockRepository.count())
                    .as("nothing may be written when the block is refused")
                    .isZero();
        }

        @Test
        @DisplayName("a cancelled booking does not stand in the way")
        void ignoresCancelledBookings() {
            var booking = bookingService.create(command(at(15, 0), 60), BookingPolicy.staff());
            bookingService.cancel(booking, adminId, true, "Customer cancelled");

            // A cancelled booking is history, not a promise. Letting it block maintenance would
            // mean a table could be permanently unmaintainable because of a booking that no
            // longer exists.
            assertThatCode(() -> blockService.create(tableId, at(14, 0), at(18, 0), null, adminId))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("a booking that merely abuts the block is not in the way")
        void ignoresAbuttingBooking() {
            bookingService.create(command(at(13, 0), 60), BookingPolicy.staff());

            // Booking runs 13:00–14:00, block starts at 14:00. Same half-open semantics as
            // everywhere else; a stricter comparison here would disagree with the database.
            assertThatCode(() -> blockService.create(tableId, at(14, 0), at(18, 0), null, adminId))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("a booking cannot be made over an existing block")
        void blockPreventsBooking() {
            blockService.create(tableId, at(14, 0), at(18, 0), "Re-clothing", adminId);

            // The other direction, and the one customers hit. Enforced by BookingValidator,
            // which is why this holds for staff bookings too — BookingPolicy has no flag to
            // skip the maintenance check.
            assertThatThrownBy(() -> bookingService.create(command(at(15, 0), 60), BookingPolicy.staff()))
                    .isInstanceOf(BusinessRuleException.class);
        }

        @Test
        @DisplayName("removing a block frees the slot immediately")
        void deletingABlockReleasesTheSlot() {
            MaintenanceBlock block =
                    blockService.create(tableId, at(14, 0), at(18, 0), "Re-clothing", adminId);

            assertThatThrownBy(() -> bookingService.create(command(at(15, 0), 60), BookingPolicy.staff()))
                    .isInstanceOf(BusinessRuleException.class);

            blockService.delete(block.getId());

            assertThatCode(() -> bookingService.create(command(at(15, 0), 60), BookingPolicy.staff()))
                    .doesNotThrowAnyException();
        }
    }

    private Instant at(int hour, int minute) {
        return clubClock.toInstant(day, LocalTime.of(hour, minute));
    }

    private CreateBookingCommand command(Instant startAt, int minutes) {
        return new CreateBookingCommand(
                tableId,
                startAt,
                minutes,
                null,
                "Test Customer",
                "test@example.test",
                null,
                null,
                BookingSource.ADMIN,
                adminId);
    }
}
