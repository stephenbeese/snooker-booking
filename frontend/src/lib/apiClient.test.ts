import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './apiClient';
import { ApiError } from './apiError';

/** Sets the CSRF cookie the client reads, as Spring's response would. */
function setToken(value: string) {
  document.cookie = `XSRF-TOKEN=${value}; path=/`;
}

function clearCookies() {
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  });
}

describe('apiRequest', () => {
  beforeEach(() => {
    clearCookies();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCookies();
  });

  it('retries a write once with a fresh token when the CSRF token is stale', async () => {
    // The scenario: the tab has been open across a backend restart, so the cookie it holds no
    // longer matches any session. Spring rejects the write with a bare 403. Without the retry
    // the user sees an error they can only clear by reloading the page.
    setToken('stale-token');
    const sent: (string | null)[] = [];
    let writeAttempts = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);

        if (url.includes('/api/auth/me')) {
          setToken('fresh-token');
          return new Response(null, { status: 204 });
        }

        sent.push(headers.get('X-XSRF-TOKEN'));
        writeAttempts += 1;
        // First attempt carries the stale token and is refused with no body, exactly as
        // Spring's CSRF filter answers.
        return writeAttempts === 1
          ? new Response(null, { status: 403 })
          : new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
      }),
    );

    const result = await apiRequest<{ ok: boolean }>('/api/thing', {
      method: 'POST',
      body: '{}',
    });

    expect(result).toEqual({ ok: true });
    expect(sent).toEqual(['stale-token', 'fresh-token']);
  });

  it('does not retry a 403 that explains itself', async () => {
    // A role refusal will say the same thing however many times it is asked. Retrying it would
    // double every forbidden request and still fail.
    setToken('good-token');
    let attempts = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/api/auth/me')) {
          return new Response(null, { status: 204 });
        }
        attempts += 1;
        return new Response(
          JSON.stringify({ code: 'ACCESS_DENIED', message: 'You do not have permission.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    await expect(apiRequest('/api/admin/thing', { method: 'POST', body: '{}' })).rejects.toThrow(
      ApiError,
    );
    expect(attempts).toBe(1);
  });

  it('does not retry a failed read', async () => {
    // Only writes carry a CSRF token, so a 403 on a GET can never be a stale-token problem.
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        attempts += 1;
        return new Response(null, { status: 403 });
      }),
    );

    await expect(apiRequest('/api/thing')).rejects.toThrow(ApiError);
    expect(attempts).toBe(1);
  });

  it('gives up after one retry rather than looping', async () => {
    setToken('stale-token');
    let writeAttempts = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/api/auth/me')) {
          setToken('also-stale');
          return new Response(null, { status: 204 });
        }
        writeAttempts += 1;
        return new Response(null, { status: 403 });
      }),
    );

    await expect(apiRequest('/api/thing', { method: 'POST', body: '{}' })).rejects.toThrow(
      ApiError,
    );
    expect(writeAttempts).toBe(2);
  });
});
