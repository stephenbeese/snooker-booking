import { apiRequest } from '@/lib/apiClient';
import type { LoginRequest, RegisterRequest, User } from './types';

/**
 * The current user, or null when signed out.
 *
 * <p>The backend answers 204 rather than 401 for an anonymous caller, so "not signed in" is an
 * ordinary answer the app boots with, not an error the query layer has to special-case.
 */
export async function fetchCurrentUser(): Promise<User | null> {
  const user = await apiRequest<User | undefined>('/api/auth/me');
  return user ?? null;
}

export function login(request: LoginRequest): Promise<User> {
  return apiRequest<User>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function register(request: RegisterRequest): Promise<User> {
  return apiRequest<User>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function logout(): Promise<void> {
  return apiRequest<void>('/api/auth/logout', { method: 'POST' });
}
