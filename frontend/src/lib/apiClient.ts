import { ApiError, type ApiErrorBody } from './apiError';

/** Reads the CSRF cookie Spring writes, to echo back as a header on writes. */
function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Makes sure a CSRF token exists before a write.
 *
 * <p>Spring issues the XSRF-TOKEN cookie on a response, so a freshly-loaded page that has not
 * yet made a request has no token — and its very first write is rejected with a bare 401. That
 * first write is usually the login attempt, so without this the app rejects the first sign-in
 * of every session and succeeds on the retry, which reads exactly like a wrong password.
 *
 * <p>A GET to a public endpoint is enough to be issued one.
 */
async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCsrfToken();
  if (existing) {
    return existing;
  }
  await fetch('/api/auth/me', { credentials: 'include' });
  return readCsrfToken();
}

async function toApiError(response: Response): Promise<ApiError> {
  // Spring Security rejects a request before it reaches the exception handler — an expired
  // session, or a missing CSRF token — so a 401 can arrive with no body at all and no error
  // envelope. Saying so beats "Request failed with status 401".
  let body: ApiErrorBody =
    response.status === 401
      ? {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Your session has expired. Please sign in again.',
        }
      : {
          code: 'UNEXPECTED_ERROR',
          message: `Request failed with status ${response.status}`,
        };
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object' && 'code' in parsed) {
      body = parsed as ApiErrorBody;
    }
  } catch {
    // Non-JSON error body (e.g. a proxy 502). Keep the generic message.
  }
  return new ApiError(response.status, body);
}

/**
 * Single entry point for backend calls. Components use TanStack Query hooks that
 * delegate here rather than calling fetch directly.
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Session auth means writes need the double-submit CSRF token, fetched first if the page
  // has not been issued one yet.
  if (method !== 'GET' && method !== 'HEAD') {
    const token = await ensureCsrfToken();
    if (token) {
      headers.set('X-XSRF-TOKEN', token);
    }
  }

  const response = await fetch(path, {
    ...init,
    headers,
    // Required for the session cookie to travel.
    credentials: 'include',
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
