package uk.co.club.booking.domain.admin.web;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.admin.web.dto.AdminUserRequests.ChangeRoleRequest;
import uk.co.club.booking.domain.admin.web.dto.AdminUserRequests.CreateUserRequest;
import uk.co.club.booking.domain.admin.web.dto.AdminUserRequests.ResetPasswordRequest;
import uk.co.club.booking.domain.admin.web.dto.AdminUserResponse;
import uk.co.club.booking.domain.admin.web.dto.PagedResponse;
import uk.co.club.booking.domain.user.AdminUserService;
import uk.co.club.booking.domain.user.Role;
import uk.co.club.booking.security.AppUserPrincipal;

/**
 * Who has access to the club, and at what level.
 *
 * <p>ADMIN-only, enforced in {@code SecurityConfig} before this class is reached — the same
 * convention the other admin controllers follow. This one matters more than most: an endpoint
 * here that STAFF could reach would let them grant themselves ADMIN, and the whole role split
 * would be decoration. {@code /api/admin/users} and {@code /api/admin/users/**} are both
 * listed there, because the wildcard alone does not match the bare path.
 *
 * <p>Nothing here returns a password hash: every response goes through
 * {@link AdminUserResponse}, which names its fields rather than serialising the entity.
 */
@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    /**
     * The directory, filtered and paged.
     *
     * @param role optional; STAFF or ADMIN to see only the people who work here
     * @param search optional; matches email, first name, last name or full name
     */
    @GetMapping
    public PagedResponse<AdminUserResponse> list(
            @RequestParam(required = false) Role role,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return PagedResponse.of(
                adminUserService.search(role, search, page, size), AdminUserResponse::from);
    }

    /** One account. */
    @GetMapping("/{id}")
    public AdminUserResponse byId(@PathVariable long id) {
        return AdminUserResponse.from(adminUserService.require(id));
    }

    /**
     * Creates an account with a role.
     *
     * <p>The admin sets the initial password and passes it on directly — see
     * {@code AdminUserService.create} for why this is not an emailed invitation.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserResponse create(@Valid @RequestBody CreateUserRequest request) {
        return AdminUserResponse.from(adminUserService.create(
                request.email(),
                request.password(),
                request.firstName(),
                request.lastName(),
                request.phone(),
                request.role()));
    }

    /**
     * Promotes or demotes an account.
     *
     * <p>The acting admin's id is taken from the session, never from the body. Trusting the
     * client for it would make the "you cannot demote yourself" and "keep one admin" guards
     * trivially bypassable by anyone willing to edit a request.
     */
    @PutMapping("/{id}/role")
    public AdminUserResponse changeRole(
            @PathVariable long id,
            @Valid @RequestBody ChangeRoleRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return AdminUserResponse.from(
                adminUserService.changeRole(id, request.role(), principal.id()));
    }

    /** Deactivates or reactivates an account. Deactivated accounts cannot sign in. */
    @PutMapping("/{id}/active")
    public AdminUserResponse setActive(
            @PathVariable long id,
            @RequestParam boolean active,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return AdminUserResponse.from(
                adminUserService.setActive(id, active, principal.id()));
    }

    /** Sets a new password for someone who has lost theirs. Returns nothing. */
    @PutMapping("/{id}/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(
            @PathVariable long id, @Valid @RequestBody ResetPasswordRequest request) {
        adminUserService.resetPassword(id, request.password());
    }
}
