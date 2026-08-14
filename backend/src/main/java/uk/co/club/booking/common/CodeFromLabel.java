package uk.co.club.booking.common;

import java.util.Locale;

/**
 * Turns a human label into a stable identifier code.
 *
 * <p>"Chinese pool" becomes {@code CHINESE_POOL}; "Wine &amp; spirits" becomes
 * {@code WINE_SPIRITS}. Used wherever staff name a thing rather than choose an identifier for
 * it — table types and cafe categories both work this way, and a form asking for both would
 * invite codes that disagree with their labels.
 *
 * <p>Shared rather than copied into each service. The rule is not obvious — the trailing-underscore
 * trim and the leading-digit prefix each exist because a specific label would otherwise produce a
 * code the CHECK constraints reject — and two copies would drift the moment one was fixed.
 */
public final class CodeFromLabel {

    private CodeFromLabel() {}

    /**
     * Derives the code, or returns empty when the label yields nothing usable.
     *
     * <p>Empty is reachable for a label of only punctuation or of non-Latin script, which would
     * otherwise produce an empty primary key and a 500 from the CHECK. Callers turn it into a
     * message naming the problem.
     */
    public static String derive(String label) {
        String code = label.toUpperCase(Locale.ROOT)
                // Anything not a letter or digit becomes an underscore, runs collapse, and the
                // ends are trimmed — so "Pool (8-ball)" gives POOL_8_BALL rather than a code with
                // trailing underscores the CHECK would reject.
                .replaceAll("[^A-Z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        // The CHECK requires a leading letter; a label starting with a digit would fail it.
        if (code.isEmpty()) {
            return "";
        }
        return Character.isDigit(code.charAt(0)) ? "T_" + code : code;
    }
}
