package uk.co.club.booking.domain.booking.web.dto;

import jakarta.validation.constraints.Size;

/**
 * Optional detail supplied when cancelling.
 *
 * <p>The reason is free text and never a rule: nothing branches on it, so a customer cannot
 * unlock a late cancellation by typing the right words. It is recorded for staff to read.
 */
public record CancelBookingRequest(@Size(max = 500) String reason) {}
