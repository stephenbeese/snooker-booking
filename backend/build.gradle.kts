plugins {
    java
    id("org.springframework.boot") version "4.1.0"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "uk.co.club"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        // Pinned to 21 (LTS). This machine's default JDK is 26; the toolchain makes
        // the build reproducible regardless of what is on PATH.
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

// Spring Boot 4.1's BOM does not manage Testcontainers, so pin it explicitly.
val testcontainersVersion = "2.0.5"

dependencies {
    testImplementation(platform("org.testcontainers:testcontainers-bom:$testcontainersVersion"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.session:spring-session-jdbc")

    // Spring Boot 4 moved Flyway auto-configuration out of spring-boot-autoconfigure
    // into this module. Without it Flyway is on the classpath but never runs, and the
    // first symptom is Hibernate reporting a missing table.
    implementation("org.springframework.boot:spring-boot-flyway")
    implementation("org.flywaydb:flyway-core")
    // Postgres needs its own Flyway module from Flyway 10 onward.
    runtimeOnly("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    // Testcontainers 2.x prefixes its module names ("testcontainers-postgresql");
    // the unprefixed 1.x coordinates stop at 1.21.4.
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
    options.compilerArgs.addAll(listOf("-Xlint:all", "-parameters"))
}

// The app must run in UTC. Instants are stored as timestamptz with
// hibernate.jdbc.time_zone=UTC, and that setting also makes the driver shift plain TIME
// columns (opening hours) by the JVM's offset — under BST that read 10:00-23:00 back as
// 11:00-00:00 and reported the club closed all summer.
//
// BookingApplication also sets this in a static initialiser, but -Duser.timezone is
// resolved before that runs, so it must be set here as well for bootRun.
tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
    systemProperty("user.timezone", "UTC")
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    // Same reason as bootRun, plus: a test that accidentally depends on the system zone
    // fails here rather than in October.
    systemProperty("user.timezone", "UTC")
    testLogging {
        events("passed", "skipped", "failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

// Lets `-Dseed.print=true` reach the test JVM (used to regenerate dev seed hashes).
tasks.named<Test>("test") {
    systemProperty("seed.print", System.getProperty("seed.print") ?: "false")
}
