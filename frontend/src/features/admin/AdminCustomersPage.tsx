import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDebounced } from '@/lib/useDebounced';
import { useAdminCustomers } from './useAdmin';
import type { AdminCustomerFilters } from './types';

/**
 * The customer directory.
 *
 * <p>Filter state in the URL, as the booking list keeps it: a staff member who has found the
 * right Smith can send that link to a colleague, and it survives a refresh.
 *
 * <p>Read-only. Correcting a customer's details belongs to the account holder's own profile —
 * a second write path onto the same row from here would have none of the rules that one
 * applies.
 */
export function AdminCustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = filtersFromParams(searchParams);
  const { data, isPending, isError, error, isPlaceholderData } = useAdminCustomers(filters);

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const debouncedSearch = useDebounced(searchInput.trim());

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    // A new search invalidates the page number: staying on page 3 of a result set that now has
    // one page shows an empty table and reads as "no such customer".
    if (!('page' in changes)) {
      next.delete('page');
    }
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (debouncedSearch !== (filters.search ?? '')) {
      update({ search: debouncedSearch || null });
    }
    // Only the settled term. `update` and `filters` are rebuilt every render, so depending on
    // either would re-run this constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    const fromUrl = filters.search ?? '';
    setSearchInput((current) => (current.trim() === fromUrl ? current : fromUrl));
  }, [filters.search]);

  const page = filters.page ?? 0;
  const totalPages = data?.totalPages ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-felt-900">Customers</h1>

      <div className="mt-8 rounded-card border border-ink-200 bg-white p-5 shadow-card">
        <label htmlFor="customer-search" className="block text-sm font-medium text-felt-900">
          Search
        </label>
        <input
          id="customer-search"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Name or email"
          className="mt-1.5 w-full max-w-md rounded-lg border border-ink-300 px-3 py-2 text-sm text-felt-900 placeholder:text-ink-400"
        />
      </div>

      {isError && (
        <div role="alert" className="mt-6 rounded-card border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-800">{error.message}</p>
        </div>
      )}

      {isPending && <div className="mt-6 h-64 animate-pulse rounded-card bg-ink-100" />}

      {data && (
        <>
          <p className="mt-6 text-sm text-ink-600" aria-live="polite">
            {data.totalItems === 1 ? '1 customer' : `${data.totalItems} customers`}
          </p>

          {data.items.length === 0 ? (
            <p className="mt-3 rounded-card border border-dashed border-ink-300 bg-ink-50 p-10 text-center text-sm text-ink-600">
              No customers match that search.
            </p>
          ) : (
            <div
              className={`mt-3 overflow-x-auto rounded-card border border-ink-200 bg-white shadow-card ${
                isPlaceholderData ? 'opacity-60' : ''
              }`}
            >
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Name</th>
                    <th scope="col" className="px-4 py-3 font-medium">Email</th>
                    <th scope="col" className="px-4 py-3 font-medium">Phone</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Bookings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.items.map((customer) => (
                    <tr key={customer.id} className="hover:bg-ink-50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          to={`/admin/customers/${customer.id}`}
                          className="font-medium text-felt-700 underline underline-offset-2 hover:text-felt-900"
                        >
                          {customer.fullName}
                        </Link>
                        {!customer.active && (
                          <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-700">{customer.email}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                        {customer.phone ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-felt-900">
                        {customer.bookingCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-5 flex items-center justify-between gap-4">
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

/** Reads filters out of the URL, dropping anything unparseable rather than sending it on. */
function filtersFromParams(params: URLSearchParams): AdminCustomerFilters {
  const page = Number(params.get('page'));
  const search = params.get('search');
  return {
    ...(search ? { search } : {}),
    ...(Number.isInteger(page) && page > 0 ? { page } : {}),
  };
}
