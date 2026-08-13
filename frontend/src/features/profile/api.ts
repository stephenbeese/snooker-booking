import { apiRequest } from '@/lib/apiClient';
import type { User } from '@/features/auth/types';

export interface UpdateProfileRequest {
  firstName: string;
  lastName: string;
  phone: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export function fetchProfile(): Promise<User> {
  return apiRequest<User>('/api/profile');
}

export function updateProfile(request: UpdateProfileRequest): Promise<User> {
  return apiRequest<User>('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(request),
  });
}

/** Signs the user out of their other devices. Returns 204, so nothing to parse. */
export function changePassword(request: ChangePasswordRequest): Promise<void> {
  return apiRequest<void>('/api/profile/password', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/** Always resolves, whether or not the address is registered — see the backend. */
export function requestPasswordReset(email: string): Promise<void> {
  return apiRequest<void>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}
