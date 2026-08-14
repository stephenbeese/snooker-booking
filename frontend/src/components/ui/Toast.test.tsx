import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

/** A button that raises whatever it is given, so tests drive the provider through its API. */
function Raiser({ message, tone }: { message: string; tone?: 'success' | 'error' }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast(message, tone)}>
      raise {message}
    </button>
  );
}

function renderWithProvider(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

/**
 * fireEvent rather than userEvent throughout.
 *
 * <p>userEvent awaits real timers internally, so it deadlocks against the fake clock these
 * tests need to reach the five-second expiry — the first draft used it and every case timed
 * out, including ones that never advance time. Each interaction here is a single click, where
 * userEvent's extra realism (pointer events, focus) buys nothing.
 */
function raise(message: string) {
  fireEvent.click(screen.getByRole('button', { name: `raise ${message}` }));
}

/** Advances the fake clock inside act, so React processes the resulting state update. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a message when one is raised', () => {
    renderWithProvider(<Raiser message="Saved." />);

    raise('Saved.');

    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  });

  it('dismisses itself after five seconds', () => {
    // The whole premise of a toast: it leaves on its own. One that stays forever is an inline
    // message in the wrong place, permanently covering a corner of the screen.
    vi.useFakeTimers();
    renderWithProvider(<Raiser message="Saved." />);

    raise('Saved.');
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Just short of the timeout: still there, so the assertion below is about the timer
    // firing rather than about the toast never having rendered.
    advance(4999);
    expect(screen.getByRole('status')).toBeInTheDocument();

    advance(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stacks several toasts rather than replacing the one on screen', () => {
    // Saving two settings sections in quick succession must not silently drop the first
    // confirmation — which is what a single-slot implementation would do.
    renderWithProvider(
      <>
        <Raiser message="First." />
        <Raiser message="Second." />
      </>,
    );

    raise('First.');
    raise('Second.');

    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('expires each toast on its own clock, not the newest one', () => {
    // Two toasts raised three seconds apart are due to go at t=5s and t=8s. A single shared
    // timer would take both at once, cutting the second one short by three seconds.
    vi.useFakeTimers();
    renderWithProvider(
      <>
        <Raiser message="First." />
        <Raiser message="Second." />
      </>,
    );

    raise('First.');
    advance(3000);
    raise('Second.');

    // t=5s: the first has had its full five seconds, the second only two.
    advance(2000);
    expect(screen.queryByText('First.')).not.toBeInTheDocument();
    expect(screen.getByText('Second.')).toBeInTheDocument();

    // t=8s: the second's own five seconds are up.
    advance(3000);
    expect(screen.queryByText('Second.')).not.toBeInTheDocument();
  });

  it('can be dismissed before it expires', () => {
    renderWithProvider(<Raiser message="Saved." />);

    raise('Saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Saved.' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('names each dismiss button after the toast it closes', () => {
    // Several stacked toasts give several dismiss buttons. All named "Dismiss" would leave a
    // screen-reader user unable to tell which one they are about to close.
    renderWithProvider(
      <>
        <Raiser message="First." />
        <Raiser message="Second." />
      </>,
    );

    raise('First.');
    raise('Second.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: First.' }));

    expect(screen.queryByText('First.')).not.toBeInTheDocument();
    expect(screen.getByText('Second.')).toBeInTheDocument();
  });

  it('announces politely from a region that was already mounted', () => {
    // Two separate requirements, and the second is the subtle one. A live region that appears
    // with its message already inside announces nothing — assistive technology watches a
    // region for *changes*, so the container must outlive the individual toasts.
    renderWithProvider(<Raiser message="Saved." />);

    const live = document.querySelector('[aria-live]');
    expect(live).toBeInTheDocument();
    // polite, never assertive: a toast reports what already happened and must not cut across
    // whatever a screen reader is mid-sentence on.
    expect(live).toHaveAttribute('aria-live', 'polite');

    raise('Saved.');

    // The same node, still — not a replacement mounted alongside the message.
    expect(document.querySelector('[aria-live]')).toBe(live);
    expect(live).toContainElement(screen.getByRole('status'));
  });

  it('marks an error toast differently from a success one', () => {
    renderWithProvider(
      <>
        <Raiser message="Saved." />
        <Raiser message="Failed." tone="error" />
      </>,
    );

    raise('Saved.');
    raise('Failed.');

    const [success, failure] = screen.getAllByRole('status');
    expect(success!.className).toContain('felt');
    expect(failure!.className).toContain('rose');
  });

  it('refuses to be used without a provider', () => {
    // A missing provider would otherwise swallow every confirmation in that tree silently —
    // exactly the bug toasts were introduced to fix. Failing loudly in a test is far cheaper
    // than finding it in use.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Raiser message="Saved." />)).toThrow(/ToastProvider/);
    quiet.mockRestore();
  });
});
