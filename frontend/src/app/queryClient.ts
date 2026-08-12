import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/apiError';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Retrying a 4xx just delays showing the user a real error.
        if (error instanceof ApiError && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
