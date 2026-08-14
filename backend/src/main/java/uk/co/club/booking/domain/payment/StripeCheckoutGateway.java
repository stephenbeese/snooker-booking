package uk.co.club.booking.domain.payment;

import com.stripe.StripeClient;
import com.stripe.exception.StripeException;
import com.stripe.model.checkout.Session;
import com.stripe.net.RequestOptions;
import com.stripe.param.checkout.SessionCreateParams;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;

/**
 * Stripe Checkout (hosted redirect).
 *
 * <p>Chosen over Payment Elements because it keeps card data entirely off our origin (PCI SAQ
 * A rather than SAQ A-EP), and Stripe handles 3-D Secure, SCA and wallets without us
 * implementing any of it.
 */
@Component
public class StripeCheckoutGateway implements CheckoutGateway {

    private static final Logger log = LoggerFactory.getLogger(StripeCheckoutGateway.class);

    private final StripeClient stripe;

    public StripeCheckoutGateway(StripeProperties properties) {
        // Instance client rather than the static Stripe.apiKey global: a global key is
        // process-wide mutable state that tests can trample on each other with.
        this.stripe = new StripeClient(properties.secretKey());
    }

    @Override
    public CheckoutSession createSession(CheckoutRequest request, String idempotencyKey) {
        SessionCreateParams.Builder params = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.PAYMENT)
                .setSuccessUrl(request.successUrl())
                .setCancelUrl(request.cancelUrl())
                // Both set deliberately: metadata rides on the PaymentIntent and is what the
                // webhook reads, while clientReferenceId shows in the Stripe dashboard, which
                // is where staff look when a customer phones about a payment.
                .putMetadata("bookingId", String.valueOf(request.bookingId()))
                .putMetadata("bookingReference", request.bookingReference())
                .setClientReferenceId(request.bookingReference())
                .addLineItem(SessionCreateParams.LineItem.builder()
                        .setQuantity(1L)
                        .setPriceData(SessionCreateParams.LineItem.PriceData.builder()
                                .setCurrency(request.currency())
                                // Already in the smallest unit; Stripe wants pence, and so do we.
                                .setUnitAmount((long) request.amountPence())
                                .setProductData(
                                        SessionCreateParams.LineItem.PriceData.ProductData.builder()
                                                .setName(request.description())
                                                .build())
                                .build())
                        .build());

        // Prefills the Checkout page and gives Stripe somewhere to send the receipt. Absent
        // for a telephone booking taken for someone with no email on file.
        if (request.customerEmail() != null && !request.customerEmail().isBlank()) {
            params.setCustomerEmail(request.customerEmail());
        }

        // Keyed on the booking reference: if the network drops after Stripe created the
        // session but before we saw the response, the retry returns that same session rather
        // than creating a second one the customer could also pay.
        RequestOptions options =
                RequestOptions.builder().setIdempotencyKey(idempotencyKey).build();

        try {
            Session session = stripe.checkout().sessions().create(params.build(), options);
            return new CheckoutSession(session.getId(), session.getUrl(), session.getPaymentIntent());
        } catch (StripeException ex) {
            // Log the provider's detail; give the customer something actionable and generic.
            log.error(
                    "Stripe rejected checkout session creation for booking {}: {}",
                    request.bookingReference(),
                    ex.getMessage());
            throw new BusinessRuleException(
                    ErrorCode.PAYMENT_PROVIDER_ERROR,
                    "We could not start the payment. Your slot is held for a few more minutes — "
                            + "please try again.");
        }
    }

    @Override
    public Optional<CheckoutGateway.SessionState> fetchSession(String sessionId) {
        try {
            Session session = stripe.checkout().sessions().retrieve(sessionId);
            return Optional.of(new CheckoutGateway.SessionState(
                    session.getId(),
                    // "paid" is Stripe's own word for the money having been taken. Deliberately
                    // not derived from status == "complete": a session completed with a zero
                    // total or an async method that later fails is complete but not paid.
                    "paid".equals(session.getPaymentStatus()),
                    // Only an open session can still be paid, so only an open one is worth
                    // handing back to the customer instead of creating another.
                    "open".equals(session.getStatus()),
                    session.getUrl(),
                    session.getPaymentIntent()));
        } catch (StripeException ex) {
            // Empty means "could not find out", never "not paid". The caller must not treat an
            // unreachable Stripe as licence to start a second checkout — that is precisely how
            // a customer gets charged twice.
            log.warn("Could not retrieve Stripe session {}: {}", sessionId, ex.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public void expireSession(String sessionId) {
        try {
            stripe.checkout().sessions().expire(sessionId);
        } catch (StripeException ex) {
            // Never fatal. The session may already be complete or expired, and a failure here
            // must not prevent the local hold from being released — that would keep a slot
            // locked because a third party was unreachable.
            log.warn("Could not expire Stripe session {}: {}", sessionId, ex.getMessage());
        }
    }
}
