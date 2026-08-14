package uk.co.club.booking.domain.booking;

import java.time.Instant;
import java.util.List;
import org.hibernate.exception.ConstraintViolationException;
import org.postgresql.util.PSQLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;
import uk.co.club.booking.common.error.SlotTakenException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.BookingSettingsRepository;
import uk.co.club.booking.domain.club.PricingService;
import uk.co.club.booking.domain.table.SnookerTable;

/**
 * The single path by which a booking is created.
 *
 * <h2>How double booking is actually prevented</h2>
 *
 * Not by checking availability and then inserting. That sequence is a race by construction:
 * between the check and the insert, another request can do the same check and insert too, and
 * no amount of application-level care closes the gap. Both requests see a free slot; both
 * write; the club has sold one table twice.
 *
 * <p>Instead the {@code booking_no_overlap} EXCLUDE constraint (migration V8) makes an
 * overlapping pair <em>unstorable</em>. PostgreSQL serialises the exclusion check internally,
 * so of two concurrent conflicting inserts one blocks until the other commits and then fails.
 * Verified against PostgreSQL 17 by {@code BookingConcurrencyIT}: eight threads racing for the
 * same slot leave exactly one booking.
 *
 * <p>This needs no {@code SELECT FOR UPDATE}, no advisory lock, no {@code SERIALIZABLE}
 * isolation and no retry loop. Those were all considered and rejected as redundant: the
 * constraint already holds at READ COMMITTED, and a table-level mutex would needlessly
 * serialise bookings for different times on the same table.
 *
 * <p>{@link BookingValidator} still checks for a clash first. That is purely so the common
 * case produces "that slot has gone" instead of a database error, and it is explicitly
 * allowed to lose the race.
 */
@Service
public class BookingService {

    private static final Logger log = LoggerFactory.getLogger(BookingService.class);

    /** Name of the EXCLUDE constraint in V8. Matched on so no other failure is mistaken for it. */
    private static final String OVERLAP_CONSTRAINT = "booking_no_overlap";

    private static final int REFERENCE_ATTEMPTS = 5;

    /** PostgreSQL SQLState for exclusion_violation. */
    private static final String EXCLUSION_VIOLATION_SQL_STATE = "23P01";

    private final BookingRepository bookingRepository;
    private final BookingValidator validator;
    private final CancellationPolicy cancellationPolicy;
    private final BookingSettingsRepository bookingSettingsRepository;
    private final PricingService pricingService;
    private final BookingReferenceGenerator referenceGenerator;
    private final ClubClock clubClock;

    public BookingService(
            BookingRepository bookingRepository,
            BookingValidator validator,
            CancellationPolicy cancellationPolicy,
            BookingSettingsRepository bookingSettingsRepository,
            PricingService pricingService,
            BookingReferenceGenerator referenceGenerator,
            ClubClock clubClock) {
        this.bookingRepository = bookingRepository;
        this.validator = validator;
        this.cancellationPolicy = cancellationPolicy;
        this.bookingSettingsRepository = bookingSettingsRepository;
        this.pricingService = pricingService;
        this.referenceGenerator = referenceGenerator;
        this.clubClock = clubClock;
    }

    /**
     * Creates a booking, applying every rule in {@link BookingValidator} and letting the
     * database adjudicate the slot.
     *
     * @throws SlotTakenException (409) if another booking won the race
     */
    @Transactional
    public Booking create(CreateBookingCommand command, BookingPolicy policy) {
        SnookerTable table = validator.validate(command, policy);
        BookingSettings settings = BookingSettings.require(bookingSettingsRepository.findSingleton());
        Instant now = clubClock.now();

        // A lapsed hold still blocks the slot at the database level, because an index
        // predicate cannot call now(). Expire it here so the customer is not told a slot is
        // taken by a hold that timed out ten minutes ago.
        releaseLapsedHolds(command, now);

        Booking booking = new Booking();
        booking.setSnookerTable(table);
        booking.setStartAt(command.startAt());
        booking.setEndAt(command.endAt());
        booking.setDurationMinutes(command.durationMinutes());
        // Server-computed, always. A price in the request body is ignored.
        booking.setPricePence(
                pricingService.quotePence(table, command.startAt(), command.endAt()));
        booking.setSource(command.source());
        booking.setUserId(command.userId());
        booking.setCustomerName(command.customerName());
        booking.setCustomerEmail(command.customerEmail());
        booking.setCustomerPhone(command.customerPhone());
        booking.setNotes(command.notes());
        booking.setCreatedByUserId(command.actingUserId());

        if (policy.requiresPaymentHold()) {
            booking.setStatus(BookingStatus.PENDING_PAYMENT);
            booking.setHoldExpiresAt(now.plus(settings.paymentHold()));
        } else {
            booking.setStatus(BookingStatus.CONFIRMED);
            // Must stay null: a CHECK constraint enforces that a hold expiry exists if and
            // only if the status is PENDING_PAYMENT.
            booking.setHoldExpiresAt(null);
        }

        return persistWithUniqueReference(booking);
    }

