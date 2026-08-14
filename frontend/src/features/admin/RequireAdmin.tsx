import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { isAdmin, isStaff, type Role } from '@/features/auth/types';
import { useCurrentUser } from '@/features/auth/useAuth';

/**
 * Gates a route behind a role.
 *
 * <p>Convenience, not security — exactly as `RequireAuth` is. Every `/api/admin/**` endpoint is
 * gated server-side by Spring Security and covered by `AuthorizationBoundaryIT`; this component
 * only decides what a browser renders. Anyone can edit `user.role` in memory and reach these
 * pages, and they will get a screen of 403s, which is the correct outcome.
 *
 * <p>A signed-in person who lacks the role is shown a plain "not for you" rather than being
 * redirected to the login page: they are already signed in, so a login form would invite them
 * to try credentials that cannot fix anything.
 */
function RequireRole({
  children,
  allows,
  title,
  explanation,
}: {
  children: ReactNode;
  allows: (role: Role) => boolean;
  title: string;
  explanation: string;
}) {
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

  if (!allows(user.role)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-felt-900">{title}</h1>
        <p className="mt-3 text-sm text-ink-600">{explanation}</p>
        <Link
          to={isStaff(user.role) ? '/admin' : '/bookings'}
          className="mt-6 inline-flex rounded-xl bg-felt-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-felt-800"
        >
          {isStaff(user.role) ? 'Back to the dashboard' : 'Go to my bookings'}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * The day job: bookings, the telephone grid, maintenance. STAFF and ADMIN both reach these.
 *
 * <p>Named for what it gates rather than for the ADMIN role it used to check. It was
 * `RequireAdmin`, and every route it wrapped was really asking "does this person work here" —
 * leaving the old name would have meant STAFF being refused the screens the role exists for.
 */
export function RequireStaff({ children }: { children: ReactNode }) {
  return (
    <RequireRole
      allows={isStaff}
      title="Staff only"
      explanation="This part of the site is for club staff. If you think you should have access, speak to the club."
    >
      {children}
    </RequireRole>
  );
}

/**
 * Configuring the club, and deciding who may do so.
 *
 * <p>The wording matters: a STAFF member reaching this is not an intruder, they are a colleague
 * who clicked the wrong link, so it says what the restriction is rather than accusing them.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  return (
    <RequireRole
      allows={isAdmin}
      title="Managers only"
      explanation="Changing the club's settings, tables, pricing and staff accounts is limited to managers."
    >
      {children}
    </RequireRole>
  );
}
