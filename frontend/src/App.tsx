import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ToastProvider } from './components/ui/Toast';
import { queryClient } from './app/queryClient';
import { router } from './app/router';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Outside the router, so a toast raised just before a navigation survives it. Inside,
          it would unmount with the route that raised it and never be read. */}
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
