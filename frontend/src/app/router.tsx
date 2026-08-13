import { createBrowserRouter } from 'react-router';
import { AdminBookingDetailPage } from '@/features/admin/AdminBookingDetailPage';
import { AdminBookingsPage } from '@/features/admin/AdminBookingsPage';
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage';
import { AdminMaintenancePage } from '@/features/admin/AdminMaintenancePage';
import { AdminTablesPage } from '@/features/admin/AdminTablesPage';
import { AdminTelephoneBookingPage } from '@/features/admin/AdminTelephoneBookingPage';
import { RequireAdmin } from '@/features/admin/RequireAdmin';
import { BookPage } from '@/features/availability/BookPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { BookingPage } from '@/features/booking/BookingPage';
import { MyBookingsPage } from '@/features/booking/MyBookingsPage';
import { BackendStatus } from '@/features/health/BackendStatus';
import { HomePage } from '@/features/home/HomePage';
import { ForgotPasswordPage } from '@/features/profile/ForgotPasswordPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { ResetPasswordPage } from '@/features/profile/ResetPasswordPage';
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
      // Public by necessity: someone who has lost their password has no session.
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        path: '/profile',
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        ),
      },
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
      // Staff area. RequireAdmin decides what renders; the server decides what is allowed —
      // every /api/admin/** endpoint is role-gated independently of anything here.
      {
        path: '/admin',
        element: (
          <RequireAdmin>
            <AdminDashboardPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/bookings',
        element: (
          <RequireAdmin>
            <AdminBookingsPage />
          </RequireAdmin>
        ),
      },
      {
        // Before the /:reference route: "telephone" would otherwise be captured as a booking
        // reference and send staff to a 404 for a booking that was never meant to exist.
        path: '/admin/bookings/telephone',
        element: (
          <RequireAdmin>
            <AdminTelephoneBookingPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/bookings/:reference',
        element: (
          <RequireAdmin>
            <AdminBookingDetailPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/tables',
        element: (
          <RequireAdmin>
            <AdminTablesPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/maintenance',
        element: (
          <RequireAdmin>
            <AdminMaintenancePage />
          </RequireAdmin>
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
