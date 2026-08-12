package uk.co.club.booking.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * Guards the BCrypt hashes hardcoded in {@code db/seed/R__dev_seed.sql}.
 *
 * <p>Those hashes cannot be generated at migration time, so they are baked into the
 * SQL. This test proves they still match the documented dev passwords and that the
 * seed data was not silently invalidated by an encoder change. Run with
 * {@code -Dseed.print=true} to emit fresh hashes if the passwords ever change.
 *
 * <p>These are development credentials for a local database only.
 */
class SeedPasswordHashTest {

    private static final String ADMIN_PASSWORD = "Admin123!";
    private static final String CUSTOMER_PASSWORD = "Customer123!";

    // Must stay in sync with SecurityConfig's encoder strength.
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);

    @Test
    void seedHashesMatchDocumentedDevPasswords() {
        assertThat(encoder.matches(ADMIN_PASSWORD, DevSeedHashes.ADMIN)).isTrue();
        assertThat(encoder.matches(CUSTOMER_PASSWORD, DevSeedHashes.CUSTOMER)).isTrue();
    }

    @Test
    void wrongPasswordDoesNotMatch() {
        assertThat(encoder.matches("wrong", DevSeedHashes.ADMIN)).isFalse();
    }

    @Test
    void printFreshHashes() {
        if (!Boolean.getBoolean("seed.print")) {
            return;
        }
        System.out.println("ADMIN    = " + encoder.encode(ADMIN_PASSWORD));
        System.out.println("CUSTOMER = " + encoder.encode(CUSTOMER_PASSWORD));
    }

    /** The exact strings that appear in the seed migration. */
    static final class DevSeedHashes {
        static final String ADMIN =
                "$2a$12$fsgQIPwM2GVsuZbiGT6tPORv86U6QoLUMvNciv9hcNPcr2cwU56ae";
        static final String CUSTOMER =
                "$2a$12$iwawPf4TEAo6wCZolJnPvuUB3KlLXgo/iRr7ENRSLnlDZQOOtyCYW";

        private DevSeedHashes() {}
    }
}
