import { createBrowserRouter } from 'react-router';
import { BookPage } from '@/features/availability/BookPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { BookingPage } from '@/features/booking/BookingPage';
import { MyBookingsPage } from '@/features/booking/MyBookingsPage';
import { BackendStatus } from '@/features/health/BackendStatus';
import { HomePage } from '@/features/home/HomePage';
import { AppLayout } from './AppLayout';

/**
 * Declarative (SPA) mode. Deliberately not React Router's framework mode: data fetching
 * belongs to TanStack Query, so route loaders would duplicate caching.
 */
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/book', element: <BookPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      {
        path: '/bookings',
        element: (
          <RequireAuth>
            <MyBookingsPage />
          </RequireAuth>
        ),
      },
      {
        // Reached on return from Stripe, so it must survive a full page load with no client
        // state — everything it needs comes from the reference in the URL.
        path: '/bookings/:reference',
        element: (
          <RequireAuth>
            <BookingPage />
          </RequireAuth>
        ),
      },
      {
        path: '/status',
        // A section, not a <main>: AppLayout already provides the page's single main
        // landmark, and nesting a second one breaks landmark navigation.
        element: (
          <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
            <h1 className="text-xl font-semibold tracking-tight text-felt-900">System status</h1>
            <div className="mt-4 rounded-card border border-ink-200 p-4 shadow-card">
              <BackendStatus />
            </div>
          </section>
        ),
      },
    ],
  },
]);
