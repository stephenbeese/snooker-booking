import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/Button';
import { useCurrentUser, useLogout } from '@/features/auth/useAuth';
import { useClub } from '@/features/club/useClub';
import { Logo } from './Logo';

export function AppLayout() {
  const { data: user } = useCurrentUser();
  const { data: club } = useClub();
  const logout = useLogout();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Without this the menu stays open over the page it just navigated to, which reads as
  // a broken link on a phone.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Skip link: the first thing a keyboard user reaches, and the only way past the
          nav without tabbing through every item on every page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-felt-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/85 backdrop-blur-md">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6"
        >
          <Link
            to="/"
            className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-felt-900"
          >
            <Logo className="h-7 w-7" />
            <span>{club?.name ?? 'Snooker Club'}</span>
          </Link>

          <div className="ml-auto hidden items-center gap-1 sm:flex">
            <NavItem to="/book">Book a table</NavItem>
            {user && <NavItem to="/bookings">My bookings</NavItem>}
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            {user ? (
              <>
                <Link
                  to="/profile"
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-felt-900"
                >
                  {user.firstName}
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-felt-800 transition-colors hover:bg-felt-50"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-felt-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-felt-800"
                >
                  Create account
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="ml-auto rounded-lg p-2 text-felt-900 transition-colors hover:bg-felt-50 sm:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-5 w-5"
            >
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" />
              )}
            </svg>
          </button>
        </nav>

        {menuOpen && (
          <div id="mobile-menu" className="border-t border-ink-200 bg-white px-4 py-3 sm:hidden">
            <div className="flex flex-col gap-1">
              <NavItem to="/book">Book a table</NavItem>
              {user && <NavItem to="/bookings">My bookings</NavItem>}
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-ink-200 pt-3">
              {user ? (
                <>
                  <Link
                    to="/profile"
                    className="rounded-lg px-3 py-2 text-sm font-medium text-felt-800 hover:bg-felt-50"
                  >
                    Your account
                  </Link>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => logout.mutate()}
                    disabled={logout.isPending}
                  >
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="rounded-lg px-3 py-2 text-sm font-medium text-felt-800 hover:bg-felt-50"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    className="rounded-lg bg-felt-700 px-3 py-2 text-center text-sm font-medium text-white"
                  >
                    Create account
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <SiteFooter clubName={club?.name ?? 'Snooker Club'} contact={club?.contact} />
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'rounded-lg px-3 py-1.5 text-sm transition-colors',
          isActive
            ? 'bg-felt-50 font-medium text-felt-900'
            : 'text-ink-600 hover:bg-ink-50 hover:text-felt-900',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  );
}

function SiteFooter({
  clubName,
  contact,
}: {
  clubName: string;
  contact: { addressLine1: string | null; city: string | null; postcode: string | null; phone: string | null; email: string | null } | undefined;
}) {
  return (
    <footer className="mt-16 border-t border-ink-200 bg-ink-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-6" />
            <span className="font-semibold tracking-tight text-felt-900">{clubName}</span>
          </div>
          {contact && (
            <address className="mt-3 text-sm not-italic leading-relaxed text-ink-600">
              {contact.addressLine1 && <div>{contact.addressLine1}</div>}
              <div>{[contact.city, contact.postcode].filter(Boolean).join(', ')}</div>
            </address>
          )}
        </div>

        {contact && (
          <div className="text-sm text-ink-600">
            <h2 className="font-medium text-felt-900">Get in touch</h2>
            <ul className="mt-3 space-y-1.5">
              {contact.phone && (
                <li>
                  <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="hover:text-felt-800">
                    {contact.phone}
                  </a>
                </li>
              )}
              {contact.email && (
                <li>
                  <a href={`mailto:${contact.email}`} className="hover:text-felt-800">
                    {contact.email}
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </footer>
  );
}
