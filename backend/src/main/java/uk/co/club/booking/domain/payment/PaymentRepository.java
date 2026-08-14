package uk.co.club.booking.domain.payment;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByStripeCheckoutSessionId(String sessionId);

    Optional<Payment> findByStripePaymentIntentId(String paymentIntentId);

    List<Payment> findByBookingIdOrderByIdDesc(long bookingId);

    /**
     * Every payment for a page of bookings, in one query.
     *
     * <p>Exists because the admin booking list renders payment state per row. Fetching that with
     * {@link #findByBookingIdOrderByIdDesc} inside the mapping loop would issue one query per
     * booking — 25 extra round trips for a default page, growing with the page size.
     *
     * <p>Ordered so that callers grouping by booking see the newest attempt first, matching the
     * single-booking method above.
     */
    List<Payment> findByBookingIdInOrderByIdDesc(Collection<Long> bookingIds);
}
