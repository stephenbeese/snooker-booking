package uk.co.club.booking.common.error;

/**
 * Lost the race for a slot: the database's overlap constraint rejected the insert.
 *
 * <p>Maps to 409, not 422. The distinction matters to the client: a 422 means "your request
 * breaks a rule, change it", whereas a 409 means "your request was fine but someone got there
 * first" — so the SPA refetches availability and invites the customer to pick again, rather
 * than showing a validation error against a slot that looked perfectly valid when clicked.
 */
public class SlotTakenException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public SlotTakenException(String message) {
        super(message);
    }

    public ErrorCode getCode() {
        return ErrorCode.SLOT_UNAVAILABLE;
    }
}
