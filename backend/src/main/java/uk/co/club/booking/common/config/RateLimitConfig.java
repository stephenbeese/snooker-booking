package uk.co.club.booking.common.config;

import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import uk.co.club.booking.common.web.RateLimitFilter;

/**
 * Wires the auth rate limiter.
 *
 * <p>{@code matchIfMissing = true} is the important part: the limiter is on unless something
 * explicitly turns it off. A flag that defaults to off is protection that exists only in the
 * config file someone forgot to write.
 */
@Configuration
public class RateLimitConfig {

    @Bean
    @ConditionalOnProperty(
            prefix = "app.rate-limit",
            name = "enabled",
            havingValue = "true",
            matchIfMissing = true)
    RateLimitFilter rateLimitFilter(
            Clock clock,
            // 1 everywhere except dev, where the end-to-end suite signs in far more often
            // than any real user. Deliberately a multiplier rather than an off switch: the
            // filter stays in the chain, so the specs exercise the production code path.
            @Value("${app.rate-limit.multiplier:1}") int multiplier) {
        return new RateLimitFilter(clock, multiplier);
    }

    /**
     * Stops Boot registering the filter a second time.
     *
     * <p>Any {@code Filter} exposed as a bean is auto-registered with the servlet container in
     * addition to its place in the Spring Security chain. It would then run twice per request
     * and consume two units of quota for one attempt, halving every limit — and only for the
     * paths it guards, so the symptom would be login mysteriously locking out at five tries
     * instead of ten.
     */
    @Bean
    @ConditionalOnProperty(
            prefix = "app.rate-limit",
            name = "enabled",
            havingValue = "true",
            matchIfMissing = true)
    FilterRegistrationBean<RateLimitFilter> rateLimitFilterRegistration(RateLimitFilter filter) {
        FilterRegistrationBean<RateLimitFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
