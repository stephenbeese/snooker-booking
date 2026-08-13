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
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

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
            @Qualifier("corsConfigurationSource") CorsConfigurationSource corsSource)
            throws Exception {

        CookieCsrfTokenRepository csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        // Spring Security defers CSRF token loading by default, so an SPA that never
        // renders a token would never receive the cookie. Opting out writes it eagerly.
        csrfHandler.setCsrfRequestAttributeName(null);

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
                        // session to authenticate with. Both are rate-limited in Phase 7;
                        // neither reveals whether an account exists.
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
                                "/api/club")
                        .permitAll()
                        // Admin rules come before anyRequest(), which matches everything
                        // and would otherwise shadow them.
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
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