    /**
     * Saves, translating the two constraint violations that are expected rather than
     * exceptional.
     *
     * <p>{@code saveAndFlush} is load-bearing. A plain {@code save} defers the INSERT to
     * commit, which happens <em>after</em> this method returns and outside any try block here,
     * so the violation would escape as an unhandled 500 no matter how carefully it was caught.
     */
    private Booking persistWithUniqueReference(Booking booking) {
        for (int attempt = 1; attempt <= REFERENCE_ATTEMPTS; attempt++) {
            booking.setReference(referenceGenerator.generate());
            try {
                return bookingRepository.saveAndFlush(booking);
            } catch (PessimisticLockingFailureException ex) {
                // Deadlock while checking the exclusion constraint. Observed under genuine
                // concurrency: two inserts for the same slot can each hold a lock the other
                // needs while the gist index is consulted, and PostgreSQL breaks the tie by
                // aborting one of them (SQLState 40P01).
                //
                // Caught at this supertype rather than at CannotAcquireLockException, because
                // Spring maps the same PostgreSQL deadlock to different subclasses depending on
                // the access path (JPA vs JdbcTemplate). Catching the narrow type let the
                // sibling escape as a 500.
                //
                // From the customer's point of view this is identical to losing the race —
                // they did not get the slot — so it must surface as 409. It is deliberately
                // NOT retried: the winner's row is committed by the time this is thrown, so a
                // retry would only fail again on the constraint.
                log.debug(
                        "Deadlock while inserting booking for table {} at {}; treating as lost race",
                        booking.getSnookerTable().getId(),
                        booking.getStartAt());
                throw new SlotTakenException(
                        "That slot has just been booked by someone else. Please choose another.");
            } catch (DataIntegrityViolationException ex) {
                String constraint = constraintNameOf(ex);
                if (OVERLAP_CONSTRAINT.equals(constraint)) {
                    // Lost the race. Expected under concurrency, not a defect.
                    log.debug(
                            "Overlap constraint rejected booking for table {} at {}",
                            booking.getSnookerTable().getId(),
                            booking.getStartAt());
                    throw new SlotTakenException(
                            "That slot has just been booked by someone else. Please choose another.");
                }
                if (isReferenceCollision(constraint)) {
                    // 1-in-a-billion; retry with a new reference rather than failing a real sale.
                    log.info("Booking reference collision on attempt {}; regenerating", attempt);
                    continue;
                }
                // Anything else is a genuine bug and must not be disguised as a lost race.
                throw ex;
            }
        }
        throw new IllegalStateException(
                "Could not generate a unique booking reference after " + REFERENCE_ATTEMPTS
                        + " attempts");
    }

