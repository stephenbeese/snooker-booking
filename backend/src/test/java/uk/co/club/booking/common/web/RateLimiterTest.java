package uk.co.club.booking.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

    private static final Instant T0 = Instant.parse("2026-08-13T10:00:00Z");

    @Test
    void allowsUpToTheLimitThenRefuses() {
        RateLimiter limiter = new RateLimiter(3, Duration.ofMinutes(1));

        assertThat(limiter.check("ip", T0)).isEmpty();
        assertThat(limiter.check("ip", T0.plusSeconds(1))).isEmpty();
        assertThat(limiter.check("ip", T0.plusSeconds(2))).isEmpty();
        assertThat(limiter.check("ip", T0.plusSeconds(3)))
                .as("the fourth attempt inside the window")
                .isPresent();
    }

    @Test
    void keysAreIndependent() {
        RateLimiter limiter = new RateLimiter(1, Duration.ofMinutes(1));

        assertThat(limiter.check("alice", T0)).isEmpty();
        assertThat(limiter.check("bob", T0))
                .as("one caller exhausting their quota must not affect another")
                .isEmpty();
    }

    @Test
    void theWindowSlidesRatherThanResetting() {
        // The reason for a sliding window: with a fixed one, an attacker sends the full
        // quota at the end of a window and the full quota again immediately after, which is
        // double the intended rate at exactly the moment it matters.
        RateLimiter limiter = new RateLimiter(2, Duration.ofMinutes(1));

        limiter.check("ip", T0);
        limiter.check("ip", T0.plusSeconds(59));
        assertThat(limiter.check("ip", T0.plusSeconds(59))).isPresent();

        // A second later the first hit ages out and exactly one slot frees up.
        assertThat(limiter.check("ip", T0.plusSeconds(61))).isEmpty();
        assertThat(limiter.check("ip", T0.plusSeconds(61)))
                .as("the hit at +59s is still inside the window")
                .isPresent();
    }

    @Test
    void retryAfterCountsFromTheOldestHitInTheWindow() {
        RateLimiter limiter = new RateLimiter(1, Duration.ofMinutes(1));
        limiter.check("ip", T0);

        assertThat(limiter.check("ip", T0.plusSeconds(20)))
                .get()
                .as("40s left of the minute that began at T0")
                .isEqualTo(Duration.ofSeconds(40));
    }

    @Test
    void clearForgetsAKey() {
        RateLimiter limiter = new RateLimiter(1, Duration.ofMinutes(1));
        limiter.check("alice", T0);
        assertThat(limiter.check("alice", T0)).isPresent();

        limiter.clear("alice");

        assertThat(limiter.check("alice", T0))
                .as("a successful login must not leave the user throttled")
                .isEmpty();
    }

    @Test
    void aRefusedAttemptDoesNotExtendTheWindow() {
        // If a rejected attempt were recorded, an attacker hammering the endpoint would keep
        // pushing their own unlock time back — but so would a legitimate user retrying, and
        // they would never get in again. The limit must be a ceiling, not a punishment.
        RateLimiter limiter = new RateLimiter(1, Duration.ofMinutes(1));
        limiter.check("ip", T0);

        for (int i = 1; i <= 30; i++) {
            limiter.check("ip", T0.plusSeconds(i));
        }

        assertThat(limiter.check("ip", T0.plusSeconds(61)))
                .as("the window still ends 60s after the one recorded hit")
                .isEmpty();
    }

    @Test
    void concurrentAttemptsCannotExceedTheLimit() throws Exception {
        // The bug this guards against: checking the count and recording the hit as two steps
        // lets N threads all observe limit-1 and all pass. That is precisely the burst a rate
        // limiter exists to stop, and it only appears under real concurrency.
        int limit = 5;
        int threads = 50;
        RateLimiter limiter = new RateLimiter(limit, Duration.ofMinutes(1));

        List<Callable<Boolean>> attempts = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            attempts.add(() -> limiter.check("ip", T0).isEmpty());
        }

        int allowed;
        try (ExecutorService pool = Executors.newFixedThreadPool(threads)) {
            // invokeAll rather than a loop of submit(), so the threads genuinely contend.
            List<Future<Boolean>> results = pool.invokeAll(attempts);
            allowed = 0;
            for (Future<Boolean> result : results) {
                if (result.get()) {
                    allowed++;
                }
            }
        }

        assertThat(allowed).as("exactly the limit, no matter how many threads raced").isEqualTo(limit);
    }
}
