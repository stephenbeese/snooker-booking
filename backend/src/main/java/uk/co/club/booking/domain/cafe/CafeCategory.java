package uk.co.club.booking.domain.cafe;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A section of the menu.
 *
 * <p>Data rather than a Java enum, for the same reason table types are: a manager adds one
 * without a deployment. The code is the identifier and immutable once created, because
 * {@code cafe_item} references it by value; the label is what customers read and can be
 * corrected freely.
 */
@Entity
@Table(name = "cafe_category")
public class CafeCategory {

    @Id
    @Column(name = "code", nullable = false, updatable = false)
    private String code;

    @Column(name = "label", nullable = false)
    private String label;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    protected CafeCategory() {
        // for JPA
    }

    public CafeCategory(String code, String label, int displayOrder) {
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
