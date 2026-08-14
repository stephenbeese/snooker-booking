package uk.co.club.booking.domain.payment;

import com.stripe.model.Charge;
import com.stripe.model.Event;
import com.stripe.model.PaymentIntent;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.time.ClubClock;

/**
 * Turns a verified Stripe event into a change in our own state.
 *
 * <h2>Which events, and why not the obvious ones</h2>
 *
 * Only {@code checkout.session.completed} confirms a booking. It is tempting to also handle
 * {@code payment_intent.succeeded}, since it clearly means the money arrived — but Stripe sends
 * both for the same payment, and handling both is the classic double-confirmation bug. One
 * event, one meaning.
 *
 * <p>{@code payment_status} is asserted to be {@code "paid"} before anything is confirmed. A
 * completed session is not necessarily a paid one: delayed payment methods complete the session
 * and settle later.
 */
@Service
public class StripeWebhookProcessor {

    private static final Logger log = LoggerFactory.getLogger(StripeWebhookProcessor.class);

    private final WebhookEventRepository webhookEventRepository;
    private final PaymentService paymentService;
    private final ClubClock clubClock;

    public StripeWebhookProcessor(
            WebhookEventRepository webhookEventRepository,
            PaymentService paymentService,
            ClubClock clubClock) {
        this.webhookEventRepository = webhookEventRepository;
        this.paymentService = paymentService;
        this.clubClock = clubClock;
    }

    /**
     * Processes one event exactly once.
     *
     * <p>The event id is inserted in the <em>same transaction</em> as the work it describes. A
     * redelivery therefore hits the primary key and rolls back the duplicate processing with it.
     * Recording it in a separate transaction would leave a window in which the work is done but
     * the marker is not, and a redelivery would do the work twice.
     */
    @Transactional
    public void process(Event event, String rawPayload) {
        try {
            webhookEventRepository.saveAndFlush(
                    new WebhookEvent(event.getId(), event.getType(), rawPayload));
        } catch (DataIntegrityViolationException ex) {
            log.debug("Stripe event {} already processed; ignoring redelivery", event.getId());
            return;
        }

        switch (event.getType()) {
            case "checkout.session.completed" -> handleSessionCompleted(event);
            case "checkout.session.expired" -> handleSessionExpired(event);
            case "payment_intent.payment_failed" -> handlePaymentFailed(event);
            case "charge.refunded" -> handleRefund(event);
            // Stripe sends far more than we subscribe to. Recording and ignoring is correct;
            // erroring would make Stripe retry an event we will never care about.
            default -> log.debug("Ignoring Stripe event type {}", event.getType());
        }

        webhookEventRepository
                .findById(event.getId())
                .ifPresent(record -> record.markProcessed(clubClock.now()));
    }

    private void handleSessionCompleted(Event event) {
        Optional<Session> maybeSession = deserialize(event, Session.class);
        if (maybeSession.isEmpty()) {
            return;
        }
        Session session = maybeSession.get();

        // A completed session is not always a paid one — "unpaid" happens with delayed payment
        // methods. Confirming on completion alone would give away a table for nothing.
        if (!"paid".equals(session.getPaymentStatus())) {
            log.info(
                    "Checkout session {} completed with payment_status={}; not confirming",
                    session.getId(),
                    session.getPaymentStatus());
            return;
        }

        paymentService.markPaid(session.getId(), session.getPaymentIntent(), null);
    }

    private void handleSessionExpired(Event event) {
        deserialize(event, Session.class)
                .ifPresent(session -> log.info(
                        "Checkout session {} expired; the hold sweeper will release the slot",
                        session.getId()));
    }

    private void handlePaymentFailed(Event event) {
        deserialize(event, PaymentIntent.class).ifPresent(intent -> {
            String code = null;
            String message = null;
            if (intent.getLastPaymentError() != null) {
                code = intent.getLastPaymentError().getCode();
                // A coarse category such as "card_declined" — never card data.
                message = intent.getLastPaymentError().getMessage();
            }
            paymentService.markFailed(intent.getId(), code, message);
        });
    }

    private void handleRefund(Event event) {
        // Records the outcome so the club's view of the money cannot silently diverge from
        // Stripe's. Both sources land here: refunds this application issues on a cancellation
        // inside the notice period, and refunds staff issue by hand in the Stripe dashboard,
        // which is still how anything needing a judgement is done.
        deserialize(event, Charge.class).ifPresent(charge -> {
            if (charge.getPaymentIntent() == null) {
                log.warn("Refund event {} carries no payment intent", event.getId());
                return;
            }
            // getAmountRefunded is cumulative across every refund on the charge, which is what
            // makes "partial" mean partial: two half refunds are one whole one, and reading a
            // single refund's amount would record the second as partial forever.
            paymentService.markRefunded(
                    charge.getPaymentIntent(), Math.toIntExact(charge.getAmountRefunded()));
        });
    }

    /**
     * Deserialises the event payload.
     *
     * <p>{@code getObject()} returns empty when the event's API version differs from the SDK's,
     * which happens after a Stripe dashboard upgrade and is otherwise invisible. Logging loudly
     * here turns a silent "payments stopped confirming" into an obvious message.
     */
    private <T extends StripeObject> Optional<T> deserialize(Event event, Class<T> type) {
        Optional<StripeObject> object = event.getDataObjectDeserializer().getObject();
        if (object.isEmpty()) {
            log.error(
                    "Could not deserialise Stripe event {} ({}). The API version of the event "
                            + "probably differs from the SDK's — check the Stripe dashboard.",
                    event.getId(),
                    event.getType());
            return Optional.empty();
        }
        if (!type.isInstance(object.get())) {
            log.error(
                    "Stripe event {} carried a {} where {} was expected",
                    event.getId(),
                    object.get().getClass().getSimpleName(),
                    type.getSimpleName());
            return Optional.empty();
        }
        return Optional.of(type.cast(object.get()));
    }
}
