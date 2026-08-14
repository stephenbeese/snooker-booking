import { NavLink, Outlet } from 'react-router';
import { isAdmin, type Role } from '@/features/auth/types';
import { useCurrentUser } from '@/features/auth/useAuth';

/**
 * One nav item, and who may see it.
 *
 * <p>`adminOnly` mirrors the route guard exactly. A link that a STAFF member can see but not
 * follow is worse than no link: it teaches them the screen exists and then refuses them, every
 * time, for a permission they cannot grant themselves.
 *
 * <p>`end` for the dashboard alone, because every other admin path begins with `/admin` and
 * would otherwise light it up permanently.
 */
const NAV: { to: string; label: string; end?: boolean; adminOnly?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/bookings', label: 'Bookings' },
  { to: '/admin/bookings/telephone', label: 'Telephone' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/maintenance', label: 'Maintenance' },
  { to: '/admin/tables', label: 'Tables', adminOnly: true },
  { to: '/admin/settings', label: 'Settings', adminOnly: true },
  { to: '/admin/users', label: 'Staff accounts', adminOnly: true },
];

/**
 * The staff area's frame.
 *
 * <p>Every admin screen used to end in its own dead end — the dashboard was the only hub, and
 * Tables, Maintenance, Telephone and Settings had no navigation at all, so the only way between
 * them was the browser's back button. This carries one bar across all of them.
 *
 * <p>A layout route rather than a component each page imports: as an import it would be one more
 * thing to remember on every new admin screen, and the screen that forgot it would be the one
 * with no way out.
 *
 * <p>Renders nothing about access itself. `RequireStaff` and `RequireAdmin` still wrap the routes
 * inside, and the server still decides — this only chooses which links to draw.
 */
export function AdminLayout() {
  const { data: user } = useCurrentUser();
  const visible = NAV.filter((item) => !item.adminOnly || mayAdminister(user?.role));

  return (
    <div>
      <div className="border-b border-ink-200 bg-ink-50">
        <nav
          aria-label="Staff"
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6"
        >
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-white font-medium text-felt-900 shadow-sm'
                    : 'text-ink-600 hover:bg-white/70 hover:text-felt-900',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}

/**
 * Whether to draw the admin-only links.
 *
 * <p>False while the user is still loading, so the bar never flashes links that are about to
 * disappear — and false is the safe direction to be wrong in for one render.
 */
function mayAdminister(role: Role | undefined): boolean {
  return role !== undefined && isAdmin(role);
}
