package uk.co.club.booking.domain.user;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /**
     * Claims a token, if it is still claimable.
     *
     * <p>The guard is the whole single-use mechanism. Checking {@code usedAt == null} in Java
     * and then saving would let two requests arriving together both pass the check and both
     * reset the password — the second one setting a password its owner never chose. Making the
     * claim conditional in SQL means the database decides, and exactly one caller sees 1.
     *
     * @return 1 if this call claimed the token, 0 if it was already used or had expired
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE PasswordResetToken t
               SET t.usedAt = :now
             WHERE t.id = :id
               AND t.usedAt IS NULL
               AND t.expiresAt > :now
            """)
    int claim(@Param("id") long id, @Param("now") Instant now);

    /**
     * Invalidates a user's outstanding tokens.
     *
     * <p>Called when issuing a new one, so that requesting a second reset link makes the first
     * unusable. Without this, an old link recovered from a mailbox months later still works.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE PasswordResetToken t
               SET t.usedAt = :now
             WHERE t.userId = :userId
               AND t.usedAt IS NULL
            """)
    int invalidateOutstanding(@Param("userId") long userId, @Param("now") Instant now);
}
