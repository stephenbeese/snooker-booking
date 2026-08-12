package uk.co.club.booking;

import java.time.ZoneOffset;
import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
public class BookingApplication {

    static {
        // Run the JVM in UTC before Spring or the JDBC driver initialise.
        //
        // This is load-bearing, not hygiene. Instants are stored as timestamptz with
        // hibernate.jdbc.time_zone=UTC, but that setting also makes the driver shift
        // plain TIME columns by the JVM's offset from UTC. Under BST that read
        // opening hours of 10:00-23:00 back as 11:00-00:00, collapsing the window and
        // reporting the club closed all summer.
        //
        // With the JVM in UTC there is no offset to misapply. Club-local wall-clock
        // conversion is ClubClock's job and uses the configured zone explicitly, so
        // nothing else depends on the default zone.
        TimeZone.setDefault(TimeZone.getTimeZone(ZoneOffset.UTC));
    }

    public static void main(String[] args) {
        SpringApplication.run(BookingApplication.class, args);
    }
}
