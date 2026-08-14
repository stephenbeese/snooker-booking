package uk.co.club.booking.domain.cafe;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CafeItemRepository extends JpaRepository<CafeItem, Long> {

    List<CafeItem> findAllByOrderByDisplayOrderAscIdAsc();
}
