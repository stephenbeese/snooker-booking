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
async function ensureCsrfToken(force = false): Promise<string | null> {
  const existing = readCsrfToken();
  if (existing && !force) {
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
  const isWrite = method !== 'GET' && method !== 'HEAD';

  let response = await send(path, init, isWrite, false);

  // A rejected CSRF token comes back as a bare 403 with no error envelope. It means the
  // cookie the page is holding no longer matches the server's session — after a backend
  // restart, or a session that expired while the tab sat open. Fetching a fresh token and
  // retrying once turns that into a successful request instead of an error the user can only
  // clear by reloading. Retried exactly once, and only for a write, so a genuine "you are not
  // allowed to do this" 403 still surfaces rather than looping.
  if (isWrite && response.status === 403 && !(await hasErrorEnvelope(response))) {
    response = await send(path, init, true, true);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function send(
  path: string,
  init: RequestInit,
  isWrite: boolean,
  forceFreshToken: boolean,
): Promise<Response> {
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Session auth means writes need the double-submit CSRF token, fetched first if the page
  // has not been issued one yet.
  if (isWrite) {
    const token = await ensureCsrfToken(forceFreshToken);
    if (token) {
      headers.set('X-XSRF-TOKEN', token);
    }
  }

  return fetch(path, {
    ...init,
    headers,
    // Required for the session cookie to travel.
    credentials: 'include',
  });
}

/**
 * Whether a 403 carries the application's own error envelope.
 *
 * <p>The distinction is what separates "your token is stale, try again" from "you are not
 * allowed to do this". The former is Spring Security's filter rejecting the request before it
 * reaches any controller, so there is no envelope; the latter comes from the application and
 * has one. Reads a clone so the caller can still consume the body.
 */
async function hasErrorEnvelope(response: Response): Promise<boolean> {
  try {
    const parsed: unknown = await response.clone().json();
    return Boolean(parsed && typeof parsed === 'object' && 'code' in parsed);
  } catch {
    return false;
  }
}
