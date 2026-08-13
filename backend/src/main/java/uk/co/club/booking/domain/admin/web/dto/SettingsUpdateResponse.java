package uk.co.club.booking.domain.admin.web.dto;

import java.util.List;
import uk.co.club.booking.domain.club.SettingsService;

/**
 * The result of a settings change: what was saved, and what it affects.
 *
 * <p>The warnings are the reason this wrapper exists. Rules are applied when a booking is
 * made and never retroactively, so closing a Monday does not cancel Monday's bookings — but
 * staff would otherwise have no way of knowing they had just closed a day with eleven games
 * on it. The save succeeds either way; the club may be closing precisely because of an event
 * and intend to ring those customers.
 *
 * @param settings the saved state, so the client need not re-fetch
 * @param warnings future bookings the new rules would not have permitted; empty is the norm
 */
public record SettingsUpdateResponse<T>(T settings, List<Warning> warnings) {

    /** One affected booking, named so staff can act on it. */
    public record Warning(String reference, String detail) {
        static Warning from(SettingsService.Warning warning) {
            return new Warning(warning.reference(), warning.detail());
        }
    }

    public static <T> SettingsUpdateResponse<T> of(
            T settings, List<SettingsService.Warning> warnings) {
        return new SettingsUpdateResponse<>(settings, warnings.stream().map(Warning::from).toList());
    }
}