    /**
     * Moves a booking to a new time, a new table, or both.
     *
     * <p>The hazard is specific: releasing the old slot and taking the new one must be one
     * atomic act, or the moment between them is a window in which the table can be sold twice.
     * It is atomic here for the same reason creation is — the row is updated in one transaction
     * and {@code booking_no_overlap} adjudicates the new interval, so a losing race is a
     * constraint violation rather than a lost booking. No application locking is involved.
     *
     * <p>The price does not move with the booking. {@code pricePence} is captured at creation
     * precisely so a later change cannot reprice an existing booking, and silently charging a
     * customer a peak rate because staff moved their table would be worse than the anomaly of
     * an off-peak price in a peak slot. Changing what is owed is a conversation, and staff have
     * the counter-payment screens for it.
     *
     * <p>Validated under {@link BookingPolicy#staff()}: an amendment is made by someone at the
     * club, and holding it to the customer's notice period would refuse to move a booking to
     * this evening. The rules that describe the physical world — the table exists, is active,
     * is not under maintenance, is inside opening hours — are not skippable and still apply.
     *
     * @throws SlotTakenException (409) if the new slot was taken while this was decided
     */
    @Transactional
    public Booking amend(
            Booking booking,
            long newTableId,
            Instant newStartAt,
            int newDurationMinutes,
            long actingUserId) {

        if (booking.getStatus().isTerminal()) {
            throw new BusinessRuleException(
                    ErrorCode.BOOKING_NOT_AMENDABLE,
                    "This booking is no longer live and cannot be moved.");
        }

        CreateBookingCommand command = new CreateBookingCommand(
                newTableId,
                newStartAt,
                newDurationMinutes,
                booking.getUserId(),
                booking.getCustomerName(),
                booking.getCustomerEmail(),
                booking.getCustomerPhone(),
                booking.getNotes(),
                booking.getSource(),
                actingUserId);
        Instant newEndAt = command.endAt();

        // Its own id is excluded, or the booking would be found clashing with itself.
        SnookerTable table = validator.validate(command, BookingPolicy.staff(), booking.getId());
        releaseLapsedHolds(command, clubClock.now());

        booking.setSnookerTable(table);
        booking.setStartAt(newStartAt);
        booking.setEndAt(newEndAt);
        booking.setDurationMinutes(newDurationMinutes);
        booking.setAmendedAt(clubClock.now());
        booking.setAmendedByUserId(actingUserId);

        try {
            // saveAndFlush for the same reason as on create: a deferred UPDATE would violate
            // the constraint after this method returns, where nothing can translate it.
            return bookingRepository.saveAndFlush(booking);
        } catch (PessimisticLockingFailureException ex) {
            log.debug(
                    "Deadlock while moving booking {} to table {} at {}; treating as lost race",
                    booking.getReference(),
                    newTableId,
                    newStartAt);
            throw new SlotTakenException(
                    "That slot has just been booked by someone else. Please choose another.");
        } catch (DataIntegrityViolationException ex) {
            if (OVERLAP_CONSTRAINT.equals(constraintNameOf(ex))) {
                log.debug(
                        "Overlap constraint rejected moving booking {} to table {} at {}",
                        booking.getReference(),
                        newTableId,
                        newStartAt);
                throw new SlotTakenException(
                        "That slot has just been booked by someone else. Please choose another.");
            }
            throw ex;
        }
    }

    /**
     * Expires holds whose TTL has passed and that clash with this request.
     *
     * <p>Deliberately narrow: only the holds actually in the way. The scheduled sweeper handles
     * the rest, and widening this would make an ordinary booking do unbounded work.
     */
    private void releaseLapsedHolds(CreateBookingCommand command, Instant now) {
        List<Booking> clashes = bookingRepository.findOverlappingForTable(
                command.tableId(), command.startAt(), command.endAt(), BookingStatus.slotOccupying());
        for (Booking clash : clashes) {
            if (clash.isLapsedHold(now)) {
                // Guarded update: 0 rows means a webhook confirmed it a moment ago, in which
                // case the slot is genuinely taken and the constraint will say so.
                int updated = bookingRepository.expireHold(clash.getId(), now);
                log.debug("Released lapsed hold {} ({} row(s))", clash.getReference(), updated);
            }
        }
        // Flush the expiries so the constraint sees them before the insert below.
        bookingRepository.flush();
    }

    /** Reference uniqueness is enforced by a UNIQUE index; its generated name varies. */
    private boolean isReferenceCollision(String constraint) {
        return constraint != null && constraint.toLowerCase().contains("reference");
    }

