package uk.co.club.booking.domain.club;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubSettingsRepository extends JpaRepository<ClubSettings, Short> {

    /** The singleton row. Guaranteed to exist by V4, so callers need not handle absence. */
    default ClubSettings current() {
        return findById(ClubSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException(
                        "club_settings row is missing; migration V4 should have inserted it"));
    }
}
