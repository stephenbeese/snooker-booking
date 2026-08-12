package uk.co.club.booking.common.web;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lightweight liveness probe used by the dev workflow and the frontend smoke check.
 * Deliberately separate from Actuator: it reports database reachability in a shape the
 * SPA can render without exposing Actuator's fuller detail publicly.
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    private static final Logger log = LoggerFactory.getLogger(HealthController.class);

    private final DataSource dataSource;

    public HealthController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping
    public HealthResponse health() {
        return new HealthResponse("UP", databaseStatus());
    }

    private String databaseStatus() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(2) ? "UP" : "DOWN";
        } catch (SQLException e) {
            // Log the cause but never leak connection details to the caller.
            log.warn("Database health check failed", e);
            return "DOWN";
        }
    }

    public record HealthResponse(String status, String db) {}
}
