package uk.co.club.booking.domain.user.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.domain.user.User;
import uk.co.club.booking.domain.user.UserService;
import uk.co.club.booking.domain.user.web.dto.LoginRequest;
import uk.co.club.booking.domain.user.web.dto.RegisterRequest;
import uk.co.club.booking.domain.user.web.dto.UserResponse;
import uk.co.club.booking.security.AppUserPrincipal;

/**
 * Registration, login, logout and "who am I".
 *
 * <p>Login is handled here rather than by {@code formLogin} because the SPA needs a JSON
 * request and a JSON response; the form-login filter expects form encoding and answers
 * with redirects.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository =
            new HttpSessionSecurityContextRepository();

    public AuthController(UserService userService, AuthenticationManager authenticationManager) {
        this.userService = userService;
        this.authenticationManager = authenticationManager;
    }

    /** Creates a customer account. Does not log them in — the SPA posts to /login next. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest request) {
        return UserResponse.from(userService.register(request));
    }

    /**
     * Authenticates and establishes a session.
     *
     * <p>Three steps that are easy to get wrong and silently produce a "logged in" client
     * whose next request is a 401:
     *
     * <ol>
     *   <li>Invalidate any existing session first, so a pre-login session id cannot be
     *       fixated by an attacker who planted it.
     *   <li>Store the {@link SecurityContext} in the repository explicitly. Setting only
     *       the {@code SecurityContextHolder} lasts for this request and is then
     *       discarded — the classic "login worked but nothing is authenticated" bug.
     *   <li>Return the user, so the SPA needs no follow-up request.
     * </ol>
     */
    @PostMapping("/login")
    public UserResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(
                            request.email().trim(), request.password()));
        } catch (DisabledException ex) {
            throw new BusinessRuleException(
                    ErrorCode.ACCOUNT_DISABLED,
                    "This account has been deactivated. Please contact the club.");
        } catch (AuthenticationException ex) {
            // One error for both "no such account" and "wrong password": distinguishing
            // them turns the endpoint into an account-enumeration oracle.
            throw new BusinessRuleException(
                    ErrorCode.INVALID_CREDENTIALS, "Email address or password is incorrect.");
        }

        // Session fixation protection: a fresh session id post-authentication.
        if (httpRequest.getSession(false) != null) {
            httpRequest.getSession(false).invalidate();
        }
        httpRequest.getSession(true);

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, httpRequest, httpResponse);

        AppUserPrincipal principal = (AppUserPrincipal) authentication.getPrincipal();
        return UserResponse.from(userService.require(principal.id()));
    }

    /** Ends the session. Idempotent: logging out when not logged in is a no-op 204. */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
        new SecurityContextLogoutHandler().logout(request, response, authentication);
    }

    /**
     * The current user, or 204 when anonymous.
     *
     * <p>204 rather than 401: the SPA calls this on boot to decide what to render, and a
     * 401 would be indistinguishable from a genuine session expiry mid-use.
     */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(@AuthenticationPrincipal AppUserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.noContent().build();
        }
        User user = userService.require(principal.id());
        return ResponseEntity.ok(UserResponse.from(user));
    }
}
