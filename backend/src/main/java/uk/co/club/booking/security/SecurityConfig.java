package uk.co.club.booking.security;

import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import uk.co.club.booking.common.web.RateLimitFilter;

/**
 * Session-cookie authentication for the SPA.
 *
 * <p>Sessions rather than JWTs: there is no cross-domain client, no mobile app and no
 * third-party API consumer, so every argument for a bearer token is absent while its
 * costs (unrevocable tokens, refresh rotation, XSS-exfiltratable credentials) all apply.
 * Sessions live in the Postgres already being run, via Spring Session JDBC.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(
            HttpSecurity http,
            // Qualified by name: Spring MVC's HandlerMappingIntrospector also implements
            // CorsConfigurationSource, so the type alone is ambiguous.
            @Qualifier("corsConfigurationSource") CorsConfigurationSource corsSource,
            // Optional so the integration suite can switch the limiter off. Tests hammer
            // login far harder than any real user and would otherwise throttle themselves,
            // producing failures that look like auth bugs.
            org.springframework.beans.factory.ObjectProvider<RateLimitFilter> rateLimitFilter,
            // Read from the same property that enables springdoc, so the allowlist and the
            // endpoints cannot disagree. Hardcoding the paths as permitAll would leave them
            // open in production, where the documents are disabled — an allowlist entry for
            // something that does not exist is a decision made in advance for whoever
            // eventually enables it.
            @Value("${springdoc.api-docs.enabled:false}") boolean apiDocsEnabled,
            // Reuses the session cookie's own setting rather than a second flag, so the two
            // can never disagree — and defaults to true, so a profile that forgets to say
            // anything gets the safe behaviour rather than the convenient one.
            @Value("${spring.servlet.session.cookie.secure:true}") boolean secureCookies)
            throws Exception {

        CookieCsrfTokenRepository csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        // The session cookie gets Secure and SameSite from application.yml, but this one is
        // built here and inherits none of it. Left alone it is the only cookie the app sets
        // without Secure, so a single plain-HTTP request to the domain — a typed URL, an old
        // bookmark, a stray link — leaks a valid CSRF token in clear text.
        //
        // SameSite=Lax matches the session cookie deliberately: Strict would withhold both on
        // the top-level redirect back from Stripe Checkout, and a CSRF token that is missing
        // exactly when the customer returns from paying breaks the confirmation step.
        csrfRepository.setCookieCustomizer(cookie -> cookie
                .secure(secureCookies)
                .sameSite("Lax"));
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        // Spring Security defers CSRF token loading by default, so an SPA that never
        // renders a token would never receive the cookie. Opting out writes it eagerly.
        csrfHandler.setCsrfRequestAttributeName(null);

        if (apiDocsEnabled) {
            http.authorizeHttpRequests(auth -> auth
                    .requestMatchers(
                            "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                    .permitAll());
        }

        http.cors(cors -> cors.configurationSource(corsSource))
                .csrf(csrf -> csrf.csrfTokenRepository(csrfRepository)
                        .csrfTokenRequestHandler(csrfHandler)
                        // Stripe cannot send our CSRF token; HMAC signature
                        // verification is the stronger check on that endpoint.
                        .ignoringRequestMatchers("/api/webhooks/stripe"))
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                        .sessionFixation(fixation -> fixation.changeSessionId()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/webhooks/stripe").permitAll()
                        .requestMatchers("/api/health", "/actuator/health").permitAll()
                        .requestMatchers("/api/auth/register", "/api/auth/login").permitAll()
                        // Necessarily public: someone who has lost their password has no
                        // session to authenticate with. Both are throttled by
                        // RateLimitFilter and neither reveals whether an account exists.
                        .requestMatchers(
                                "/api/auth/forgot-password", "/api/auth/reset-password")
                        .permitAll()
                        // 204 when anonymous, so it must be reachable without a session.
                        .requestMatchers(HttpMethod.GET, "/api/auth/me").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/logout").permitAll()
                        // Browsing availability must not require login — it is the
                        // conversion path.
                        // Every path here must have a controller behind it. An allowlisted path
                        // that does not exist is a decision made in advance for whoever
                        // eventually creates it — they get a public endpoint without choosing
                        // one. /api/booking-settings was listed here and never built; the
                        // duration options it would have served already travel with the
                        // availability response.
                        .requestMatchers(HttpMethod.GET,
                                "/api/availability",
                                "/api/tables",
                                // The type labels the grid renders. GET only, and listed
                                // explicitly because "/api/tables" alone does not cover it —
                                // an unlisted path would fall through to anyRequest() and the
                                // booking page would lose its labels for anyone logged out.
                                "/api/tables/types",
                                // The cafe menu as customers read it. GET only, and a different
                                // path from the ADMIN-only /api/admin/cafe/** above: this one
                                // serves active items alone, so a withdrawn item cannot reach
                                // a customer even though both read the same table.
                                "/api/cafe/items",
                                "/api/club")
                        .permitAll()
                        // Admin rules come before anyRequest(), which matches everything
                        // and would otherwise shadow them.
                        //
                        // Narrowest first. Spring takes the FIRST matcher that matches, so
                        // listing "/api/admin/**" above these would swallow them and hand
                        // STAFF the club's configuration. Order here is the authorisation.
                        //
                        // What ADMIN keeps to itself is everything that changes the club
                        // rather than serving a customer: opening hours, pricing, the tables,
                        // and who else has access. Handing out roles is the one that matters
                        // most — a STAFF member who could edit users could make themselves
                        // ADMIN, and the split would mean nothing.
                        //
                        // Both forms of each path. The wildcard alone is in fact sufficient
                        // here — Spring's PathPatternParser matches "/api/admin/tables/**"
                        // against the bare "/api/admin/tables" too, which was verified rather
                        // than assumed — but that is a property of the matcher implementation,
                        // not of this rule. Spelling out the base path costs one line and
                        // keeps the boundary correct if the matcher is ever swapped for one
                        // that reads "/**" as "at least one more segment", which is how
                        // AntPathMatcher behaved.
                        // Moving a booking is ADMIN's alone. Listed by method as well as path:
                        // the same path answers GET for the booking detail screen, which STAFF
                        // must keep — a path-only rule here would take the whole booking record
                        // away from the people who work the counter.
                        .requestMatchers(HttpMethod.PUT, "/api/admin/bookings/*")
                        .hasRole("ADMIN")
                        .requestMatchers(
                                "/api/admin/settings",
                                "/api/admin/settings/**",
                                "/api/admin/tables",
                                "/api/admin/tables/**",
                                // Table types are club configuration, not the day job: adding
                                // one changes what every table and pricing rule may be, so it
                                // sits with tables rather than with bookings. Listed
                                // separately because "/api/admin/tables/**" does NOT match
                                // "/api/admin/table-types" — the hyphen makes it a different
                                // path segment, and relying on the resemblance would silently
                                // hand this to STAFF.
                                "/api/admin/table-types",
                                "/api/admin/table-types/**",
                                // The cafe menu sets prices, which is club configuration in the
                                // same sense as pricing rules: whoever is on the counter reads
                                // the menu, they do not decide what a pint costs.
                                "/api/admin/cafe",
                                "/api/admin/cafe/**",
                                "/api/admin/users",
                                "/api/admin/users/**")
                        .hasRole("ADMIN")
                        // Everything else under /api/admin is the day job: bookings, the
                        // telephone grid, maintenance blocks, the dashboard.
                        .requestMatchers("/api/admin/**").hasAnyRole("STAFF", "ADMIN")
                        // Default deny: a new endpoint is unreachable until it is
                        // deliberately opened, rather than public until someone notices.
                        .anyRequest().authenticated())
                // The SPA must receive a status code, never a 302 to a login page.
                //
                // Both handlers are needed, and the difference between them is not cosmetic.
                // Without an explicit accessDeniedHandler, an authenticated user who lacks the
                // role is sent to the *entry point* — answering 401 instead of 403. The SPA
                // reads 401 as "your session has expired" and bounces the user to the login
                // page, where signing in again changes nothing, because their session was never
                // the problem. A customer who follows an admin link would loop there forever.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
                        // setStatus, not sendError: sendError triggers a container ERROR
                        // dispatch that re-enters the filter chain, where the request is
                        // anonymous again and comes back out as a 401 — the exact bug this
                        // handler exists to fix.
                        //
                        // The body matters as much as the status. This handler serves two very
                        // different denials: a role the caller does not have, and a CSRF token
                        // that no longer matches. Only the first is a decision about the user,
                        // so only the first carries an error envelope — the client retries a
                        // bare 403 with a fresh token and gives up on one that explains itself.
                        .accessDeniedHandler(SecurityConfig::writeAccessDenied))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(Customizer.withDefaults());

        // Before the CSRF filter, so a flood of unauthenticated login attempts is rejected
        // on a map lookup rather than after Spring has done session and token work for each
        // one. Placing it later would still limit the endpoint but would let an attacker
        // impose most of the cost anyway.
        rateLimitFilter.ifAvailable(filter -> http.addFilterBefore(filter, CsrfFilter.class));

        return http.build();
    }

    /**
     * Answers an authorisation failure.
     *
     * <p>A {@link org.springframework.security.web.csrf.CsrfException} is deliberately left
     * bare: the client cannot tell a stale token from a real refusal by status code alone, and
     * the absence of an envelope is the signal that retrying with a fresh token is worth doing.
     * A role refusal gets the envelope, so the client stops rather than looping.
     */
    private static void writeAccessDenied(
            jakarta.servlet.http.HttpServletRequest request,
            jakarta.servlet.http.HttpServletResponse response,
            org.springframework.security.access.AccessDeniedException denied)
            throws java.io.IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        if (denied instanceof org.springframework.security.web.csrf.CsrfException) {
            return;
        }
        response.setContentType("application/json");
        // Hand-written rather than serialised: no message from the exception reaches the
        // client, so nothing about the failed check can leak into the response.
        response.getWriter().write(
                "{\"code\":\"ACCESS_DENIED\","
                        + "\"message\":\"You do not have permission to do that.\"}");
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        // Strength 12 rather than the default 10: ~250ms per hash on current hardware,
        // slow enough to make offline cracking expensive and fast enough for a login.
        return new BCryptPasswordEncoder(12);
    }

    /**
     * Exposed so {@link uk.co.club.booking.domain.user.web.AuthController} can
     * authenticate a JSON login request.
     *
     * <p>{@code hideUserNotFoundExceptions} stays at its default (true), so a missing
     * account and a wrong password both surface as {@code BadCredentialsException} and
     * cannot be told apart by timing the branch.
     */
    @Bean
    AuthenticationManager authenticationManager(
            AppUserDetailsService userDetailsService, PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(provider);
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins}") List<String> allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();
        // Cannot be "*" while allowCredentials is true — the browser rejects it.
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "X-Requested-With"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
