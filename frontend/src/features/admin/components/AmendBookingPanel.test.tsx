import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAdminBooking, makeUser } from '@/test/factories';
import { useCurrentUser } from '@/features/auth/useAuth';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AmendBookingPanel } from './AmendBookingPanel';
import type { Role } from '@/features/auth/types';

/** Answers /api/auth/me with a user of the given role, and nothing else of substance. */
function mockSession(role: Role) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/me')) {
        return new Response(JSON.stringify(makeUser({ role })), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

/**
 * Renders the panel next to a probe that prints the resolved role.
 *
 * <p>The probe is what makes the negative assertions mean anything. `waitFor` on "no button"
 * succeeds on the very first tick — before the session has resolved and before the component
 * knows the role — so it passed even with the role check deleted outright. Waiting for the
 * probe pins the assertion to a moment when the role is definitely known.
 */
function render(booking = makeAdminBooking()) {
  renderWithRouter(
    <>
      <RoleProbe />
      <AmendBookingPanel booking={booking} />
    </>,
    { route: '/admin/bookings/SNK-ABC123', path: '/admin/bookings/:reference' },
  );
}

function RoleProbe() {
  const { data: user } = useCurrentUser();
  return <span data-testid="role">{user?.role ?? 'loading'}</span>;
}

describe('AmendBookingPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers the move to a manager', async () => {
    mockSession('ADMIN');
    render();

    expect(
      await screen.findByRole('button', { name: 'Move this booking' }),
    ).toBeInTheDocument();
  });

  it('offers nothing to staff', async () => {
    // The server refuses staff outright; this only hides a control they cannot use, so the
    // absence here is a courtesy rather than the boundary.
    mockSession('STAFF');
    render();

    // Anchored on the session having actually resolved. A bare waitFor on the button's absence
    // passes on the first tick — before the role is known — so it held even with the role check
    // deleted entirely, which is how this test was first written and why it proved nothing.
    await screen.findByText('STAFF');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers nothing for a booking that is already over', async () => {
    // Nothing left to move, and the server says so — a button whose only outcome is an error.
    mockSession('ADMIN');
    render(makeAdminBooking({ status: 'CANCELLED' }));

    await screen.findByText('ADMIN');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