    /**
     * The constraint name behind a data-integrity failure.
     *
     * <p>Matching on the name, rather than on message text, is what stops an unrelated
     * violation being mistranslated into a misleading "that slot has gone".
     *
     * <p>Two sources are needed, and the order matters. Hibernate's
     * {@link ConstraintViolationException} reports {@code null} for an <em>exclusion</em>
     * violation — it reads the driver's {@code constraint} field, which PostgreSQL populates
     * for unique and foreign-key violations but not for {@code EXCLUDE}. The name is only in
     * the server message there, so fall back to the {@link PSQLException}'s
     * {@code ServerErrorMessage}, and confirm the SQLState is 23P01 (exclusion_violation)
     * before trusting a name parsed out of prose.
     */
    private String constraintNameOf(DataIntegrityViolationException ex) {
        String hibernateName = null;
        Throwable cause = ex.getCause();
        while (cause != null) {
            if (cause instanceof ConstraintViolationException violation
                    && violation.getConstraintName() != null) {
                hibernateName = violation.getConstraintName();
                break;
            }
            cause = cause.getCause();
        }
        if (hibernateName != null) {
            return hibernateName;
        }

        cause = ex.getCause();
        while (cause != null) {
            if (cause instanceof PSQLException psql && psql.getServerErrorMessage() != null) {
                String constraint = psql.getServerErrorMessage().getConstraint();
                if (constraint != null) {
                    return constraint;
                }
                if (EXCLUSION_VIOLATION_SQL_STATE.equals(psql.getSQLState())
                        && psql.getServerErrorMessage().getMessage() != null
                        && psql.getServerErrorMessage().getMessage().contains(OVERLAP_CONSTRAINT)) {
                    return OVERLAP_CONSTRAINT;
                }
            }
            cause = cause.getCause();
        }
        return null;
    }

    @Transactional(readOnly = true)
    public Booking requireById(long id) {
        return bookingRepository
                .findById(id)
                .orElseThrow(() -> new NotFoundException(ErrorCode.NOT_FOUND, "Booking not found."));
    }

