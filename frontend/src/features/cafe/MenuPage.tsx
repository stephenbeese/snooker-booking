import { Link } from 'react-router';
import { ApiError } from '@/lib/apiError';
import { formatPence } from '@/lib/money';
import { useMenu } from './useMenu';
import type { MenuItem } from './types';

/**
 * The cafe and bar menu, as customers read it.
 *
 * <p>Read-only and public. Ordering, bills and paying for food are deliberately not here — the
 * club takes those at the counter, and this page exists so somebody can see what is on before
 * they come down.
 */
export function MenuPage() {
  const { data: items, isPending, isError, error } = useMenu();

  if (isPending) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="text-ink-600">Loading the menu…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p role="alert" className="text-rose-700">
          {error instanceof ApiError ? error.message : 'Could not load the menu.'}
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Cafe &amp; bar</h1>
      <p className="mt-2 text-ink-600">
        Served all day at the counter. Prices include VAT.
      </p>

      {items.length === 0 ? (
        // Reachable whenever every item is withdrawn. Saying so plainly beats an empty page
        // that reads as broken.
        <p className="mt-10 text-ink-600">
          Nothing on the menu at the moment. Please ask at the counter.
        </p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <MenuCard key={item.id} item={item} />
          ))}
        </ul>
      )}

      <p className="mt-12 text-sm text-ink-600">
        <Link to="/book" className="font-medium text-felt-800 underline hover:text-felt-900">
          Book a table
        </Link>{' '}
        and eat while you play.
      </p>
    </section>
  );
}

function MenuCard({ item }: { item: MenuItem }) {
  return (
    <li className="flex gap-4 rounded-card border border-ink-200 bg-white p-4 shadow-card">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          // Empty alt, and deliberately so: the name is already right beside it as text, and
          // repeating it would make a screen reader announce the item twice. The picture is
          // decoration here, not information.
          alt=""
          className="h-20 w-20 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      )}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium text-felt-900">{item.name}</h2>
          <span className="shrink-0 tabular-nums text-felt-800">
            {formatPence(item.pricePence)}
          </span>
        </div>
        {item.description && <p className="mt-1 text-sm text-ink-600">{item.description}</p>}
      </div>
    </li>
  );
}
