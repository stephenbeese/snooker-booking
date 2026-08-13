package uk.co.club.booking.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.session.jdbc.config.annotation.web.http.EnableJdbcHttpSession;

/**
 * Sessions in PostgreSQL.
 *
 * <p>Enabled explicitly rather than left to classpath auto-configuration. Two reasons:
 *
 * <ul>
 *   <li>It registers {@code FindByIndexNameSessionRepository}, which is what lets a password
 *       change or reset sign the user out of their other devices. Without that bean the feature
 *       cannot be built at all — and the failure appears as a missing dependency rather than as
 *       anything about sessions.
 *   <li>Where sessions live is a deliberate architectural decision, not something that should
 *       change silently because a dependency was added or removed.
 * </ul>
 *
 * <p>The table DDL is owned by Flyway (V11), so {@code initialize-schema: never} is set in
 * configuration — Spring Session's own initialiser would otherwise race the migration.
 */
@Configuration
@EnableJdbcHttpSession
public class SessionConfig {}
