import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchMenu } from './api';

/**
 * The public cafe and bar menu.
 *
 * <p>Long `staleTime`, for the same reason as `useClub`: the menu changes when an admin edits it,
 * which is roughly never during a browsing session. An admin's own edit does not wait on it — the
 * admin mutations invalidate `['admin','cafe','items']`, and this key is separate precisely so
 * that a customer's cached menu and the staff editor cannot serve each other's data.
 */
export function useMenu() {
  return useQuery({
    queryKey: queryKeys.menu(),
    queryFn: fetchMenu,
    staleTime: 5 * 60_000,
  });
}
