package uk.co.club.booking.common.mail;

/**
 * Sends transactional mail.
 *
 * <p>An interface with one real implementation, which is usually a smell. It earns its place
 * for the same reason {@code CheckoutGateway} does: the alternative is that password reset
 * cannot be developed or tested without live SMTP credentials, so the code that hands out
 * account access would become the least exercised code in the system.
 *
 * <p>Deliberately not a general mail abstraction — no attachments, no templates, no CC. Those
 * are requirements this system does not have.
 */
public interface Mailer {

    void send(String to, String subject, String body);
}
