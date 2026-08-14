import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUser } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AppLayout } from './AppLayout';
import type { Role } from '@/features/auth/types';

/** Answers /api/auth/me with a user of the given role, or 204 for nobody signed in. */
function mockSession(role: Role | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/me')) {
        if (role === null) return new Response(null, { status: 204 });
        return new Response(JSON.stringify(makeUser({ role })), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    }),
  );
}

function render() {
  return renderWithRouter(<AppLayout />, { route: '/book', path: '/book' });
}

/** The desktop cluster and the mobile menu both render NavItems; this reads one of them. */
function linkNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '');
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers the public pages to somebody who is not signed in', async () => {
    mockSession(null);
    render();

    expect(await screen.findByRole('link', { name: 'Book a table' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My bookings' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Staff' })).toBeNull();
  });

  it('shows the staff area to staff and hides it from customers', async () => {
    mockSession('STAFF');
    render();

    expect(await screen.findByRole('link', { name: 'Staff' })).toBeInTheDocument();
  });

  it('hides the staff area from a customer', async () => {
    mockSession('CUSTOMER');
    render();

    expect(await screen.findByRole('link', { name: 'My bookings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Staff' })).toBeNull();
  });

  it('renders the same links on mobile as on desktop', async () => {
    // The two menus were written out separately and had already drifted. A link added to one
    // and not the other is invisible until somebody opens the site on a phone, which is
    // exactly the kind of thing nobody notices for months — so the lists are asserted equal
    // rather than each being checked for whatever was remembered at the time.
    mockSession('ADMIN');
    const user = userEvent.setup();
    render();

    // Wait for the role-gated link before reading either list: the public links render on the
    // first pass, so without this the desktop list is captured a tick before the session lands.
    await screen.findByRole('link', { name: 'Staff' });

    const desktopNav = screen.getByRole('navigation', { name: 'Main' });
    const desktopLinks = linkNames(desktopNav).filter(
      (name) => name !== '' && name !== 'Skip to content',
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobileMenu = document.getElementById('mobile-menu')!;
    const mobileLinks = linkNames(mobileMenu);

    for (const label of ['Book a table', 'Menu', 'My bookings', 'Staff']) {
      expect(desktopLinks).toContain(label);
      expect(mobileLinks).toContain(label);
    }
  });

  it('waits for the session before showing a role-gated link', async () => {
    // A "Staff" link that appears and is then taken away reads as a bug. Nothing role-gated
    // renders until /api/auth/me has answered.
    let resolveSession: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/api/auth/me')) {
          return new Promise<Response>((resolve) => {
            resolveSession = resolve;
          });
        }
        return new Response(null, { status: 204 });
      }),
    );
    render();

    // Public links are up immediately — they do not depend on who is looking.
    expect(await screen.findByRole('link', { name: 'Book a table' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Staff' })).toBeNull();

    resolveSession(
      new Response(JSON.stringify(makeUser({ role: 'ADMIN' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await waitFor(() => expect(screen.getByRole('link', { name: 'Staff' })).toBeInTheDocument());
  });
});
