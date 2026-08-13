package uk.co.club.booking.domain.user.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.user.SessionInvalidator;
import uk.co.club.booking.domain.user.User;
import uk.co.club.booking.domain.user.UserService;
import uk.co.club.booking.domain.user.web.dto.ChangePasswordRequest;
import uk.co.club.booking.domain.user.web.dto.UpdateProfileRequest;
import uk.co.club.booking.domain.user.web.dto.UserResponse;
import uk.co.club.booking.security.AppUserPrincipal;

/**
 * The signed-in customer's own account.
 *
 * <p>Every method acts on {@code principal.id()} and never on an id from the request. There is
 * therefore no user id to tamper with: reading or editing somebody else's profile is not
 * something this controller can express, rather than something it checks for.
 */
@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final UserService userService;
    private final SessionInvalidator sessionInvalidator;

    public ProfileController(UserService userService, SessionInvalidator sessionInvalidator) {
        this.userService = userService;
        this.sessionInvalidator = sessionInvalidator;
    }

    @GetMapping
    public UserResponse profile(@AuthenticationPrincipal AppUserPrincipal principal) {
        return UserResponse.from(userService.require(principal.id()));
    }

    @PutMapping
    public UserResponse update(
            @Valid @RequestBody UpdateProfileRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        User user = userService.updateProfile(
                principal.id(), request.firstName(), request.lastName(), request.phone());
        return UserResponse.from(user);
    }

    /**
     * Changes the password and signs every other device out.
     *
     * <p>Invalidating the other sessions is the point of the exercise. Someone changing their
     * password usually believes it is compromised; leaving the attacker's existing session
     * alive would make the change purely cosmetic.
     *
     * <p>The caller's own session survives, so they are not bounced to the login screen for
     * doing the right thing.
     */
    @PostMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal,
            HttpServletRequest httpRequest) {

        userService.changePassword(
                principal.id(), request.currentPassword(), request.newPassword());

        String currentSessionId =
                httpRequest.getSession(false) == null ? null : httpRequest.getSession(false).getId();
        sessionInvalidator.invalidateAllExcept(principal.getUsername(), currentSessionId);
    }
}
