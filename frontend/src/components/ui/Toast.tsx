import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ToastTone = 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/**
 * Raises a transient confirmation. `tone` defaults to success, which is what nearly every
 * call site wants — an error that matters belongs inline next to the control that caused it,
 * where it stays put and can be read twice.
 */
type ShowToast = (message: string, tone?: ToastTone) => void;

/**
 * Undefined outside a provider, which is what lets {@link useToast} tell "no provider" apart
 * from "provider present". A default no-op function here would silently swallow every toast
 * in a tree that forgot to mount one.
 */
const ToastContext = createContext<ShowToast | undefined>(undefined);

/** How long a toast stays before dismissing itself. */
const DISMISS_AFTER_MS = 5000;

/**
 * Transient confirmations for actions that otherwise complete in silence.
 *
 * <p>Success only, as a rule. Saving settings, taking a booking or reordering tables produced
 * no acknowledgement at all before this, so the screen looked identical whether the save had
 * worked or quietly failed. Errors stay inline: a message that removes itself after five
 * seconds is the wrong home for something the reader has to act on.
 *
 * <p>Not a dialog and never focused. The toast is an aside to whatever the user is already
 * doing — moving focus to it would interrupt the very task it is reporting on, and would
 * strand keyboard users when it disappeared out from under them.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Monotonic rather than Date.now(): two toasts raised in the same millisecond would share a
  // key, and React would treat the second as an update to the first.
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ShowToast>(
    (message, tone = 'success') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );
    },
    [dismiss],
  );

  // Every pending timer is cleared on unmount. Without this a timer outliving its provider
  // calls setState on an unmounted tree, which in tests surfaces as a warning attributed to
  // whichever test happened to be running when it fired.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  // The value is the setter alone and is stable, so consumers calling `toast(...)` in an
  // effect do not re-run every time a toast appears or leaves.
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    // aria-live on the container, which is always mounted. Putting it on the toast itself
    // would announce nothing: assistive technology watches a live region for changes, and a
    // region that appears already containing its message has no change to report.
    <div
      aria-live="polite"
      // Toasts report what just happened; they never interrupt. `false` lets a screen reader
      // finish its current sentence before reading one.
      aria-atomic={false}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          // status, not alert: alert is assertive and would cut across whatever is being
          // read. Nothing here is urgent enough to interrupt.
          role="status"
          className={[
            // The viewport ignores pointer events so it never blocks the page beneath it;
            // each toast takes them back so its dismiss button still works.
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card p-4 shadow-lifted',
            toast.tone === 'error'
              ? 'border border-rose-200 bg-rose-50 text-rose-900'
              : 'border border-felt-200 bg-felt-50 text-felt-900',
          ].join(' ')}
        >
          <p className="grow text-sm font-medium">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            // Named for what it closes. Several toasts can be stacked, and three buttons all
            // called "Dismiss" tell a screen-reader user nothing about which is which.
            aria-label={`Dismiss: ${toast.message}`}
            className="-m-1 rounded p-1 text-lg leading-none opacity-60 transition-opacity hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Raises a toast from anywhere under a {@link ToastProvider}.
 *
 * <p>Throws when no provider is mounted rather than returning a no-op. A missing provider
 * means every confirmation in that tree vanishes silently, which is precisely the bug toasts
 * were added to fix — failing loudly in a test is far cheaper than discovering it in use.
 */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return show;
}
