import { Link, NavLink, Outlet } from 'react-router';
import { Button } from '@/components/ui/Button';
import { useCurrentUser, useLogout } from '@/features/auth/useAuth';

export function AppLayout() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3"
        >
          <Link to="/book" className="text-base font-semibold text-felt-900">
            Snooker Club
          </Link>

          <div className="flex items-center gap-4 text-sm">
            <NavItem to="/book">Book</NavItem>
            {user && <NavItem to="/bookings">My bookings</NavItem>}
          </div>

          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="text-gray-600">{user.firstName}</span>
                <Button
                  variant="secondary"
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="font-medium text-felt-700 underline">
                  Sign in
                </Link>
                <Link to="/register" className="font-medium text-felt-700 underline">
                  Create account
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <Outlet />
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive ? 'font-medium text-felt-900 underline' : 'text-gray-600 hover:text-felt-900'
      }
    >
      {children}
    </NavLink>
  );
}
