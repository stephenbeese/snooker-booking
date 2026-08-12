package uk.co.club.booking.security;

import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
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
 * <p>Phases 0-1 have no login yet, so only the public read endpoints are wired. The
 * authenticated and admin rules land in Phase 2 alongside the user domain.
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
                        // Browsing availability must not require login — it is the
                        // conversion path.
                        .requestMatchers(HttpMethod.GET,
                                "/api/availability",
                                "/api/tables",
                                "/api/club",
                                "/api/booking-settings")
                        .permitAll()
                        .anyRequest().permitAll())
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
        return new BCryptPasswordEncoder(12);
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
