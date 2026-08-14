import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUser } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminUsersPage } from './AdminUsersPage';

const ME = makeUser({ id: 1, role: 'ADMIN', firstName: 'Club', lastName: 'Manager' });

const DIRECTORY = {
  items: [
    {
      id: 1,
      email: 'manager@test.local',
      firstName: 'Club',
      lastName: 'Manager',
      fullName: 'Club Manager',
      phone: null,
      role: 'ADMIN',
      active: true,
      createdAt: '2026-01-01T10:00:00Z',
    },
    {
      id: 2,
      email: 'sam@test.local',
      firstName: 'Sam',
      lastName: 'Counter',
      fullName: 'Sam Counter',
      phone: '0161 000 0002',
      role: 'STAFF',
      active: true,
      createdAt: '2026-01-02T10:00:00Z',
    },
  ],
  page: 0,
  size: 25,
  totalItems: 2,
  totalPages: 1,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockApi(overrides: { onWrite?: () => Response } = {}) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : null });

      if (url.includes('/api/auth/me')) return json(ME);
      if (method !== 'GET') return overrides.onWrite?.() ?? json({});
      if (url.includes('/api/admin/users')) return json(DIRECTORY);
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists accounts with the access each one has', async () => {
    mockApi();
    renderWithRouter(<AdminUsersPage />, { route: '/admin/users', path: '/admin/users' });

    expect(await screen.findByText('Sam Counter')).toBeInTheDocument();
    // The role control shows the current level, so an admin can see at a glance who can do
    // what without opening anything.
    expect(screen.getByLabelText('Access level for Sam Counter')).toHaveValue('STAFF');
  });

  it('creates an account with the chosen access level', async () => {
    const calls = mockApi({
      onWrite: () =>
        json(
          {
            id: 3,
            email: 'new@test.local',
            firstName: 'New',
            lastName: 'Starter',
            fullName: 'New Starter',
            phone: null,
            role: 'STAFF',
            active: true,
            createdAt: '2026-01-03T10:00:00Z',
          },
          201,
        ),
    });
    const user = userEvent.setup();
    renderWithRouter(<AdminUsersPage />, { route: '/admin/users', path: '/admin/users' });

    await user.click(await screen.findByRole('button', { name: 'Add someone' }));
    await user.type(screen.getByLabelText('First name'), 'New');
    await user.type(screen.getByLabelText('Last name'), 'Starter');
    await user.type(screen.getByLabelText('Email address'), 'new@test.local');
    await user.type(screen.getByLabelText('Password'), 'AVeryLongPassword1');
    await user.click(screen.getByRole('radio', { name: /Staff/ }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });
    const sent = JSON.parse(calls.find((call) => call.method === 'POST')?.body ?? '{}');
    expect(sent.role).toBe('STAFF');
    expect(sent.email).toBe('new@test.local');
    // The admin has to be told the password will not be emailed, or a new starter waits for
    // a message that never arrives.
    expect(await screen.findByRole('status')).toHaveTextContent(/give them the password/i);
  });

  it('refuses a password the server would reject, without asking it', async () => {
    // 12 characters is the server's rule. Sending a shorter one would produce a 400 the
    // admin has to decode; the form says so first.
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithRouter(<AdminUsersPage />, { route: '/admin/users', path: '/admin/users' });

    await user.click(await screen.findByRole('button', { name: 'Add someone' }));
    await user.type(screen.getByLabelText('First name'), 'New');
    await user.type(screen.getByLabelText('Last name'), 'Starter');
    await user.type(screen.getByLabelText('Email address'), 'new@test.local');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    });
  });

  it('changes someone’s access level', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithRouter(<AdminUsersPage />, { route: '/admin/users', path: '/admin/users' });

    await user.selectOptions(
      await screen.findByLabelText('Access level for Sam Counter'),
      'ADMIN',
    );

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/admin/users/2/role'))).toBe(true);
    });
    const sent = JSON.parse(
      calls.find((call) => call.url.includes('/role'))?.body ?? '{}',
    );
    expect(sent.role).toBe('ADMIN');
  });

  it('does not offer to demote or deactivate your own account', async () => {
    // The server refuses both, so offering a control that always fails would be a button
    // whose only outcome is an error message.
    mockApi();
    renderWithRouter(<AdminUsersPage />, { route: '/admin/users', path: '/admin/users' });

    expect(await screen.findByLabelText('Access level for Club Manager')).toBeDisabled();
    const ownRow = screen.getByText('Club Manager').closest('tr')!;
    expect(within(ownRow).getByRole('button', { name: 'Deactivate' })).toBeDisabled();
    // Someone else's row keeps both.
    const otherRow = screen.getByText('Sam Counter').closest('tr')!;
    expect(within(otherRow).getByRole('button', { name: 'Deactivate' })).toBeEnabled();
  });

  it('shows the server’s reason when a role change is refused', async () => {
    // "This is the club's only admin" is a rule the client deliberately does not duplicate,
    // so the server's message is the only thing that can explain the refusal.
    mockApi({
      onWrite: () =>
        json(
          {
            code: 'VALIDATION_FAILED',
            message: "This is the club's only admin. Give someone else admin access first.",
          },
          422,
        ),
    });
    const user = userEvent.setup();
    renderWithRouter(<AdminUsersPage />, { route: '/admin/users', path: '/admin/users' });

    await user.selectOptions(
      await screen.findByLabelText('Access level for Sam Counter'),
      'CUSTOMER',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/only admin/i);
  });

  it('sends the search term to the server rather than filtering in the browser', async () => {
    // The directory is paged, so a browser-side filter would search only the current page
    // and confidently report nothing.
    const calls = mockApi();
    const user = userEvent.setup();
    renderWithRouter(<AdminUsersPage />, { route: '/admin/users', path: '/admin/users' });

    await user.type(await screen.findByLabelText('Search'), 'sam');

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('search=sam'))).toBe(true);
    });
  });
});
