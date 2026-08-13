import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useCurrentUser } from '@/features/auth/useAuth';

/**
 * Gates a route behind the ADMIN role.
 *
 * <p>Convenience, not security — exactly as `RequireAuth` is. Every `/api/admin/**` endpoint is
 * gated server-side by Spring Security and covered by `AuthorizationBoundaryIT`; this component
 * only decides what a browser renders. Anyone can edit `user.role` in memory and reach these
 * pages, and they will get a screen of 403s, which is the correct outcome.
 *
 * <p>A signed-in customer is shown a plain "not for you" rather than being redirected to the
 * login page: they are already signed in, so a login form would invite them to try credentials
 * that cannot fix anything.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-ink-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (user.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-felt-900">
          Staff only
        </h1>
        <p className="mt-3 text-sm text-ink-600">
          This part of the site is for club staff. If you think you should have access, speak to
          the club.
        </p>
        <Link
          to="/bookings"
          className="mt-6 inline-flex rounded-xl bg-felt-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-felt-800"
        >
          Go to my bookings
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
