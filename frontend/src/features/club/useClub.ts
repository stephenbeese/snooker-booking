import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchClub } from './api';

/**
 * Club identity, opening hours and headline pricing.
 *
 * <p>Long {@code staleTime}: these change when an admin edits them, which is roughly
 * never in a browsing session, and the header and footer mount on every page. Refetching
 * per navigation would be a request per page view for data that has not moved.
 */
export function useClub() {
  return useQuery({
    queryKey: queryKeys.club(),
    queryFn: fetchClub,
    staleTime: 5 * 60_000,
  });
}
