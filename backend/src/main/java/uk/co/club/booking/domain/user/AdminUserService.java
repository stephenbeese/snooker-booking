package uk.co.club.booking.domain.user;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;

/**
 * Managing who has access to the club, for an admin.
 *
 * <p>Separate from {@link UserService}, which serves the account holder themselves —
 * registering, editing their own profile, changing their own password. Everything here is
 * one person acting on another's account, and the rules are different in kind: they are
 * about not letting the club lock itself out and not letting privilege be handed out by
 * accident.
 *
 * <p>Authorisation is not enforced here. {@code /api/admin/users/**} is ADMIN-only in
 * {@code SecurityConfig}, checked before this class is reached, following the same
 * convention the other admin services use — a per-method check as well would be a second
 * place to forget.
 */
@Service
public class AdminUserService {

    /**
     * A page size, not a promise. One club's staff and customers fit comfortably; this
     * exists so a directory that grows unexpectedly cannot serve an unbounded response.
     */
    private static final int MAX_PAGE_SIZE = 100;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminUserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * The people with access, optionally filtered by role or searched by name or email.
     *
     * <p>Staff first, then customers, then by name — an admin opening this screen is far
     * more often looking for a colleague than for one of thousands of customers.
     */
    @Transactional(readOnly = true)
    public Page<User> search(Role role, String search, int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        PageRequest pageRequest = PageRequest.of(
                Math.max(page, 0),
                safeSize,
                Sort.by(Sort.Order.asc("role"), Sort.Order.asc("firstName"), Sort.Order.asc("lastName")));
        return userRepository.search(role, searchPattern(search), pageRequest);
    }

    /**
     * Escapes the LIKE wildcards before the term reaches the query.
     *
     * <p>Without this a search for "%" matches every account, and "_" matches any single
     * character — the user would see a directory that ignores what they typed. Mirrors
     * {@code AdminBookingQuery.searchPattern()}; the backslash must be escaped first, or it
     * would then escape the escapes added after it.
     */
    private String searchPattern(String search) {
        if (search == null || search.isBlank()) {
            return null;
        }
        String escaped = search.trim().toLowerCase()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    /**
     * Creates an account with a role, for someone who works here.
     *
     * <p>The admin sets an initial password and passes it on directly. Deliberately not an
     * emailed invitation link: the club's outbound mail is a development stub, and an invite
     * flow would mean a new member of staff cannot get in until mail delivery is configured.
     * A password read out at the counter is honest about what this is — a single-club back
     * office — and the account holder can change it from their own profile.
     */
    @Transactional
    public User create(String email, String password, String firstName, String lastName,
            String phone, Role role) {
        String trimmed = email.trim();

        // Racy by nature, as in UserService.register: two simultaneous creations both pass.
        // The unique index on app_user.email is the real guarantee; this exists to produce a
        // useful message rather than a constraint violation in the common case.
        if (userRepository.existsByEmail(trimmed)) {
            throw new BusinessRuleException(
                    ErrorCode.EMAIL_ALREADY_REGISTERED,
                    "An account already exists for that email address.");
        }

        User user = new User(
                trimmed,
                passwordEncoder.encode(password),
                firstName.trim(),
                lastName.trim(),
                role);
        if (phone != null && !phone.isBlank()) {
            user.setPhone(phone.trim());
        }
        return userRepository.save(user);
    }

    /**
     * Changes someone's role.
     *
     * <p>Both directions matter, and demotion is the more important one: it is how access is
     * revoked when someone leaves. Deactivating the account instead would also take away
     * their own booking history, which is a customer record, not a staff permission.
     *
     * @param actingAdminId the admin making the change, so they cannot demote themselves
     */
    @Transactional
    public User changeRole(long userId, Role newRole, long actingAdminId) {
        User user = require(userId);

        // Demoting yourself is how an admin locks themselves out of the screen they are
        // standing on, in one click, with no way back except the database. Refused outright
        // rather than confirmed: there is no reason to do it that is not better served by
        // another admin doing it for you.
        if (user.getId() == actingAdminId && !newRole.isAdmin()) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "You cannot remove your own admin access. Ask another admin to do it.");
        }

        // The club must keep at least one admin. Without this, demoting the last one leaves
        // nobody who can edit pricing, opening hours or accounts — recoverable only by
        // someone with database access, which is precisely the situation this screen exists
        // to avoid.
        if (user.getRole().isAdmin() && !newRole.isAdmin() && countOtherAdmins(user.getId()) == 0) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "This is the club's only admin. Give someone else admin access first.");
        }

        user.setRole(newRole);
        return user;
    }

    /**
     * Deactivates or reactivates an account.
     *
     * <p>Not deletion. A deleted account would orphan its bookings, and the club's own
     * history of who played when is worth more than the tidiness. An inactive account cannot
     * sign in — {@code AppUserPrincipal.isEnabled()} returns false, so Spring Security
     * refuses the login rather than the application having to remember to check.
     */
    @Transactional
    public User setActive(long userId, boolean active, long actingAdminId) {
        User user = require(userId);

        if (user.getId() == actingAdminId && !active) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "You cannot deactivate your own account.");
        }

        if (user.getRole().isAdmin() && !active && countOtherAdmins(user.getId()) == 0) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "This is the club's only admin. Give someone else admin access first.");
        }

        user.setActive(active);
        return user;
    }

    /**
     * Sets a new password for someone else — for the member of staff who has forgotten
     * theirs and needs to be back on the counter now.
     *
     * <p>Does not require the current password, because the admin does not know it. That is
     * exactly why this is ADMIN-only and why it is a different method from
     * {@code UserService.changePassword}, which does demand it: conflating the two would
     * remove that check from the account holder's own path.
     */
    @Transactional
    public void resetPassword(long userId, String newPassword) {
        require(userId).setPasswordHash(passwordEncoder.encode(newPassword));
    }

    @Transactional(readOnly = true)
    public User require(long id) {
        return userRepository
                .findById(id)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That account does not exist."));
    }

    /** How many other active admins exist. The guard against locking the club out. */
    private long countOtherAdmins(long excludingUserId) {
        return userRepository.countByRoleAndActiveTrueAndIdNot(Role.ADMIN, excludingUserId);
    }

    /** Every staff member, for screens that need to attribute work to a person. */
    @Transactional(readOnly = true)
    public List<User> staff() {
        return userRepository.findByRoleInOrderByFirstNameAscLastNameAsc(
                List.of(Role.STAFF, Role.ADMIN));
    }
}
