import { Link, useSearchParams } from 'react-router';
import { PageShell } from '@/components/ui/PageShell';
import { useAdminAvailability, useTableTypes } from '@/features/availability/useAvailability';
import { addDays, formatDateLong, todayIso } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { axisFor, rowFor, type DiaryCell } from './diary';
import { useAdminDay } from './useAdmin';
import type { AdminBooking } from './types';

/** Why a slot cannot be sold, in the few words a cell has room for. */
const UNAVAILABLE_TITLE: Record<string, string> = {
  MAINTENANCE: 'Maintenance',
  TABLE_INACTIVE: 'Out of service',
  PAST: 'Already passed',
  INSUFFICIENT_NOTICE: 'Too soon to book online',
  CLUB_CLOSED: 'Closed',
  BOOKED: 'Booked',
};

/**
 * The day at a glance: tables down the side, time across, bookings as blocks.
 *
 * <p>Answers the question the booking list cannot — "what does Tuesday afternoon look like" —
 * where a paged, sorted register makes you reconstruct the day in your head.
 *
 * <p>Two requests, both existing endpoints. The day's bookings say what is *taken*;
 * `/api/admin/availability` says what is *sellable*, and it is the same service the telephone
 * booking endpoint validates against — so a gap shown here is one that will actually be
 * accepted. Deriving free/busy from the bookings alone would miss maintenance, inactive tables
 * and closing hours entirely.
 */
