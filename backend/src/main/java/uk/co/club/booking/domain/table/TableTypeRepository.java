package uk.co.club.booking.domain.table;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TableTypeRepository extends JpaRepository<TableTypeEntity, String> {

    List<TableTypeEntity> findAllByOrderByDisplayOrderAscCodeAsc();

    /** Only the types a new table or pricing rule may be given. */
    List<TableTypeEntity> findByActiveTrueOrderByDisplayOrderAscCodeAsc();

    boolean existsByCodeAndActiveTrue(String code);
}
