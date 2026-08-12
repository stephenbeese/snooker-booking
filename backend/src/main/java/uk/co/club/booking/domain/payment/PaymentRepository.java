package uk.co.club.booking.domain.payment;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByStripeCheckoutSessionId(String sessionId);

    Optional<Payment> findByStripePaymentIntentId(String paymentIntentId);

    List<Payment> findByBookingIdOrderByIdDesc(long bookingId);
}
