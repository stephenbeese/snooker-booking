import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUser } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { RequireAdmin } from './RequireAdmin';
import type { User } from '@/features/auth/types';

/** Answers /api/auth/me with the given user, or 204 for an anonymous visitor. */
function mockCurrentUser(user: User | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      user
        ? new Response(JSON.stringify(user), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response(null, { status: 204 }),
    ),
  );
}

describe('RequireAdmin', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the staff area for an admin', async () => {
    mockCurrentUser(makeUser({ role: 'ADMIN' }));

    renderWithRouter(
      <RequireAdmin>
        <p>Staff content</p>
      </RequireAdmin>,
    );

    expect(await screen.findByText('Staff content')).toBeInTheDocument();
  });

  it('refuses a signed-in customer without offering a sign-in form', async () => {
    // The distinction that matters: a customer is already authenticated, so bouncing them to
    // /login would invite them to re-enter credentials that cannot change the outcome.
    mockCurrentUser(makeUser({ role: 'CUSTOMER' }));

    renderWithRouter(
      <RequireAdmin>
        <p>Staff content</p>
      </RequireAdmin>,
    );

    expect(await screen.findByText(/staff only/i)).toBeInTheDocument();
    expect(screen.queryByText('Staff content')).not.toBeInTheDocument();
  });

  it('does not flash the refusal while the session is still being checked', async () => {
    // A guard that rendered its decision before /api/auth/me answered would show "Staff only"
    // to an admin on every hard refresh.
    let resolve: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => { resolve = r; })),
    );

    renderWithRouter(
      <RequireAdmin>
        <p>Staff content</p>
      </RequireAdmin>,
    );

    expect(screen.queryByText(/staff only/i)).not.toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    resolve?.(
      new Response(JSON.stringify(makeUser({ role: 'ADMIN' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await screen.findByText('Staff content')).toBeInTheDocument();
  });
});
