import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { BackendStatus } from './BackendStatus';

function mockFetchJson(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('BackendStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports backend and database up', async () => {
    vi.stubGlobal('fetch', mockFetchJson(200, { status: 'UP', db: 'UP' }));

    renderWithProviders(<BackendStatus />);

    await waitFor(() => {
      expect(screen.getByText('Backend: UP')).toBeInTheDocument();
    });
    expect(screen.getByText('Database: UP')).toBeInTheDocument();
  });

  it('surfaces a database outage rather than reporting a blanket UP', async () => {
    vi.stubGlobal('fetch', mockFetchJson(200, { status: 'UP', db: 'DOWN' }));

    renderWithProviders(<BackendStatus />);

    await waitFor(() => {
      expect(screen.getByText('Database: DOWN')).toBeInTheDocument();
    });
  });

  it('shows an alert when the backend is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson(503, { code: 'SERVICE_UNAVAILABLE', message: 'backend down' }),
    );

    renderWithProviders(<BackendStatus />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('backend down');
    });
  });
});
