package uk.co.club.booking.domain.table;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A kind of table the club holds.
 *
 * <p>Data rather than a Java enum, so a manager can add one without a deployment. The trade is
 * that no compile-time exhaustiveness check remains — nothing stops a switch over types missing
 * a case — so code that varies behaviour by type must handle the unknown type explicitly.
 * Nothing does today: types are a label and a pricing dimension, both of which are lookups.
 *
 * <p>The code is the identifier and is immutable once created, because {@code snooker_table} and
 * {@code pricing_rule} reference it by value. The label is what staff and customers read, and
 * can be corrected freely.
 */
@Entity
@Table(name = "table_type")
public class TableTypeEntity {

    /**
     * The code every club starts with, seeded by V15 and used as the default for a new table.
     *
     * <p>A constant rather than a magic string in three places. It is not special otherwise —
     * it can be renamed or deactivated like any other, so nothing may assume it exists beyond
     * the initial default.
     */
    public static final String SNOOKER = "SNOOKER";

    @Id
    @Column(name = "code", nullable = false, updatable = false)
    private String code;

    @Column(name = "label", nullable = false)
    private String label;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    protected TableTypeEntity() {
        // for JPA
    }

    public TableTypeEntity(String code, String label, int displayOrder) {
        this.code = code;
        this.label = label;
        this.displayOrder = displayOrder;
    }

    public String getCode() {
        return code;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
