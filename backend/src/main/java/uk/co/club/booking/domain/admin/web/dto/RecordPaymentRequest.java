package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.NotNull;
import uk.co.club.booking.domain.payment.PaymentStatus;

/**
 * Staff recording money taken at the counter.
 *
 * <p>No amount field: the club is owed what the booking costs, priced by its own rules. Letting
 * staff type a figure would put the till out of step with the booking and invite a typo that
 * nobody could later reconcile. Part payments are out of scope for the MVP.
 *
 * <p>The status is validated again in {@code PaymentService.settleAtCounter}, which accepts only
 * {@code PAID_AT_COUNTER} and {@code WAIVED} — the binding here would otherwise let a request
 * name {@code SUCCEEDED} and fake a Stripe outcome.
 *
 * @param status {@code PAID_AT_COUNTER} when money changed hands, {@code WAIVED} when comped
 */
public record RecordPaymentRequest(@NotNull PaymentStatus status) {}
