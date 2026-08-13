package uk.co.club.booking.common.mail;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Supplies a {@link Mailer} when nothing else has.
 *
 * <p>The fallback is declared as a {@code @Bean} rather than by annotating {@link LoggingMailer}
 * with {@code @Component} + {@code @ConditionalOnMissingBean}. That combination looks equivalent
 * and is not — on a scanned component the condition is evaluated against a registry that does
 * not yet hold the other candidates, so it excluded the very bean it was meant to provide and
 * the application failed with "no qualifying bean of type Mailer".
 *
 * <p>A real SMTP or API sender declared anywhere in the application replaces this one without
 * any change here.
 */
@Configuration
public class MailConfig {

    @Bean
    @ConditionalOnMissingBean(Mailer.class)
    Mailer loggingMailer(Environment environment) {
        return new LoggingMailer(environment);
    }
}
