package uk.co.club.booking.domain.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.crypto.password.PasswordEncoder;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.mail.Mailer;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * Password reset, against real PostgreSQL.
 *
 * <p>Focused on the properties that are security-relevant rather than on the happy path alone:
 * the endpoint must not reveal who has an account, a token must work exactly once, and an
 * expired or superseded token must be worthless. Each of these is a plausible thing to get
 * wrong in a way that unit tests with a mocked repository would not catch, because the
 * single-use guarantee is enforced by a conditional UPDATE in the database.
 */
class PasswordResetIT extends AbstractIntegrationTest {

    @Autowired private PasswordResetService passwordResetService;
    @Autowired private PasswordResetTokenRepository tokenRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private RecordingMailer mailer;

    /** Captures what would have been sent, so the test can read the token out of the link. */
    @TestConfiguration
    static class MailerConfig {
        @Bean
        @Primary
        RecordingMailer recordingMailer() {
            return new RecordingMailer();
        }
    }

    static class RecordingMailer implements Mailer {
        final List<String> bodies = new ArrayList<>();

        @Override
        public void send(String to, String subject, String body) {
            bodies.add(body);
        }
    }

    @Test
    @DisplayName("a reset link lets the user choose a new password")
    void resetsThePassword() {
        fixtures.aCustomer("reset@test.local", "OldPassword123!");
        mailer.bodies.clear();

        passwordResetService.requestReset("reset@test.local");
        passwordResetService.resetPassword(tokenFromLastEmail(), "BrandNewPassword123!");

        User user = userRepository.findByEmail("reset@test.local").orElseThrow();
        assertThat(passwordEncoder.matches("BrandNewPassword123!", user.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches("OldPassword123!", user.getPasswordHash())).isFalse();
    }

    @Test
    @DisplayName("an unknown address is accepted silently and sends nothing")
    void unknownAddressRevealsNothing() {
        mailer.bodies.clear();

        // Must not throw. Any error here — even a generic one — would tell a caller that this
        // address differs from a registered one, which is the enumeration leak itself.
        passwordResetService.requestReset("nobody@test.local");

        assertThat(mailer.bodies).isEmpty();
        assertThat(tokenRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("a token works exactly once")
    void tokenIsSingleUse() {
        fixtures.aCustomer("single-use@test.local", "OldPassword123!");
        mailer.bodies.clear();
        passwordResetService.requestReset("single-use@test.local");
        String token = tokenFromLastEmail();

        passwordResetService.resetPassword(token, "FirstNewPassword123!");

        assertThatThrownBy(() -> passwordResetService.resetPassword(token, "SecondAttempt123!"))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("invalid or has expired");

        // The second attempt must not have taken effect.
        User user = userRepository.findByEmail("single-use@test.local").orElseThrow();
        assertThat(passwordEncoder.matches("FirstNewPassword123!", user.getPasswordHash())).isTrue();
    }

    @Test
    @DisplayName("requesting a second link invalidates the first")
    void newRequestSupersedesTheOldLink() {
        fixtures.aCustomer("superseded@test.local", "OldPassword123!");
        mailer.bodies.clear();

        passwordResetService.requestReset("superseded@test.local");
        String firstToken = tokenFromLastEmail();
        passwordResetService.requestReset("superseded@test.local");
        String secondToken = tokenFromLastEmail();

        // An old link sitting in a mailbox must not remain a standing key to the account.
        assertThatThrownBy(() -> passwordResetService.resetPassword(firstToken, "Whatever123456!"))
                .isInstanceOf(BusinessRuleException.class);

        passwordResetService.resetPassword(secondToken, "TheRealNewPassword1!");
        User user = userRepository.findByEmail("superseded@test.local").orElseThrow();
        assertThat(passwordEncoder.matches("TheRealNewPassword1!", user.getPasswordHash())).isTrue();
    }

    @Test
    @DisplayName("an expired token is refused")
    void expiredTokenIsRefused() {
        fixtures.aCustomer("expired@test.local", "OldPassword123!");
        mailer.bodies.clear();
        passwordResetService.requestReset("expired@test.local");
        String token = tokenFromLastEmail();

        // Age the token past its TTL rather than waiting 30 minutes.
        jdbcTemplate.update(
                "UPDATE password_reset_token SET expires_at = ?",
                java.sql.Timestamp.from(java.time.Instant.now().minus(Duration.ofMinutes(1))));

        assertThatThrownBy(() -> passwordResetService.resetPassword(token, "TooLateNow123!"))
                .isInstanceOf(BusinessRuleException.class);
    }

    @Test
    @DisplayName("a made-up token is refused")
    void unknownTokenIsRefused() {
        assertThatThrownBy(() ->
                        passwordResetService.resetPassword("not-a-real-token", "Whatever123456!"))
                .isInstanceOf(BusinessRuleException.class);
    }

    @Test
    @DisplayName("the raw token is never stored")
    void storesOnlyTheHash() {
        fixtures.aCustomer("hashed@test.local", "OldPassword123!");
        mailer.bodies.clear();
        passwordResetService.requestReset("hashed@test.local");
        String token = tokenFromLastEmail();

        // A database leak must not yield usable reset links.
        String storedHash = tokenRepository.findAll().getFirst().getTokenHash();
        assertThat(storedHash).isNotEqualTo(token);
        assertThat(storedHash).hasSize(64); // SHA-256, hex-encoded
        assertThat(jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM password_reset_token WHERE token_hash = ?",
                        Integer.class,
                        token))
                .isZero();
    }

    /** Pulls the token out of the emailed link, exactly as a customer's browser would. */
    private String tokenFromLastEmail() {
        assertThat(mailer.bodies).isNotEmpty();
        String body = mailer.bodies.getLast();
        int index = body.indexOf("token=");
        assertThat(index).isNotNegative();
        return body.substring(index + "token=".length()).split("\\s", 2)[0];
    }
}
