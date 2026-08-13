package uk.co.club.booking.domain.user;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;

/**
 * Signs a user out everywhere.
 *
 * <p>Exists because a password change or reset that leaves existing sessions alive is close to
 * useless: the usual reason for changing a password is believing somebody else has it, and that
 * somebody is holding a session cookie the new password does not affect.
 *
 * <p>Depends on {@code FindByIndexNameSessionRepository}, which Spring Session JDBC provides and
 * which is backed by the {@code PRINCIPAL_NAME} index created in V11 — without that index this
 * would be a full table scan of every live session.
 */
@Component
public class SessionInvalidator {

    private static final Logger log = LoggerFactory.getLogger(SessionInvalidator.class);

    private final FindByIndexNameSessionRepository<? extends Session> sessionRepository;

    public SessionInvalidator(
            FindByIndexNameSessionRepository<? extends Session> sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    /**
     * Deletes every session belonging to a principal.
     *
     * @param keepSessionId the caller's own session, spared so that changing your password does
     *     not immediately log you out of the page you are standing on. Pass null to sign out
     *     everywhere, which is what a password <em>reset</em> wants: the person resetting it
     *     arrived through their mailbox, not through a live session.
     */
    public void invalidateAllExcept(String principalName, String keepSessionId) {
        Map<String, ? extends Session> sessions =
                sessionRepository.findByPrincipalName(principalName);

        int deleted = 0;
        for (String sessionId : sessions.keySet()) {
            if (sessionId.equals(keepSessionId)) {
                continue;
            }
            sessionRepository.deleteById(sessionId);
            deleted++;
        }

        // No identifying detail beyond the count: this line ends up in logs that are read
        // far more widely than the sessions table itself.
        log.info("Invalidated {} other session(s) after a credential change", deleted);
    }
}
