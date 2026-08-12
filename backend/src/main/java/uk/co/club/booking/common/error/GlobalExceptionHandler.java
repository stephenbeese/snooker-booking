package uk.co.club.booking.common.error;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Translates exceptions into the {@link ApiError} envelope so the client never receives
 * a stack trace or an unstructured error.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessRuleException.class)
    ResponseEntity<ApiError> handleBusinessRule(BusinessRuleException ex) {
        // Expected outcome, not a defect: log at debug so real problems stay visible.
        log.debug("Business rule rejected request: {} - {}", ex.getCode(), ex.getMessage());
        // 422. Named UNPROCESSABLE_CONTENT since Spring 7; same status code.
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_CONTENT)
                .body(ApiError.of(ex.getCode(), ex.getMessage(), newTraceId()));
    }

    @ExceptionHandler(SlotTakenException.class)
    ResponseEntity<ApiError> handleSlotTaken(SlotTakenException ex) {
        // 409, so the client refetches availability rather than showing a field error.
        log.debug("Slot lost to a concurrent booking: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiError.of(ex.getCode(), ex.getMessage(), newTraceId()));
    }

    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiError> handleNotFound(NotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiError.of(ex.getCode(), ex.getMessage(), newTraceId()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = new HashMap<>();
        ex.getBindingResult()
                .getFieldErrors()
                .forEach(error -> fieldErrors.putIfAbsent(
                        error.getField(),
                        error.getDefaultMessage() == null ? "is invalid" : error.getDefaultMessage()));
        return ResponseEntity.badRequest()
                .body(ApiError.withFields(
                        ErrorCode.VALIDATION_FAILED,
                        "Some fields need attention.",
                        fieldErrors,
                        newTraceId()));
    }

    @ExceptionHandler({
        MissingServletRequestParameterException.class,
        MethodArgumentTypeMismatchException.class,
        HandlerMethodValidationException.class,
        IllegalArgumentException.class
    })
    ResponseEntity<ApiError> handleBadRequest(Exception ex) {
        log.debug("Rejected malformed request: {}", ex.getMessage());
        return ResponseEntity.badRequest()
                .body(ApiError.of(
                        ErrorCode.INVALID_REQUEST,
                        "The request could not be understood. Please check the values supplied.",
                        newTraceId()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException ex) {
        // Deliberately terse: never reveal whether the resource exists.
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiError.of(
                        ErrorCode.ACCESS_DENIED, "You do not have access to this.", newTraceId()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
        String traceId = newTraceId();
        // Full detail to the log, generic message to the caller.
        log.error("Unhandled exception [traceId={}] on {} {}",
                traceId, request.getMethod(), request.getRequestURI(), ex);
        return ResponseEntity.internalServerError()
                .body(ApiError.of(
                        ErrorCode.UNEXPECTED_ERROR,
                        "Something went wrong. Please try again.",
                        traceId));
    }

    private String newTraceId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
