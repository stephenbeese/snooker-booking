package uk.co.club.booking.domain.user;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.mail.Mailer;
import uk.co.club.booking.common.time.ClubClock;

/**
 * Password reset by emailed single-use token.
 *
 * <p>Three properties this has to hold, each of which is easy to lose:
 *
 * <ol>
 *   <li><b>No account enumeration.</b> Requesting a reset answers identically whether or not the
 *       address is registered. An endpoint that says "no such account" is a free membership
 *       oracle for anyone with a list of email addresses.
 *   <li><b>Single use, enforced by the database.</b> The claim is a guarded UPDATE, so two
 *       simultaneous submissions cannot both succeed.
 *   <li><b>Every session dies.</b> Someone resetting a password has usually lost control of the
 *       account; leaving the attacker's session alive would make the reset decorative.
 * </ol>
 */
@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    /** 32 bytes of SecureRandom: far beyond guessing, and short enough to sit in a URL. */
    private static final int TOKEN_BYTES = 32;

    private static final Duration TOKEN_TTL = Duration.ofMinutes(30);

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final SessionInvalidator sessionInvalidator;
    private final Mailer mailer;
    private final ClubClock clubClock;
    private final String baseUrl;

    // SecureRandom, never Random: a predictable token is a predictable account takeover.
    private final SecureRandom secureRandom = new SecureRandom();

    public PasswordResetService(
            UserRepository userRepository,
            PasswordResetTokenRepository tokenRepository,
            PasswordEncoder passwordEncoder,
            SessionInvalidator sessionInvalidator,
            Mailer mailer,
            ClubClock clubClock,
            @Value("${app.base-url}") String baseUrl) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.sessionInvalidator = sessionInvalidator;
        this.mailer = mailer;
        this.clubClock = clubClock;
        this.baseUrl = baseUrl;
    }

    /**
     * Issues a reset link, if the address belongs to an account.
     *
     * <p>Returns void, and the caller always answers 202. The absence of a return value is the
     * point: there is no way for a controller to accidentally leak whether the account existed.
     */
    @Transactional
    public void requestReset(String email) {
        Optional<User> maybeUser = userRepository.findByEmail(email.trim());

        if (maybeUser.isEmpty()) {
            // Logged, not returned. Staff investigating a support call can see it; the caller
            // cannot tell this apart from a successful send.
            log.info("Password reset requested for an address with no account");
            return;
        }

        User user = maybeUser.get();
        Instant now = clubClock.now();

        // Any previous link stops working the moment a new one is issued, so a link recovered
        // from an old mailbox is not a standing key to the account.
        tokenRepository.invalidateOutstanding(user.getId(), now);

        byte[] raw = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(raw);
        // URL-safe and unpadded: the token travels in a query string, where '+' and '/' would
        // be mangled and '=' invites truncation by mail clients.
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        tokenRepository.save(
                new PasswordResetToken(user.getId(), sha256(token), now.plus(TOKEN_TTL)));

        mailer.send(
                user.getEmail(),
                "Reset your password",
                """
                Hello %s,

                Use the link below to choose a new password. It expires in %d minutes and
                can only be used once.

                %s/reset-password?token=%s

                If you did not ask for this, you can ignore this email — your password has
                not changed.
                """
                        .formatted(
                                user.getFirstName(),
                                TOKEN_TTL.toMinutes(),
                                baseUrl,
                                token));
    }

    /**
     * Consumes a token and sets the new password.
     *
     * <p>Order matters: the token is claimed <em>before</em> the password is written. Claiming
     * afterwards would leave a window in which two concurrent requests both change the password,
     * and the loser's value is what sticks.
     */
    @Transactional
    public void resetPassword(String token, String newPassword) {
        PasswordResetToken record = tokenRepository
                .findByTokenHash(sha256(token))
                .orElseThrow(PasswordResetService::invalidToken);

        if (tokenRepository.claim(record.getId(), clubClock.now()) != 1) {
            // Already used, or expired. Deliberately the same error as an unknown token: telling
            // the difference would confirm that a token once existed.
            throw invalidToken();
        }

        User user = userRepository
                .findById(record.getUserId())
                .orElseThrow(PasswordResetService::invalidToken);

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        // Null, not the current session id: whoever is resetting arrived from their mailbox and
        // has no session worth keeping, while the attacker they are locking out very likely does.
        sessionInvalidator.invalidateAllExcept(user.getEmail(), null);

        log.info("Password reset completed for user {}", user.getId());
    }

    private static BusinessRuleException invalidToken() {
        return new BusinessRuleException(
                ErrorCode.INVALID_CREDENTIALS,
                "This reset link is invalid or has expired. Please request a new one.");
    }

    /**
     * SHA-256, hex-encoded, to match the {@code token_hash} column.
     *
     * <p>Fast on purpose — see {@link PasswordResetToken}. This is the one place in the system
     * where a fast hash is the correct choice for a secret.
     */
    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of()
                    .formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            // SHA-256 is mandated by the JLS; unreachable on any conformant JVM.
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }
}
