import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useCurrentUser } from './useAuth';

/**
 * Gates a route behind a session.
 *
 * <p>Convenience, not security. Every protected endpoint is enforced server-side; this exists
 * so a signed-out visitor sees a sign-in page instead of a screen full of failed requests. A
 * guard that only lived here would be bypassed by anyone who can open developer tools.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();

  if (isPending) {
    // Rendering the redirect while the session check is still in flight would bounce a
    // signed-in user to the login page on every hard refresh.
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    // Remembers where they were going, so signing in resumes the journey.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
