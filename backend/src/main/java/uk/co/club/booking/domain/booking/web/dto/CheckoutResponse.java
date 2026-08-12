package uk.co.club.booking.domain.booking.web.dto;

/**
 * A created booking plus where to send the customer to pay.
 *
 * @param booking the held booking, PENDING_PAYMENT until the money arrives
 * @param checkoutUrl Stripe-hosted Checkout page; the SPA performs a top-level redirect here
 */
public record CheckoutResponse(BookingResponse booking, String checkoutUrl) {}
