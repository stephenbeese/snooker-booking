package uk.co.club.booking.domain.table;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SnookerTableRepository extends JpaRepository<SnookerTable, Long> {

    List<SnookerTable> findAllByActiveTrueOrderByDisplayOrderAscIdAsc();

    List<SnookerTable> findAllByOrderByDisplayOrderAscIdAsc();
}
