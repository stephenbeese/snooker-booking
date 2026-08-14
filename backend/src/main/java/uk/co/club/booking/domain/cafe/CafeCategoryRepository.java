package uk.co.club.booking.domain.cafe;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CafeCategoryRepository extends JpaRepository<CafeCategory, String> {

    List<CafeCategory> findAllByOrderByDisplayOrderAscCodeAsc();

    /** Only the categories a new or edited item may be given. */
    List<CafeCategory> findByActiveTrueOrderByDisplayOrderAscCodeAsc();

    boolean existsByCodeAndActiveTrue(String code);
}