export function AdminDiaryPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const date = searchParams.get('date') || todayIso();
  const tableType = searchParams.get('tableType');
  const tableIdParam = searchParams.get('tableId');
  const tableId = tableIdParam ? Number(tableIdParam) : undefined;

  const day = useAdminDay(date);
  const { data: tableTypes } = useTableTypes();
  // No duration: the diary reports the day rather than fitting a booking into it, and asking
  // for one would grey out every slot too short for it.
  const availability = useAdminAvailability({ date });

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    setSearchParams(next, { replace: true });
  }

  const isPending = day.isPending || availability.isPending;
  const isError = day.isError || availability.isError;

  return (
    <PageShell title="Calendar" description={formatDateLong(date)} width="lg">

      <form
        className="mt-8 rounded-card border border-ink-200 bg-white p-5 shadow-card"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="diary-date" className="block text-sm font-medium text-felt-900">
              Date
            </label>
            <input
              id="diary-date"
              type="date"
              value={date}
              onChange={(event) => update({ date: event.target.value || null })}
              className="mt-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm text-felt-900"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update({ date: addDays(date, -1) })}
              className="rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-felt-900 hover:bg-ink-50"
            >
              ‹ Previous
            </button>
            <button
              type="button"
              onClick={() => update({ date: null })}
              className="rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-felt-900 hover:bg-ink-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => update({ date: addDays(date, 1) })}
              className="rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-felt-900 hover:bg-ink-50"
            >
              Next ›
            </button>
          </div>

          <div>
            <label htmlFor="diary-type" className="block text-sm font-medium text-felt-900">
              Table type
            </label>
            <select
              id="diary-type"
              value={tableType ?? ''}
              onChange={(event) => update({ tableType: event.target.value || null })}
              className="mt-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm text-felt-900"
            >
              <option value="">All types</option>
              {(tableTypes ?? []).map((type) => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="diary-table" className="block text-sm font-medium text-felt-900">
              Table
            </label>
            <select
              id="diary-table"
              value={tableIdParam ?? ''}
              onChange={(event) => update({ tableId: event.target.value || null })}
              className="mt-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm text-felt-900"
            >
              <option value="">All tables</option>
              {(availability.data?.tables ?? []).map((table) => (
                <option key={table.tableId} value={table.tableId}>
                  {table.tableName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      {isPending && <p className="mt-8 text-sm text-ink-500">Loading the day…</p>}

      {isError && (
        <p role="alert" className="mt-8 rounded-card bg-rose-50 p-4 text-sm text-rose-900">
          Could not load the diary for this date. Try again.
        </p>
      )}

      {!isPending && !isError && availability.data && (
        <DiaryGrid
          availability={availability.data}
          bookings={day.data ?? []}
          tableType={tableType}
          tableId={tableId}
        />
      )}
    </PageShell>
  );
}

function DiaryGrid({
  availability,
  bookings,
  tableType,
  tableId,
}: {
  availability: NonNullable<ReturnType<typeof useAdminAvailability>['data']>;
  bookings: AdminBooking[];
  tableType: string | null;
  tableId: number | undefined;
}) {
  const axis = axisFor(availability);

  const tables = availability.tables.filter(
    (table) =>
      (!tableType || table.tableType === tableType) &&
      (tableId === undefined || table.tableId === tableId),
  );

  if (axis.length === 0) {
    return (
      <div
        role="status"
        className="mt-8 rounded-card border border-dashed border-ink-300 bg-ink-50 p-10 text-center"
      >
        <p className="font-medium text-ink-700">The club is closed on this day.</p>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div
        role="status"
        className="mt-8 rounded-card border border-dashed border-ink-300 bg-ink-50 p-10 text-center"
      >
        <p className="font-medium text-ink-700">No tables match this filter.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <Legend />

      {/* Horizontal scroll on the wrapper, so the page body never scrolls sideways on a
          phone — the same arrangement as the booking grid. */}
      <div className="overflow-x-auto rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <table className="w-full border-separate border-spacing-1">
          <caption className="sr-only">
            Bookings for {availability.date}, times in {availability.timezone}
          </caption>
          <thead>
            <tr>
              {/* z-30: the corner is where the sticky row and column cross and must outrank
                  both, or a scrolling time slides over it. */}
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 bg-white pr-2 text-left shadow-[4px_0_0_0_white]"
              >
                <span className="sr-only">Table</span>
              </th>
              {axis.map((time) => (
                <th
                  key={time}
                  scope="col"
                  className="sticky top-0 z-10 min-w-16 bg-white pb-1 text-center text-xs font-normal tabular-nums text-ink-500"
                >
                  {time}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tables.map((table) => {
              const slotsByTime = new Map(
                table.slots.map((slot) => [
                  slot.startTime.slice(0, 5),
                  { available: slot.available, reason: slot.reason },
                ]),
              );
              const cells = rowFor(
                bookings.filter((booking) => booking.tableId === table.tableId),
                axis,
                availability.incrementMinutes,
                slotsByTime,
              );

              return (
                <tr key={table.tableId}>
                  {/* z-20 beats the time headers' z-10 so a table name is never overprinted.
                      The white box-shadow paints the border-spacing gutter to its right,
                      which would otherwise let cells scroll visibly through the seam. */}
                  <th
                    scope="row"
                    className="sticky left-0 z-20 min-w-32 bg-white pr-3 text-left align-middle shadow-[4px_0_0_0_white]"
                  >
                    <span className="block text-sm font-medium text-felt-900">
                      {table.tableName}
                    </span>
                    {!table.tableActive && (
                      <span className="block text-xs text-ink-500">out of service</span>
                    )}
                  </th>
                  {cells.map((cell, index) => (
                    <Cell key={`${table.tableId}-${axis[index]}`} cell={cell} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One cell. A booking renders as a link spanning its slots; everything else is a coloured
 * box.
 *
 * <p>Cells covered by a block earlier in the row render nothing at all — the block's own
 * `colSpan` already occupies them, and emitting a `<td>` too would push the rest of the row
 * out of line with the header.
 */
function Cell({ cell }: { cell: DiaryCell }) {
  if (cell.kind === 'covered') {
    return null;
  }

  if (cell.kind === 'block') {
    const { booking, span } = cell.block;
    return (
      <td colSpan={span} className="p-0">
        <Link
          to={`/admin/bookings/${encodeURIComponent(booking.reference)}`}
          className={`flex h-14 flex-col justify-center overflow-hidden rounded-md px-2 text-left ${
            booking.status === 'PENDING_PAYMENT'
              ? 'bg-amber-100 hover:bg-amber-200'
              : 'bg-felt-100 hover:bg-felt-200'
          }`}
          title={`${booking.customerName} — ${booking.startTime.slice(0, 5)}, ${formatPence(booking.pricePence)}`}
        >
          <span className="truncate text-xs font-semibold text-felt-900">
            {booking.customerName}
          </span>
          <span className="truncate text-[11px] text-ink-600">
            {booking.reference}
            {booking.source === 'TELEPHONE' && ' · phone'}
          </span>
          {booking.payableAtCounter && (
            <span className="truncate text-[11px] font-semibold text-amber-900">
              {formatPence(booking.amountOutstandingPence)} due
            </span>
          )}
        </Link>
      </td>
    );
  }

  if (cell.kind === 'free') {
    return (
      <td className="p-0">
        <div className="h-14 rounded-md bg-white ring-1 ring-inset ring-ink-200" title="Free" />
      </td>
    );
  }

  const label = cell.reason ? (UNAVAILABLE_TITLE[cell.reason] ?? 'Unavailable') : 'Unavailable';
  return (
    <td className="p-0">
      <div className="h-14 rounded-md bg-ink-100" title={label}>
        <span className="sr-only">{label}</span>
      </div>
    </td>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-600">
      <LegendItem className="bg-felt-100">Booked</LegendItem>
      <LegendItem className="bg-amber-100">Awaiting payment</LegendItem>
      <LegendItem className="bg-white ring-1 ring-inset ring-ink-200">Free</LegendItem>
      <LegendItem className="bg-ink-100">Unavailable</LegendItem>
    </ul>
  );
}

function LegendItem({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-5 rounded ${className}`} aria-hidden="true" />
      {children}
    </li>
  );
}
