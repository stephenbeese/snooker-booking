package uk.co.club.booking.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Throttles the endpoints where guessing is the attack.
 *
 * <p>Password hashing at BCrypt strength 12 already makes login slow, but slow is not a
 * limit: a patient attacker still gets unlimited attempts, and an unthrottled
 * forgot-password endpoint is a way to have the club's mail server send arbitrary volumes
 * of mail to an address of the attacker's choosing.
 *
 * <p>A filter rather than annotations on the controllers, for two reasons. It runs before
 * the request reaches Spring Security's authentication machinery, so a flood costs a map
 * lookup instead of a BCrypt comparison. And it cannot be forgotten when a new auth
 * endpoint is added, provided the path is listed here.
 */
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    /**
     * Pulls the email out of the request body.
     *
     * <p>A regex rather than a JSON parse. The filter needs exactly one string from a body it
     * is about to hand to Jackson anyway, and deserialising twice to get it would cost more
     * than the check saves. The consequence is honest and bounded: an unusual-but-valid
     * encoding (an escaped character in the local part, say) simply does not match, and that
     * request falls back to the per-IP limit. It can never match the *wrong* address.
     */
    private static final Pattern EMAIL_FIELD =
            Pattern.compile("\"email\"\\s*:\\s*\"([^\"]{1,320})\"");

    /** Bodies larger than this are not scanned. An auth request is a few hundred bytes. */
    private static final int MAX_BODY_BYTES = 8 * 1024;

    /**
     * What each path allows, per window.
     *
     * <p>Login is the most generous because a real person genuinely does mistype a password
     * several times. Password reset is the tightest: nobody legitimately requests five reset
     * emails a minute, and every request sends mail.
     */
    private record Rule(String path, RateLimiter byIp, RateLimiter byIdentity) {}

    private final List<Rule> rules;
    private final Clock clock;

    public RateLimitFilter(Clock clock) {
        this(clock, 1);
    }

    /**
     * @param multiplier scales every limit. Only ever anything but 1 in the dev profile, where
     *     the end-to-end suite signs in dozens of times a minute — far beyond any real user —
     *     and would otherwise throttle itself into failures that look like auth bugs. Scaling
     *     rather than disabling keeps the filter in the chain, so the specs still run through
     *     the code that production uses.
     */
    public RateLimitFilter(Clock clock, int multiplier) {
        this.clock = clock;
        Duration minute = Duration.ofMinutes(1);
        Duration hour = Duration.ofHours(1);
        this.rules = List.of(
                // 10/min from one address covers a forgetful user; the per-email limit is
                // what actually stops a distributed attack on one account.
                new Rule("/api/auth/login",
                        new RateLimiter(10 * multiplier, minute),
                        new RateLimiter(20 * multiplier, hour)),
                // Registration is throttled to stop bulk account creation, which would
                // otherwise let someone fill the users table or mine the email-taken response.
                new Rule("/api/auth/register",
                        new RateLimiter(5 * multiplier, hour),
                        new RateLimiter(3 * multiplier, hour)),
                // Every one of these sends an email.
                new Rule("/api/auth/forgot-password",
                        new RateLimiter(5 * multiplier, hour),
                        new RateLimiter(3 * multiplier, hour)),
                // Guessing a 32-byte token is hopeless, but the limit costs nothing and
                // closes the door on a token-validation oracle.
                new Rule("/api/auth/reset-password",
                        new RateLimiter(10 * multiplier, hour),
                        new RateLimiter(10 * multiplier, hour)));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        Rule rule = ruleFor(request);
        if (rule == null) {
            chain.doFilter(request, response);
            return;
        }

        String ip = clientIp(request);
        Optional<Duration> ipLimited = rule.byIp().check(ip, clock.instant());
        if (ipLimited.isPresent()) {
            reject(response, ipLimited.get(), rule.path(), "address");
            return;
        }

        // The body must be read to find the email, and a servlet body can only be read once.
        // Wrapping buffers it so the controller can read it again downstream; without this
        // the request arrives at Spring empty and every login fails as a validation error.
        CachedBodyRequest wrapped = new CachedBodyRequest(request);
        String identity = identityFrom(wrapped);

        if (identity != null) {
            Optional<Duration> identityLimited = rule.byIdentity().check(identity, clock.instant());
            if (identityLimited.isPresent()) {
                reject(response, identityLimited.get(), rule.path(), "account");
                return;
            }
        }

        chain.doFilter(wrapped, response);
    }

    /**
     * Forgets the failed-attempt history for an address that has just authenticated.
     *
     * <p>Without this, someone who mistypes their password nine times, succeeds on the tenth
     * and then logs out is locked out of their own account for the rest of the window. The
     * per-IP counter is deliberately left alone: on shared networks it protects other people,
     * and one successful login should not clear it for everyone behind that address.
     */
    public void onSuccessfulLogin(String email) {
        if (email == null) {
            return;
        }
        rules.stream()
                .filter(rule -> rule.path().equals("/api/auth/login"))
                .findFirst()
                .ifPresent(rule ->
                        rule.byIdentity().clear(email.trim().toLowerCase(Locale.ROOT)));
    }

    /**
     * Clears every counter.
     *
     * <p>Exists for the integration test, which drives many attempts from one address and
     * would otherwise carry quota between test methods. Not exposed over HTTP anywhere: an
     * endpoint that resets the rate limiter is a way to bypass the rate limiter.
     */
    public void resetForTesting() {
        rules.forEach(rule -> {
            rule.byIp().clearAll();
            rule.byIdentity().clearAll();
        });
    }

    private Rule ruleFor(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return null;
        }
        String path = request.getRequestURI();
        return rules.stream().filter(rule -> rule.path().equals(path)).findFirst().orElse(null);
    }

    /**
     * The email in the request body, lowercased, or null when there isn't one.
     *
     * <p>Lowercased because the address column is {@code citext}: without this, alternating
     * the capitalisation of an address would produce a fresh bucket on every attempt and
     * defeat the per-account limit entirely.
     */
    private String identityFrom(CachedBodyRequest request) {
        byte[] body = request.body();
        // Guards against an attacker sending a huge body purely to make this filter work.
        if (body.length == 0 || body.length > MAX_BODY_BYTES) {
            return null;
        }
        Matcher matcher = EMAIL_FIELD.matcher(new String(body, StandardCharsets.UTF_8));
        if (!matcher.find()) {
            // No recognisable email: fall through on the per-IP limit alone rather than
            // failing closed. A parse quirk must not become a lockout, and a request with no
            // email is one bean validation will reject in a moment anyway.
            return null;
        }
        return matcher.group(1).trim().toLowerCase(Locale.ROOT);
    }

    /**
     * The caller's address.
     *
     * <p>{@code X-Forwarded-For} is deliberately <em>not</em> consulted. It is attacker-supplied
     * unless a trusted proxy overwrites it, and trusting it here would let anyone reset their
     * own limit by varying a header — strictly worse than no limit, because it would look like
     * protection. If this is ever deployed behind a proxy, configure
     * {@code server.forward-headers-strategy=framework} so the servlet container resolves the
     * real address before this filter sees it.
     */
    private String clientIp(HttpServletRequest request) {
        return request.getRemoteAddr();
    }

    private void reject(HttpServletResponse response, Duration retryAfter, String path, String scope)
            throws IOException {
        long seconds = Math.max(1, retryAfter.toSeconds());
        // Logged without the email: the whole point is that this endpoint is being probed,
        // and writing the attempted addresses into the log makes the log a list of accounts.
        log.warn("Rate limit hit on {} (per-{}), retry in {}s", path, scope, seconds);

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", String.valueOf(seconds));
        // Hand-written to keep the message identical whichever limit tripped. Telling the
        // caller it was the per-account limit would confirm the account exists.
        response.getWriter().write(
                "{\"code\":\"TOO_MANY_REQUESTS\",\"message\":\"Too many attempts."
                        + " Please wait " + seconds + " seconds and try again.\"}");
    }
}
