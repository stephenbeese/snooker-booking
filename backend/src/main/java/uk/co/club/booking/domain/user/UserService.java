package uk.co.club.booking.domain.user;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.domain.user.web.dto.RegisterRequest;

/** Account creation and lookup. */
@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Registers a customer.
     *
     * <p>Always CUSTOMER: the request DTO has no role field, so privilege escalation via
     * a crafted body is not merely rejected but unrepresentable. Admins are seeded or
     * promoted by an existing admin.
     */
    @Transactional
    public User register(RegisterRequest request) {
        String email = request.email().trim();

        // Racy by nature — two simultaneous registrations both pass this check. The
        // unique index on app_user.email is the real guarantee; this exists to produce a
        // helpful field error in the overwhelmingly common case.
        if (userRepository.existsByEmail(email)) {
            throw new BusinessRuleException(
                    ErrorCode.EMAIL_ALREADY_REGISTERED,
                    "An account already exists for that email address.");
        }

        User user = new User(
                email,
                passwordEncoder.encode(request.password()),
                request.firstName().trim(),
                request.lastName().trim(),
                Role.CUSTOMER);
        String phone = request.phone();
        if (phone != null && !phone.isBlank()) {
            user.setPhone(phone.trim());
        }
        return userRepository.save(user);
    }

    @Transactional(readOnly = true)
    public User require(long id) {
        return userRepository
                .findById(id)
                .orElseThrow(() -> new IllegalStateException(
                        "Authenticated user " + id + " no longer exists"));
    }

    /**
     * Finds an existing account by email or creates a shell one for a telephone booking.
     *
     * <p>Created without a usable password: {@code {noop}} is not a valid BCrypt hash, so
     * {@code matches} fails for every input rather than succeeding for some. The customer
     * gains access by using the password-reset flow, which proves they own the mailbox.
     */
    @Transactional
    public User findOrCreateForTelephone(
            String email, String firstName, String lastName, String phone) {
        return userRepository
                .findByEmail(email)
                .orElseGet(() -> {
                    User user = new User(
                            email.trim(),
                            UNUSABLE_PASSWORD_HASH,
                            firstName.trim(),
                            lastName.trim(),
                            Role.CUSTOMER);
                    if (phone != null && !phone.isBlank()) {
                        user.setPhone(phone.trim());
                    }
                    return userRepository.save(user);
                });
    }

    /**
     * A hash no password can match. Not an empty string, which some encoders treat as
     * "no password required".
     */
    static final String UNUSABLE_PASSWORD_HASH = "{unusable}";
}
