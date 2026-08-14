import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUser } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminLayout } from './AdminLayout';
import type { Role } from '@/features/auth/types';

/** Answers /api/auth/me with a user of the given role, and nothing else. */
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
      return new Response(null, { status: 204 });
    }),
  );
}

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives an admin the whole staff area', async () => {
    mockSession('ADMIN');
    renderWithRouter(<AdminLayout />, { route: '/admin', path: '/admin' });

    const nav = await screen.findByRole('navigation', { name: 'Staff' });
    expect(await screen.findByRole('link', { name: 'Club settings' })).toBeInTheDocument();
    expect(nav).toBeInTheDocument();
    for (const label of [
      'Dashboard',
      'Bookings',
      'Calendar',
      'New booking',
      'Maintenance',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Manage tables' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Menu items' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage staff' })).toBeInTheDocument();
  });

  it('does not offer a customer directory to anyone', () => {
    // The screen and its endpoints were removed outright rather than hidden: a link nobody
    // can see is still a URL anyone can type, and the API was what actually decided.
    mockSession('ADMIN');
    renderWithRouter(<AdminLayout />, { route: '/admin', path: '/admin' });

    expect(screen.queryByRole('link', { name: /customer/i })).not.toBeInTheDocument();
  });

  it('does not offer staff the screens they would be refused', async () => {
    // Not tidiness. A link a STAFF member can see but not follow teaches them the screen
    // exists and then refuses them, every time, for a permission they cannot grant
    // themselves. The route guard and the server still decide; this only stops the tease.
    mockSession('STAFF');
    renderWithRouter(<AdminLayout />, { route: '/admin', path: '/admin' });

    expect(await screen.findByRole('link', { name: 'Bookings' })).toBeInTheDocument();
    // The calendar is a staff tool above all — it is what someone on the counter looks at,
    // as is marking a table out of service.
    expect(screen.getByRole('link', { name: 'Calendar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Maintenance' })).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Club settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage tables' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage staff' })).not.toBeInTheDocument();
  });

  it('shows no admin links while the session is still loading', async () => {
    // False is the safe direction to be wrong in for one render: a bar that flashes links
    // and then withdraws them looks broken, and briefly advertises a screen to someone who
    // may not be allowed it.
    mockSession('ADMIN');
    renderWithRouter(<AdminLayout />, { route: '/admin', path: '/admin' });

    expect(screen.queryByRole('link', { name: 'Club settings' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Club settings' })).toBeInTheDocument(),
    );
  });
});