    /**
     * A booking by reference, with its table loaded.
     *
     * <p>The eager fetch matters: callers map this to a DTO after the transaction has closed,
     * and {@code snookerTable} is LAZY with {@code open-in-view} disabled, so a plain findBy
     * would hand back a proxy that throws when the controller reads the table name.
     */
    @Transactional(readOnly = true)
    public Booking requireByReference(String reference) {
        return bookingRepository
                .findByReferenceWithTable(reference)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "No booking found with that reference."));
    }

    /**
     * Confirms a booking after successful payment. Idempotent by design.
     *
     * <p>Reached from two independent directions — the Stripe webhook and the customer's browser
     * returning from Checkout — with no ordering guarantee between them. A guarded update makes
     * whichever arrives second a harmless no-op, rather than requiring the two paths to
     * coordinate.
     *
     * <p>{@code REQUIRES_NEW} so a webhook that later fails for an unrelated reason cannot roll
     * back a confirmation the customer has already been shown.
     *
     * @return true if this call performed the confirmation
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean confirmPaid(long bookingId) {
        int updated = bookingRepository.confirmIfPending(bookingId);
        if (updated == 0) {
            log.debug("Booking {} was already resolved; confirmation is a no-op", bookingId);
        }
        return updated == 1;
    }

    /**
     * Reinstates a booking whose hold lapsed before a late payment arrived.
     *
     * <p>Structurally reachable: Stripe's minimum session expiry (30 minutes) outlives the
     * default hold (15), so a customer can pay after the sweeper has released their slot. Let
     * the constraint decide whether the slot is still free — if someone else has taken it, the
     * caller records a payment exception for staff instead of silently overwriting.
     *
     * @return true if the slot was still free and the booking is now confirmed
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, noRollbackFor = DataIntegrityViolationException.class)
    public boolean tryReinstate(long bookingId) {
        Booking booking = requireById(bookingId);
        if (booking.getStatus() != BookingStatus.EXPIRED) {
            return false;
        }

        // Checked before attempting, rather than attempting and catching. Catching is not
        // enough here: the UPDATE is a bulk statement, so a constraint violation dooms this
        // transaction whether or not the exception is handled, and the caller — whose entire
        // purpose is to commit a payment_exception describing the failure — would then fail at
        // commit with UnexpectedRollbackException.
        //
        // This is a check-then-act, and therefore racy. That is acceptable precisely here and
        // nowhere else in this class: losing the race means declining to reinstate a booking
        // and raising it for staff instead, which is the same outcome as losing it later. It
        // never causes a double booking, because the constraint is still the final arbiter.
        boolean slotFree = bookingRepository
                .findOverlappingForTable(
                        booking.getSnookerTable().getId(),
                        booking.getStartAt(),
                        booking.getEndAt(),
                        BookingStatus.slotOccupying())
                .stream()
                .allMatch(other -> other.getId().equals(bookingId));

        if (!slotFree) {
            log.warn("Cannot reinstate booking {}: slot has been taken", bookingId);
            return false;
        }

        return bookingRepository.reinstateIfReleased(bookingId) == 1;
    }

    /** Marks a hold as expired. Used by the sweeper. */
    @Transactional
    public int expireHold(long bookingId, Instant now) {
        return bookingRepository.expireHold(bookingId, now);
    }

    /**
     * Rejects an attempt to act on a booking belonging to somebody else.
     *
     * <p>404 rather than 403: a 403 confirms the booking exists, which is itself a leak — an
     * attacker could map the club's whole booking table by watching which references answer
     * differently. Admins bypass the check entirely.
     */
    public void requireOwnership(Booking booking, long userId, boolean isStaff) {
        if (isStaff) {
            return;
        }
        if (booking.getUserId() == null || booking.getUserId() != userId) {
            throw new NotFoundException(
                    ErrorCode.NOT_FOUND, "No booking found with that reference.");
        }
    }

    /** Guard against a caller passing a duration that is not permitted. */
    public void validateDuration(int durationMinutes) {
        validator.validateDuration(
                durationMinutes, BookingSettings.require(bookingSettingsRepository.findSingleton()));
    }

    /** Quote for a prospective booking, without creating anything. */
    @Transactional(readOnly = true)
    public int quotePence(long tableId, Instant startAt, int durationMinutes) {
        validateDuration(durationMinutes);
        SnookerTable table = validator.requireTable(tableId);
        return pricingService.quotePence(
                table, startAt, startAt.plus(java.time.Duration.ofMinutes(durationMinutes)));
    }

    /** Bookings for a customer, newest first. */
    @Transactional(readOnly = true)
    public List<Booking> forUser(long userId) {
        return bookingRepository.findByUserIdOrderByStartAtDesc(userId);
    }

    /**
     * Cancels a booking, releasing its slot for resale.
     *
     * <p>The slot is freed by the status change alone: {@code booking_no_overlap} only applies
     * to slot-occupying statuses, so a CANCELLED row stops blocking the moment it commits. The
     * row is kept rather than deleted — a deleted booking cannot be explained to a customer who
     * rings up about it, and cannot be distinguished from one that never existed.
     *
     * <p>Rules are checked by {@link CancellationPolicy} before the update, and the update is
     * <em>also</em> guarded on the status. Both are needed: the policy produces the useful
     * message, and the guard settles the race with a webhook or the sweeper arriving in between.
     *
     * @return true if this call performed the cancellation; false if it had already happened
     */
    @Transactional
    public boolean cancel(Booking booking, long actingUserId, boolean isStaff, String reason) {
        cancellationPolicy.requireCancellable(booking, isStaff);

        int updated = bookingRepository.cancelIfLive(
                booking.getId(), clubClock.now(), actingUserId, reason);

        if (updated == 0) {
            // Lost a race: something moved the booking out of a live status between the policy
            // check and the update. Re-reading tells the caller what actually happened rather
            // than reporting a success that did not occur.
            log.debug("Cancellation of booking {} was a no-op", booking.getReference());
            return false;
        }
        log.info("Booking {} cancelled by user {}", booking.getReference(), actingUserId);
        return true;
    }

    /** Whether and until when this booking may be cancelled, for display. */
    public CancellationPolicy.Decision cancellation(Booking booking, boolean isStaff) {
        return cancellationPolicy.evaluate(booking, isStaff);
    }
}
