import { Link } from 'react-router';
import { PageShell } from '@/components/ui/PageShell';
import { useTableTypeLabel } from '@/features/availability/useAvailability';
import { formatSlotTime, todayIso } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { StatusBadge } from './components/StatusBadge';
import { useAdminDashboard, useAdminDay } from './useAdmin';
import type { AdminBooking } from './types';

export function AdminDashboardPage() {
  const { data: dashboard, isPending, isError, error } = useAdminDashboard();
  const { data: today } = useAdminDay(todayIso());

  return (
    <PageShell
      title="Today at a glance"
      description={dashboard ? formatFullDate(dashboard.date) : 'Loading the club’s figures…'}
      actions={
        /* Just the one action. The five links that used to sit here are AdminLayout's nav now,
           and two of them — Tables and Settings — were shown to STAFF, who are refused both.
           Taking a booking is the thing someone opens this screen wanting to do. */
        <Link
          to="/admin/bookings/telephone"
          className="rounded-xl bg-felt-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-felt-800"
        >
          Telephone booking
        </Link>
      }
    >

      {isError && (
        <div role="alert" className="mt-8 rounded-card border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-800">{error.message}</p>
        </div>
      )}

      {isPending && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-card bg-ink-100" />
          ))}
        </div>
      )}

      {dashboard && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Booked today" value={String(dashboard.bookedToday)} />
            <Stat label="Still to come" value={String(dashboard.stillToCome)} />
            <Stat
              label="Expected takings"
              value={formatPence(dashboard.expectedRevenuePence)}
              hint="Confirmed and completed only"
            />
            <Stat
              label="Awaiting payment"
              value={String(dashboard.awaitingPayment)}
              hint="Holds still counting down"
              tone={dashboard.awaitingPayment > 0 ? 'warn' : 'plain'}
            />
          </div>

          {/* Only rendered when there is something to act on: a permanent "0 problems" panel
              trains staff to ignore the space where problems appear. */}
          {dashboard.paymentExceptions > 0 && (
            <div
              role="alert"
              className="mt-4 rounded-card border border-amber-300 bg-amber-50 p-4"
            >
              <p className="font-medium text-amber-900">
                {dashboard.paymentExceptions === 1
                  ? '1 payment needs a decision'
                  : `${dashboard.paymentExceptions} payments need a decision`}
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Money was taken for a booking that was cancelled or lost its slot. Refunds are
                never issued automatically — someone at the club has to choose.
              </p>
            </div>
          )}

          {dashboard.cancelledToday > 0 && (
            <p className="mt-4 text-sm text-ink-600">
              {dashboard.cancelledToday === 1
                ? '1 booking was cancelled today.'
                : `${dashboard.cancelledToday} bookings were cancelled today.`}
            </p>
          )}
        </>
      )}

      <section className="mt-12">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-500">
          Today’s diary
          <span className="ml-2 text-ink-400">{today?.length ?? 0}</span>
        </h2>

        {today && today.length === 0 && (
          <p className="mt-3 rounded-card border border-dashed border-ink-300 bg-ink-50 p-8 text-center text-sm text-ink-600">
            Nothing booked today.
          </p>
        )}

        {today && today.length > 0 && (
          <ul className="mt-3 space-y-2">
            {today.map((booking) => (
              <DiaryRow key={booking.reference} booking={booking} />
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'plain' | 'warn';
}) {
  return (
    <div
      className={`rounded-card border p-5 shadow-card ${
        tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'border-ink-200 bg-white'
      }`}
    >
      <p className="text-sm text-ink-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-felt-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function DiaryRow({ booking }: { booking: AdminBooking }) {
  const typeLabel = useTableTypeLabel();

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-ink-200 bg-white px-4 py-3 shadow-card">
      <span className="w-28 font-mono text-sm text-felt-900">
        {formatSlotTime(booking.startTime)}–{formatSlotTime(booking.endTime)}
      </span>
      <span className="font-medium text-felt-900">
        {booking.tableName}
        <span className="ml-2 text-xs font-normal text-fg-muted">
          {typeLabel(booking.tableType)}
        </span>
      </span>
      <span className="text-sm text-ink-600">{booking.customerName}</span>
      <span className="ml-auto flex items-center gap-3">
        <StatusBadge status={booking.status} />
        <Link
          to={`/admin/bookings/${booking.reference}`}
          className="font-mono text-xs text-felt-700 underline underline-offset-2 hover:text-felt-900"
        >
          {booking.reference}
        </Link>
      </span>
    </li>
  );
}

function formatFullDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
