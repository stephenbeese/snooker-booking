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
                        .requestMatchers(HttpMethod.GET,
                                "/api/availability",
                                "/api/tables",
                                "/api/club",
                                "/api/booking-settings")
                        .permitAll()
                        // Admin rules come before anyRequest(), which matches everything
                        // and would otherwise shadow them.
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // Default deny: a new endpoint is unreachable until it is
                        // deliberately opened, rather than public until someone notices.
                        .anyRequest().authenticated())
                // The SPA must receive 401 JSON, never a 302 to a login page.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(Customizer.withDefaults());

        return http.build();
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
