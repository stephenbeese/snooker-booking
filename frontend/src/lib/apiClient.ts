import { ApiError, type ApiErrorBody } from './apiError';

/** Reads the CSRF cookie Spring writes, to echo back as a header on writes. */
function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {
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

  // Session auth means writes need the double-submit CSRF token.
  if (method !== 'GET' && method !== 'HEAD') {
    const token = readCsrfToken();
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
