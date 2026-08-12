package uk.co.club.booking.domain.club;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PricingRuleRepository extends JpaRepository<PricingRule, Long> {

    /** Active rules, most specific first, so the first match wins. */
    List<PricingRule> findAllByActiveTrueOrderByPriorityDesc();
}
