package uk.co.club.booking.domain.user;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Case-insensitive by virtue of the {@code citext} column type — no need to
     * lowercase the argument, and no risk of a call site forgetting to.
     */
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}
