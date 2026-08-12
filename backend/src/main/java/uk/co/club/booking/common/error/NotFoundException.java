package uk.co.club.booking.common.error;

/** A referenced resource does not exist. Maps to 404. */
public class NotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final ErrorCode code;

    public NotFoundException(ErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    public ErrorCode getCode() {
        return code;
    }
}
