package uk.co.club.booking.domain.club;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface BookingSettingsRepository extends JpaRepository<BookingSettings, Short> {

    /**
     * The singleton settings row, guaranteed to exist by migration V6.
     *
     * <p>There is deliberately no {@code default BookingSettings current()} convenience method
     * here. A {@code default} interface method on a Mockito mock returns null <em>without
     * executing its body</em>, so a test that stubs the underlying query still gets null back,
     * and the resulting NullPointerException looks exactly like a production bug rather than a
     * mocking artefact. Keeping the only entry point abstract makes the repository honestly
     * stubbable; callers pair it with {@link BookingSettings#require(Optional)}.
     */
    @Query("SELECT s FROM BookingSettings s WHERE s.id = 1")
    Optional<BookingSettings> findSingleton();
}
