plugins {
    // Lets Gradle download a real JDK 21 instead of silently compiling on whatever
    // JDK happens to be on PATH (this machine has 26).
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "snooker-booking-backend"
