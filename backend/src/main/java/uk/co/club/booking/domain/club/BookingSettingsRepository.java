package uk.co.club.booking.domain.club;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BookingSettingsRepository extends JpaRepository<BookingSettings, Short> {

    /** The singleton row. Guaranteed to exist by V6. */
    default BookingSettings current() {
        return findById(BookingSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException(
                        "booking_settings row is missing; migration V6 should have inserted it"));
    }
}
