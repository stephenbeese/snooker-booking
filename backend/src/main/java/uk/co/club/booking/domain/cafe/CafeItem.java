package uk.co.club.booking.domain.cafe;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Something the club sells at the cafe or bar.
 *
 * <p>Deactivated rather than deleted, for the same reason tables are: a withdrawn item must stay
 * explicable, and once bills exist a deleted row would orphan the lines that reference it.
 */
@Entity
@Table(name = "cafe_item")
public class CafeItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    private String description;

    /** Integer pence, as all money in this system is. Never a float. */
    @Column(name = "price_pence", nullable = false)
    private int pricePence;

    /** A link to an image the club already hosts, not an upload. See V16 for why. */
    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    protected CafeItem() {
        // for JPA
    }

    public CafeItem(String name, int pricePence, int displayOrder) {
        this.name = name;
        this.pricePence = pricePence;
        this.displayOrder = displayOrder;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public int getPricePence() {
        return pricePence;
    }

    public void setPricePence(int pricePence) {
        this.pricePence = pricePence;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
