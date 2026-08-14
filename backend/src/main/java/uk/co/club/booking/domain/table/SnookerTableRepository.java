package uk.co.club.booking.domain.table;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SnookerTableRepository extends JpaRepository<SnookerTable, Long> {

    List<SnookerTable> findAllByActiveTrueOrderByDisplayOrderAscIdAsc();

    List<SnookerTable> findAllByOrderByDisplayOrderAscIdAsc();

    /**
     * How many tables carry a type. Counts inactive tables too: a deactivated table still
     * references its type, and letting the type be withdrawn would leave that table
     * unrestorable without first re-creating the type.
     */
    long countByTableType(String tableType);
}
