import { useEffect, useState } from 'react';

/**
 * A value that lags behind, so a request is not sent per keystroke.
 *
 * <p>Typing "smith" fires six requests without this — one per character — and they can land out
 * of order, so the results shown are whichever server response happened to be slowest rather
 * than the one for what is in the box.
 *
 * <p>The timer is cleared on every change, so the delay is measured from the *last* keystroke:
 * a fast typist produces exactly one request, not one per pause.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
