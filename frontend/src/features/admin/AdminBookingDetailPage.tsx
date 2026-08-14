import { Link, useParams } from 'react-router';
import { PageShell } from '@/components/ui/PageShell';
import { BookingDetail } from './components/BookingDetail';

/**
 * One booking on its own page.
 *
 * <p>Now only the frame: the record itself is `BookingDetail`, which the diary also renders
 * inside a modal. This route stays because a booking needs an address — deep links, refreshes
 * and bookmarks all land here, and the modal is an addition rather than a replacement.
 */
export function AdminBookingDetailPage() {
  const { reference = '' } = useParams();

  return (
    <Shell>
      <BookingDetail reference={reference} />
    </Shell>
  );
}

/**
 * The page frame, kept as a local wrapper because every state — loading, error and loaded —
 * needs the same heading and the same way back. Built on PageShell so the width and padding
 * come from the same place as everywhere else rather than being chosen again here.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PageShell width="detail">
      {/* "Booking" stays a small eyebrow rather than becoming the page's large heading: the
          record's own heading below is the table and time, and two big headings stacked would
          leave neither reading as the subject. */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-sm font-medium uppercase tracking-wide text-ink-500">Booking</h1>
        <Link
          to="/admin/bookings"
          className="text-sm font-medium text-felt-700 underline underline-offset-2 hover:text-felt-900"
        >
          Back to bookings
        </Link>
      </div>
      <div className="mt-6">{children}</div>
    </PageShell>
  );
}
