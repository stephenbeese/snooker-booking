import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BookingStatus } from '@/features/booking/types';
import { formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { PaymentBadge } from './components/PaymentBadge';
import { StatusBadge, STATUS_LABEL } from './components/StatusBadge';
import { useAdminBookings, useTables } from './useAdmin';
import type { AdminBookingFilters } from './types';

const STATUSES: BookingStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
];

const PAGE_SIZE = 25;

/**
 * The booking register.
 *
 * <p>Filter state lives in the URL, not in component state. A staff member who has narrowed
 * down to "cancelled, last week, table 3" can then send that link to a colleague, and it
 * survives a refresh — neither of which is true of `useState`.
 */
export function AdminBookingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: tables } = useTables();

  const filters = filtersFromParams(searchParams);
  const { data, isPending, isError, error, isPlaceholderData } = useAdminBookings(filters);

  // The text box is local so typing does not fire a request per keystroke; it is pushed into
  // the URL on submit. Seeded from the URL so a shared link shows its own search term.
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  useEffect(() => setSearchInput(filters.search ?? ''), [filters.search]);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    // Any change to a filter invalidates the page number: staying on page 4 of a result set
    // that now has one page shows an empty table and looks like "no results".
    if (!('page' in changes)) {
      next.delete('page');
    }
    setSearchParams(next, { replace: true });
  }

  function toggleStatus(status: BookingStatus) {
    const current = new Set(filters.status ?? []);
    if (current.has(status)) {
      current.delete(status);
    } else {
      current.add(status);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('status');
    current.forEach((value) => next.append('status', value));
    next.delete('page');
    setSearchParams(next, { replace: true });
  }

  const page = filters.page ?? 0;
  const totalPages = data?.totalPages ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-felt-900">Bookings</h1>
        <Link
          to="/admin"
          className="text-sm font-medium text-felt-700 underline underline-offset-2 hover:text-felt-900"
        >
          Back to dashboard
        </Link>
      </div>

      <form
        className="mt-8 rounded-card border border-ink-200 bg-white p-5 shadow-card"
        onSubmit={(event) => {
          event.preventDefault();
          update({ search: searchInput.trim() || null });
        }}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[16rem] flex-1">
            <label
              htmlFor="admin-search"
              className="block text-sm font-medium text-felt-900"
            >
              Search
            </label>
            <input
              id="admin-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Reference, name or email"
              className="mt-1.5 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm text-felt-900 placeholder:text-ink-400"
            />
          </div>

          <div>
            <label htmlFor="admin-from" className="block text-sm font-medium text-felt-900">
              From
            </label>
            <input
              id="admin-from"
              type="date"
              value={filters.from ?? ''}
              onChange={(event) => update({ from: event.target.value || null })}
              className="mt-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm text-felt-900"
            />
          </div>

          <div>
            <label htmlFor="admin-to" className="block text-sm font-medium text-felt-900">
              To
            </label>
            <input
              id="admin-to"
              type="date"
              value={filters.to ?? ''}
              onChange={(event) => update({ to: event.target.value || null })}
              className="mt-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm text-felt-900"
            />
          </div>

          <div>
            <label htmlFor="admin-table" className="block text-sm font-medium text-felt-900">
              Table
            </label>
            <select
              id="admin-table"
              value={filters.tableId ?? ''}
              onChange={(event) => update({ tableId: event.target.value || null })}
              className="mt-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm text-felt-900"
            >
              <option value="">Any table</option>
              {tables?.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                  {table.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-felt-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-felt-800"
          >
            Search
          </button>
        </div>

        <fieldset className="mt-5 border-t border-ink-100 pt-4">
          <legend className="sr-only">Filter by status</legend>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => {
              const active = filters.status?.includes(status) ?? false;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleStatus(status)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-felt-700 text-white'
                      : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                  }`}
                >
                  {STATUS_LABEL[status]}
                </button>
              );
            })}
          </div>
        </fieldset>
      </form>

      {isError && (
        <div role="alert" className="mt-6 rounded-card border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-800">{error.message}</p>
        </div>
      )}

      {isPending && <div className="mt-6 h-64 animate-pulse rounded-card bg-ink-100" />}

      {data && (
        <>
          <p className="mt-6 text-sm text-ink-600" aria-live="polite">
            {data.totalItems === 1 ? '1 booking' : `${data.totalItems} bookings`}
          </p>

          {data.items.length === 0 ? (
            <p className="mt-3 rounded-card border border-dashed border-ink-300 bg-ink-50 p-10 text-center text-sm text-ink-600">
              No bookings match these filters.
            </p>
          ) : (
            <div
              className={`mt-3 overflow-x-auto rounded-card border border-ink-200 bg-white shadow-card ${
                isPlaceholderData ? 'opacity-60' : ''
              }`}
            >
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">When</th>
                    <th scope="col" className="px-4 py-3 font-medium">Table</th>
                    <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Price</th>
                    <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.items.map((booking) => (
                    <tr key={booking.reference} className="hover:bg-ink-50">
                      <td className="whitespace-nowrap px-4 py-3 text-felt-900">
                        {formatDate(booking.date)}
                        <span className="ml-2 font-mono text-xs text-ink-500">
                          {formatSlotTime(booking.startTime)}–{formatSlotTime(booking.endTime)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                        {booking.tableName}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-felt-900">{booking.customerName}</span>
                        {booking.customerEmail && (
                          <span className="block text-xs text-ink-500">
                            {booking.customerEmail}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={booking.status} />
                          <PaymentBadge booking={booking} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-felt-900">
                        {formatPence(booking.pricePence)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          to={`/admin/bookings/${booking.reference}`}
                          className="font-mono text-xs text-felt-700 underline underline-offset-2 hover:text-felt-900"
                        >
                          {booking.reference}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-5 flex items-center justify-between gap-4"
            >
              <button
                type="button"
                disabled={page === 0}
                onClick={() => update({ page: String(page - 1) })}
                className="rounded-lg border border-ink-300 px-4 py-2 text-sm font-medium text-felt-900 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-ink-600">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => update({ page: String(page + 1) })}
                className="rounded-lg border border-ink-300 px-4 py-2 text-sm font-medium text-felt-900 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Reads filters out of the URL.
 *
 * <p>Anything unparseable is dropped rather than passed through: a hand-edited `?page=banana`
 * should show page one, not send NaN to the server.
 */
function filtersFromParams(params: URLSearchParams): AdminBookingFilters {
  const page = Number(params.get('page'));
  const tableId = Number(params.get('tableId'));
  const statuses = params
    .getAll('status')
    .filter((value): value is BookingStatus =>
      (STATUSES as string[]).includes(value),
    );

  const from = params.get('from');
  const to = params.get('to');
  const search = params.get('search');

  // Built by spreading rather than assigning `undefined`, because exactOptionalPropertyTypes
  // distinguishes "absent" from "present and undefined" — and an absent filter is the one
  // that means "no filter".
  return {
    ...(statuses.length > 0 ? { status: statuses } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(Number.isInteger(tableId) && tableId > 0 ? { tableId } : {}),
    ...(search ? { search } : {}),
    ...(Number.isInteger(page) && page > 0 ? { page } : {}),
    size: PAGE_SIZE,
  };
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
