import { Link } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/ui/PageShell';
import { Skeleton } from '@/components/ui/Skeleton';
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
  const { data: sections, isPending, isError, error } = useMenu();

  if (isPending) {
    return (
      <PageShell width="md" title="Menu">
        <Skeleton className="h-32" count={3} label="Loading the menu" />
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell width="md" title="Menu">
        <Alert tone="danger" className="mt-8">
          {error instanceof ApiError ? error.message : 'Could not load the menu.'}
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell
      width="md"
      title="Menu"
      description="Served all day at the counter. Prices include VAT."
    >
      {sections.length === 0 ? (
        // Reachable whenever every item is withdrawn. Saying so plainly beats an empty page
        // that reads as broken.
        <EmptyState
          className="mt-8"
          title="Nothing on the menu at the moment"
          description="Please ask at the counter — the kitchen and bar may still be serving."
        />
      ) : (
        sections.map((section) => (
          // Keyed on the label, not the code: the uncategorised section has a null code, and
          // there is only ever one of it.
          <section key={section.code ?? section.label} className="mt-12">
            {/* A rule running off the heading, rather than bold text alone. With six sections
                stacked down one page, the boundary between them has to be visible at a glance
                or the whole menu reads as one long list. */}
            <div className="flex items-center gap-4">
              <h2 className="shrink-0 text-lg font-semibold tracking-tight text-felt-900">
                {section.label}
              </h2>
              <span aria-hidden className="h-px grow bg-line" />
              <span className="shrink-0 text-xs text-fg-muted">
                {section.items.length} {section.items.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* items-start so a card with a picture does not stretch its neighbours to match. */}
            <ul className="mt-5 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <MenuCard key={item.id} item={item} />
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="mt-16 border-t border-line pt-6 text-sm text-fg-muted">
        <Link
          to="/book"
          className="font-medium text-felt-800 underline underline-offset-2 hover:text-felt-900"
        >
          Book a table
        </Link>{' '}
        and eat while you play.
      </p>
    </PageShell>
  );
}

function MenuCard({ item }: { item: MenuItem }) {
  return (
    <li className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-shadow hover:shadow-lifted">
      {/*
        Only rendered when there is a picture. An empty placeholder panel was tried and is
        wrong here: most clubs photograph nothing, so reserving the space turned every card
        into a large blank rectangle with a line of text under it — worse than the flat list
        it replaced. A card without an image is simply a shorter card, and `items-start` on
        the grid keeps the row from stretching it to match a neighbour that has one.
      */}
      {item.imageUrl && (
        <div className="aspect-[3/2] overflow-hidden bg-felt-50">
          <img
            src={item.imageUrl}
            // Empty alt, and deliberately so: the name is already right beside it as text, and
            // repeating it would make a screen reader announce the item twice. The picture is
            // decoration here, not information.
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      )}

      <div className="flex grow flex-col p-4">
        <div className="flex items-baseline justify-between gap-3">
          {/* h3, not h2: the section heading above is the h2, and skipping a level breaks
              heading navigation for anyone moving through the page with a screen reader. */}
          <h3 className="font-medium text-felt-900">{item.name}</h3>
          <span className="shrink-0 font-semibold tabular-nums text-felt-800">
            {formatPence(item.pricePence)}
          </span>
        </div>
        {item.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{item.description}</p>
        )}
      </div>
    </li>
  );
}
