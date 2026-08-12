package uk.co.club.booking.common.config;

import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Injecting a {@link Clock} rather than calling {@code Instant.now()} lets notice-period
 * and cancellation-deadline rules be unit-tested against a fixed point in time.
 */
@Configuration
public class ClockConfig {

    @Bean
    @ConditionalOnMissingBean
    Clock clock() {
        return Clock.systemUTC();
    }
}
