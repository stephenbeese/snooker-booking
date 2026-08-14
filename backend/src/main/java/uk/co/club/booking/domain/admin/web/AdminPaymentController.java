package uk.co.club.booking.domain.admin.web;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.admin.PaymentDecisionService;
import uk.co.club.booking.domain.admin.web.dto.PaymentDecisionResponse;
import uk.co.club.booking.security.AppUserPrincipal;

/**
 * The payment decisions queue.
 *
 * <p>STAFF as well as ADMIN, by falling through {@code SecurityConfig}'s {@code /api/admin/**}
 * rule rather than being listed in the ADMIN-only block above it. Deliberate: whoever is on the
 * counter is who a customer asks about a refund, and the alternative is a queue only a manager
 * can clear while the person actually holding the conversation cannot.
 *
 * <p>Authorisation is not implemented here, for the reason {@code AdminBookingController}
 * gives: a per-method check would be a second place to forget.
 */
@RestController
@RequestMapping("/api/admin/payments")
public class AdminPaymentController {

    private final PaymentDecisionService decisionService;

    public AdminPaymentController(PaymentDecisionService decisionService) {
        this.decisionService = decisionService;
    }

    @GetMapping("/decisions")
    public List<PaymentDecisionResponse> decisions() {
        return decisionService.unresolved();
    }

    /** Sends the money back and closes the decision. */
    @PostMapping("/decisions/{id}/refund")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void refund(@PathVariable long id, @AuthenticationPrincipal AppUserPrincipal principal) {
        decisionService.refund(id, principal.id());
    }

    /**
     * Closes the decision without moving money — settled with the customer some other way.
     *
     * <p>The acting user comes from the session and is stamped on the row, so who cleared a
     * money question cannot be forged by the request body.
     */
    @PostMapping("/decisions/{id}/resolve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resolve(
            @PathVariable long id, @AuthenticationPrincipal AppUserPrincipal principal) {
        decisionService.resolve(id, principal.id());
    }
}
