import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * What each route is called. Static routes are matched exactly; the rest fall through to the
 * prefix list below, so a booking reference or a table id does not need its own entry.
 */
const EXACT: Record<string, string> = {
  '/': 'Home',
  '/book': 'Book a table',
  // "Menu" for customers; the admin screen that manages it keeps "Cafe & bar", since it covers
  // more than the public list.
  '/menu': 'Menu',
  '/login': 'Sign in',
  '/register': 'Create an account',
  '/forgot-password': 'Reset your password',
  '/reset-password': 'Choose a new password',
  '/profile': 'Your profile',
  '/bookings': 'Your bookings',
  '/admin': 'Staff dashboard',
  '/admin/bookings': 'All bookings',
  '/admin/bookings/telephone': 'Telephone booking',
  '/admin/tables': 'Tables',
  '/admin/maintenance': 'Maintenance',
  '/admin/settings': 'Settings',
};

/** Longest prefix wins, so /admin/bookings/SNK-1 is "Booking" rather than "All bookings". */
const PREFIXES: [string, string][] = [
  ['/admin/bookings/', 'Booking'],
  ['/bookings/', 'Your booking'],
];

function titleFor(pathname: string): string {
  const exact = EXACT[pathname];
  if (exact) return exact;

  const prefix = PREFIXES.filter(([path]) => pathname.startsWith(path)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return prefix ? prefix[1] : 'Snooker Club';
}

/**
 * Keeps the document title in step with the route.
 *
 * <p>An SPA does not change its title on navigation unless told to. Left alone, every page
 * announces the same thing: a screen-reader user hears no confirmation that navigation
 * happened at all, every entry in the browser's history list is identical, and a user with
 * several tabs open cannot tell them apart. It is a small amount of code for something that
 * makes the app navigable rather than merely usable.
 */
export function useDocumentTitle(clubName: string | undefined) {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = titleFor(pathname);
    const club = clubName ?? 'Snooker Club';
    // Page first: browser tabs truncate from the right, and the page is what distinguishes
    // one tab from another.
    document.title = page === 'Home' ? club : `${page} — ${club}`;
  }, [pathname, clubName]);
}
