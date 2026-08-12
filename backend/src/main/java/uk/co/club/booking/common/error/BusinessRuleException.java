package uk.co.club.booking.common.error;

/**
 * A request that is well-formed but violates a club rule. Maps to 422, distinguishing
 * "you asked for something not allowed" from "your request was malformed" (400).
 */
public class BusinessRuleException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final ErrorCode code;

    public BusinessRuleException(ErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    public ErrorCode getCode() {
        return code;
    }
}
