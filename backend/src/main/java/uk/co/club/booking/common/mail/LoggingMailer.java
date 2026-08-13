package uk.co.club.booking.common.mail;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;

/**
 * Writes mail to the log instead of sending it.
 *
 * <p>Registered by {@link MailConfig} only while no real {@link Mailer} bean exists, so adding
 * an SMTP or API sender later replaces it without touching any calling code.
 *
 * <p>This deliberately logs the reset link in full, which is exactly what must never happen in
 * production — the link is a credential, and anyone with log access could take over the account.
 * {@link #warnIfMisconfigured()} is what stops that being a silent mistake.
 */
public class LoggingMailer implements Mailer {

    private static final Logger log = LoggerFactory.getLogger(LoggingMailer.class);

    private final Environment environment;

    public LoggingMailer(Environment environment) {
        this.environment = environment;
    }

    /**
     * Refuses to start in production.
     *
     * <p>A loud log line would not be enough: this bean is selected by the <em>absence</em> of a
     * real mailer, so the failure mode is a deployment where somebody simply forgot to configure
     * SMTP. That deployment would come up healthy, serve traffic, and quietly write every
     * customer's reset link into the application log. Failing at startup turns a silent
     * credential leak into an obvious misconfiguration.
     */
    @PostConstruct
    void warnIfMisconfigured() {
        boolean production = environment.matchesProfiles("prod");
        if (production) {
            throw new IllegalStateException(
                    "LoggingMailer is active in the prod profile: password reset links would be "
                            + "written to the application log. Configure a real Mailer bean.");
        }
        log.warn(
                "LoggingMailer active: mail is written to this log, not sent. "
                        + "Reset links appear in plain text — development use only.");
    }

    @Override
    public void send(String to, String subject, String body) {
        log.info(
                """

                ─── DEV MAIL ──────────────────────────────────────────────
                To:      {}
                Subject: {}

                {}
                ───────────────────────────────────────────────────────────
                """,
                to,
                subject,
                body);
    }
}
