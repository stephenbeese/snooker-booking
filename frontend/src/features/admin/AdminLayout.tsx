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
 * <p>`end` wherever a path is a prefix of another item's. Without it `NavLink` matches on
 * prefix, so `/admin` would light up permanently and `/admin/bookings` lights up on the
 * telephone screen underneath it.
 */
interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
}

/**
 * The staff area's screens, in three groups.
 *
 * <p>Ten equal links in one scrolling strip gave no clue which were the day job and which were
 * configuration you touch twice a year — and on a phone the far end was off-screen with nothing
 * to say so. Grouping puts the daily work first and the club's setup behind a divider.
 */
const NAV_GROUPS: { name: string; items: NavItem[] }[] = [
  {
    name: 'Day to day',
    items: [
      { to: '/admin', label: 'Dashboard', end: true },
      // `end` here too, and for the same reason it is not only the dashboard's problem:
      // /admin/bookings is itself a prefix of /admin/bookings/telephone, so without it the
      // "New booking" screen lit this link as well as its own and the bar claimed to be in
      // two places at once.
      { to: '/admin/bookings', label: 'Bookings', end: true },
      { to: '/admin/diary', label: 'Calendar' },
      // "New booking" rather than "Telephone": the screen takes a booking for someone who is
      // not booking it themselves, whether they rang up or are stood at the counter, and the
      // old label described only half of what it is used for.
      { to: '/admin/bookings/telephone', label: 'New booking' },
    ],
  },
  {
    name: 'The club',
    items: [
      // Its own item rather than folded into Manage tables: marking a table out of service is
      // a counter job that STAFF do, while Manage tables is admin-only, so merging the two
      // would have taken a capability away from staff to tidy a label.
      { to: '/admin/maintenance', label: 'Maintenance' },
      { to: '/admin/tables', label: 'Manage tables', adminOnly: true },
      { to: '/admin/cafe', label: 'Menu items', adminOnly: true },
    ],
  },
  {
    name: 'Setup',
    items: [
      { to: '/admin/settings', label: 'Club settings', adminOnly: true },
      { to: '/admin/users', label: 'Manage staff', adminOnly: true },
    ],
  },
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
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || mayAdminister(user?.role)),
  })).filter((group) => group.items.length > 0);

  return (
    <div>
      {/* Sticks directly beneath the site header, offset by the height that header publishes as
          --header-height rather than by a number copied from it — the brand is the club's own
          name, and a long one wraps. z-30 keeps this under the header (z-40) and over the
          booking grid's sticky column (z-20). Opaque, not translucent: content scrolls
          underneath and would otherwise show through the labels. */}
      <div
        className="sticky z-30 border-b border-line bg-surface-sunken"
        style={{ top: 'var(--header-height, 3.5rem)' }}
      >
        {/* no-scrollbar: the row still scrolls on a narrow phone, but the bar itself was
            drawing across the links. The group dividers are what signal there is more to the
            right. */}
        <nav
          aria-label="Staff"
          className="no-scrollbar mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6"
        >
          {groups.map((group, index) => (
            <div key={group.name} className="flex items-center gap-1">
              {index > 0 && (
                <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-ink-300" />
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) =>
                    [
                      'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-surface font-medium text-felt-900 shadow-sm'
                        : 'text-fg-muted hover:bg-surface/70 hover:text-felt-900',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
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
