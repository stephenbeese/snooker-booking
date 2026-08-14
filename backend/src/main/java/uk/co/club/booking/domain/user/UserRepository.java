package uk.co.club.booking.domain.user;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Case-insensitive by virtue of the {@code citext} column type — no need to
     * lowercase the argument, and no risk of a call site forgetting to.
     */
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    /**
     * The admin user directory: filter by role, search across name and email.
     *
     * <p>Both parameters optional, expressed as a null check inside the query rather than as
     * several derived methods — the combinations multiply and a hand-written query is easier
     * to read than {@code findByRoleAndFirstNameContainingOrRole...}.
     *
     * <p>The caller passes an already-escaped LIKE pattern. Escaping here would be the wrong
     * layer: the repository cannot tell a wildcard the user typed from one the caller means.
     */
    @Query("""
            SELECT u FROM User u
            WHERE (:role IS NULL OR u.role = :role)
              AND (:search IS NULL
                   OR LOWER(u.email) LIKE :search ESCAPE '\\'
                   OR LOWER(u.firstName) LIKE :search ESCAPE '\\'
                   OR LOWER(u.lastName) LIKE :search ESCAPE '\\'
                   OR LOWER(CONCAT(u.firstName, ' ', u.lastName)) LIKE :search ESCAPE '\\')
            """)
    Page<User> search(
            @Param("role") Role role, @Param("search") String search, Pageable pageable);

    /**
     * Active admins other than the given one. Guards the "do not lock the club out" rule:
     * active, because a deactivated admin cannot sign in to undo anything.
     */
    long countByRoleAndActiveTrueAndIdNot(Role role, long id);

    List<User> findByRoleInOrderByFirstNameAscLastNameAsc(List<Role> roles);
}
