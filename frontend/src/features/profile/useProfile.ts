import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { User } from '@/features/auth/types';
import {
  changePassword,
  requestPasswordReset,
  resetPassword,
  updateProfile,
  type ChangePasswordRequest,
  type UpdateProfileRequest,
} from './api';

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateProfileRequest) => updateProfile(request),
    onSuccess: (user: User) => {
      // The header greets the user by first name, so a stale copy would keep showing the old
      // one until the next reload.
      queryClient.setQueryData(queryKeys.currentUser(), user);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (request: ChangePasswordRequest) => changePassword(request),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => requestPasswordReset(email),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, newPassword }: { token: string; newPassword: string }) =>
      resetPassword(token, newPassword),
  });
}
