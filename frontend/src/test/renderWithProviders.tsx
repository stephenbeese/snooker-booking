import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * Each test gets a fresh QueryClient with retries off, so a deliberate error case
 * fails once instead of retrying and timing out.
 *
 * <p>The ToastProvider is mounted here to mirror App.tsx: `useToast` throws without one, so
 * a component that raises a confirmation would fail in tests for a reason that has nothing to
 * do with what the test is checking.
 */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const queryClient = newQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}

/**
 * Renders a component that uses router hooks (Link, useNavigate, useParams).
 *
 * <p>A memory router rather than a browser one: jsdom's history is shared across tests in a
 * file, so one test's navigation would leak into the next.
 */
export function renderWithRouter(
  ui: ReactElement,
  { route = '/', path = '/' }: { route?: string; path?: string } = {},
) {
  const queryClient = newQueryClient();
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [route] });

  return {
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}
