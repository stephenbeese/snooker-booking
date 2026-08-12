package uk.co.club.booking.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;

/**
 * The single error envelope for every API failure. Never contains a stack trace or
 * internal detail.
 *
 * @param code machine-readable code the client switches on
 * @param message human-readable summary, safe to display
 * @param fieldErrors per-field messages for form validation failures
 * @param traceId correlates a user report with server logs
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(String code, String message, Map<String, String> fieldErrors, String traceId) {

    public static ApiError of(ErrorCode code, String message, String traceId) {
        return new ApiError(code.name(), message, Map.of(), traceId);
    }

    public static ApiError withFields(
            ErrorCode code, String message, Map<String, String> fieldErrors, String traceId) {
        return new ApiError(code.name(), message, fieldErrors, traceId);
    }
}
