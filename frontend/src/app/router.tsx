import { createBrowserRouter, Navigate } from 'react-router';
import { BookPage } from '@/features/availability/BookPage';
import { BackendStatus } from '@/features/health/BackendStatus';

/**
 * Declarative (SPA) mode. Deliberately not React Router's framework mode: data fetching
 * belongs to TanStack Query, so route loaders would duplicate caching.
 */
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/book" replace /> },
  { path: '/book', element: <BookPage /> },
  {
    path: '/status',
    element: (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-xl font-semibold text-felt-900">System status</h1>
        <div className="mt-4 rounded-lg border border-gray-200 p-4">
          <BackendStatus />
        </div>
      </main>
    ),
  },
]);
