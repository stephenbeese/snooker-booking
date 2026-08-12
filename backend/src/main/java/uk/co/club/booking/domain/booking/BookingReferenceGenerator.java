package uk.co.club.booking.domain.booking;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/**
 * Generates the human-facing booking reference, e.g. {@code SNK-7F3K2A}.
 *
 * <p>Exists so URLs and phone conversations never involve the primary key: a sequential id
 * lets anyone enumerate every booking in the club by counting, and reading "booking one
 * thousand and forty-two" down the phone invites transcription errors.
 *
 * <p>The alphabet omits I, O, 0 and 1, which are the pairs people misread and mistype when
 * repeating a code aloud.
 */
@Component
public class BookingReferenceGenerator {

    private static final String PREFIX = "SNK-";
    private static final char[] ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int LENGTH = 6;

    /**
     * 32^6 ≈ 1.07 billion combinations, so collisions are vanishingly rare — but "rare" is
     * not "impossible", and the caller retries on the unique-constraint violation rather
     * than assuming.
     */
    private final SecureRandom random = new SecureRandom();

    public String generate() {
        StringBuilder reference = new StringBuilder(PREFIX);
        for (int i = 0; i < LENGTH; i++) {
            reference.append(ALPHABET[random.nextInt(ALPHABET.length)]);
        }
        return reference.toString();
    }
}
