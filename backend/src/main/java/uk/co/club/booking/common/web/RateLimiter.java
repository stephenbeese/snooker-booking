package uk.co.club.booking.common.web;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * A fixed-capacity sliding window counter, keyed by caller.
 *
 * <p>Hand-rolled rather than Bucket4j: this is under a hundred lines, has no configuration
 * surface to get wrong, and the alternative pulls in a dependency whose distributed
 * back-ends are the only reason to prefer it — and there is one application instance.
 *
 * <p>Deliberately in-memory. That means the limit resets on restart and would be per-node
 * behind a load balancer. For an attacker that is a marginal gain; a shared Redis counter
 * would be a hard dependency on infrastructure the club does not run. If this ever scales
 * out, this class is the single place to change.
 *
 * <p>Sliding rather than fixed window: a fixed window lets an attacker send the full quota
 * in the last second of one window and again in the first second of the next, which is
 * double the intended rate at exactly the moment it matters.
 */
public class RateLimiter {

    /** Beyond this many tracked keys, the ones with no activity in the window are dropped. */
    private static final int MAX_TRACKED_KEYS = 10_000;

    private final int limit;
    private final Duration window;
    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

    public RateLimiter(int limit, Duration window) {
        this.limit = limit;
        this.window = window;
    }

    /**
     * Records an attempt and reports whether it is allowed.
     *
     * @return empty when the caller is within the limit, otherwise how long to wait
     */
    public Optional<Duration> check(String key, Instant now) {
        // Everything — expiring old hits, counting, and recording this one — happens inside
        // compute(), which holds the bin lock for that key. Splitting it into a read and a
        // later write would let two concurrent requests both observe limit-1 and both pass,
        // which is exactly the burst this class exists to stop.
        AtomicReference<Duration> retryAfter = new AtomicReference<>();

        hits.compute(key, (ignored, existing) -> {
            Deque<Instant> deque = existing == null ? new ArrayDeque<>() : existing;
            Instant cutoff = now.minus(window);
            while (!deque.isEmpty() && deque.peekFirst().isBefore(cutoff)) {
                deque.pollFirst();
            }
            if (deque.size() < limit) {
                deque.addLast(now);
            } else {
                // At the limit. The oldest hit still in the window decides when a slot frees.
                Duration wait = Duration.between(now, deque.peekFirst().plus(window));
                retryAfter.set(wait.isNegative() ? Duration.ZERO : wait);
            }
            return deque;
        });

        // Cheap and only ever does work once the map is genuinely large.
        evictStale(now);

        return Optional.ofNullable(retryAfter.get());
    }

    /**
     * Forgets a key. Called on a successful login so a legitimate user who mistyped their
     * password several times is not still throttled afterwards.
     */
    public void clear(String key) {
        hits.remove(key);
    }

    /** Forgets everything. See {@code RateLimitFilter.resetForTesting}. */
    void clearAll() {
        hits.clear();
    }

    /**
     * Drops keys with no activity inside the window.
     *
     * <p>Without this the map is an unbounded memory leak: every distinct IP that ever hits
     * a login page stays in it forever. Called opportunistically rather than on a schedule —
     * a timer for a map that is usually empty is a thread that usually does nothing.
     */
    void evictStale(Instant now) {
        if (hits.size() < MAX_TRACKED_KEYS) {
            return;
        }
        Instant cutoff = now.minus(window);
        // computeIfPresent so the emptiness check runs under the same bin lock that
        // check() writes under, rather than racing a concurrent attempt.
        for (String key : hits.keySet()) {
            hits.computeIfPresent(key, (ignored, deque) -> {
                Instant last = deque.peekLast();
                return last == null || last.isBefore(cutoff) ? null : deque;
            });
        }
    }

    int trackedKeys() {
        return hits.size();
    }
}
