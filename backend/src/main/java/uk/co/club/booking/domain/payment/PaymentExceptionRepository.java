package uk.co.club.booking.domain.payment;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentExceptionRepository extends JpaRepository<PaymentException, Long> {

    /** The staff queue: anomalies nobody has dealt with yet. */
    List<PaymentException> findByResolvedAtIsNullOrderByCreatedAtAsc();
}
