import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchCurrentUser, login, logout, register } from './api';
import type { LoginRequest, RegisterRequest, User } from './types';

/**
 * The signed-in user.
 *
 * <p>The session lives in an HttpOnly cookie the JavaScript cannot read, so the server is the
 * only authority on who is signed in. This query is that answer, cached — deliberately not a
 * copy of the user in localStorage, which would go stale the moment the session expired and
 * would show a signed-in UI to someone the API rejects.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser(),
    queryFn: fetchCurrentUser,
    // The session can be invalidated server-side at any time; a long cache would leave the UI
    // confidently wrong. Cheap query, so re-checking is fine.
    staleTime: 30_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: LoginRequest) => login(request),
    onSuccess: (user: User) => {
      // Seed rather than invalidate: the response already contains the user, so an immediate
      // refetch would be a wasted round trip on the most latency-sensitive screen.
      queryClient.setQueryData(queryKeys.currentUser(), user);
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (request: RegisterRequest) => register(request),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.setQueryData(queryKeys.currentUser(), null);
      // Everything else may contain the previous user's data — most obviously their bookings.
      // Clearing on sign-out prevents the next user on a shared machine seeing them.
      await queryClient.resetQueries();
    },
  });
}
