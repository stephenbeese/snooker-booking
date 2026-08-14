package uk.co.club.booking.domain.cafe;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CafeItemRepository extends JpaRepository<CafeItem, Long> {

    List<CafeItem> findAllByOrderByDisplayOrderAscIdAsc();

    /** What is actually on sale. The public menu, and never the admin list. */
    List<CafeItem> findByActiveTrueOrderByDisplayOrderAscIdAsc();

    /**
     * How many items carry a category, withdrawn ones included.
     *
     * <p>Deliberately not filtered to active items: a withdrawn item put back later would
     * otherwise find its category gone, which is the orphan the withdrawal check exists to stop.
     */
    long countByCategoryCode(String categoryCode);
}
