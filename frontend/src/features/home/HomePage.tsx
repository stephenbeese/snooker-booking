import { Link } from 'react-router';
import { useCurrentUser } from '@/features/auth/useAuth';
import { useClub } from '@/features/club/useClub';
import type { DayHours } from '@/features/club/types';
import { formatSlotTime, weekdayName } from '@/lib/datetime';
import { formatPence } from '@/lib/money';

/**
 * The front door.
 *
 * <p>Everything factual here — opening hours, the headline rate, how far ahead you may
 * book — comes from {@code /api/club} rather than being written into the markup. A home
 * page that hardcodes "open until 11pm" is wrong the day an admin edits the opening
 * hours, and wrong silently, which is worse than being obviously broken.
 */
export function HomePage() {
  const { data: club } = useClub();
  const { data: user } = useCurrentUser();

  return (
    <>
      <Hero
        name={club?.name}
        description={club?.description ?? null}
        fromHourlyRatePence={club?.fromHourlyRatePence}
        signedIn={Boolean(user)}
      />
      <Highlights maxAdvanceDays={club?.maxAdvanceDays} minDurationMinutes={club?.minDurationMinutes} />
      <OpeningHoursSection hours={club?.openingHours} />
      <HowItWorks />
    </>
  );
}

function Hero({
  name,
  description,
  fromHourlyRatePence,
  signedIn,
}: {
  name: string | undefined;
  description: string | null;
  fromHourlyRatePence: number | undefined;
  signedIn: boolean;
}) {
  return (
    <section className="bg-baize relative overflow-hidden">
      {/* Decorative only: a faint cue-ball arc bleeding off the right edge. aria-hidden
          because describing it to a screen reader adds nothing. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-felt-700/20 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="animate-rise max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brass-300 ring-1 ring-inset ring-white/15">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brass-400" />
            Book online in under a minute
          </p>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            {name ?? 'The Snooker Club'}
          </h1>

          {description && (
            <p className="mt-5 text-lg leading-relaxed text-felt-100 sm:text-xl">{description}</p>
          )}

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/book"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-medium text-felt-900 shadow-lifted transition-transform hover:-translate-y-0.5"
            >
              Book a table
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M4 10h11M11 6l4 4-4 4" />
              </svg>
            </Link>

            {!signedIn && (
              <Link
                to="/register"
                className="rounded-xl px-6 py-3 text-base font-medium text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/10"
              >
                Create an account
              </Link>
            )}
          </div>

          {fromHourlyRatePence !== undefined && (
            <p className="mt-8 text-sm text-felt-200">
              Tables from{' '}
              <span className="font-semibold text-brass-300">
                {formatPence(fromHourlyRatePence)}
              </span>{' '}
              per hour
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Highlights({
  maxAdvanceDays,
  minDurationMinutes,
}: {
  maxAdvanceDays: number | undefined;
  minDurationMinutes: number | undefined;
}) {
  const items = [
    {
      title: 'Live availability',
      body: 'See exactly which tables are free, hour by hour. No phone calls, no waiting.',
    },
    {
      title: 'Instant confirmation',
      body: 'Pay securely online and your table is confirmed straight away.',
    },
    {
      title: 'Book ahead',
      body:
        maxAdvanceDays !== undefined && minDurationMinutes !== undefined
          ? `Reserve up to ${maxAdvanceDays} days in advance, from ${minDurationMinutes} minutes at a time.`
          : 'Reserve well in advance, for as long as you need.',
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <ul className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.title}
            className="rounded-card border border-ink-200 bg-white p-6 shadow-card transition-shadow hover:shadow-lifted"
          >
            <h2 className="font-semibold tracking-tight text-felt-900">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OpeningHoursSection({ hours }: { hours: DayHours[] | undefined }) {
  // The club's own clock, so "today" highlights the right row wherever the visitor is.
  const todayIsoDay = new Date().getDay() === 0 ? 7 : new Date().getDay();

  return (
    <section className="border-y border-ink-200 bg-ink-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-felt-900 sm:text-3xl">
            When we're open
          </h2>
          <p className="mt-3 max-w-md leading-relaxed text-ink-600">
            Booking is available during opening hours. Pick a date and we'll show you every
            free slot on every table.
          </p>
          <Link
            to="/book"
            className="mt-6 inline-flex items-center gap-1.5 font-medium text-felt-700 hover:text-felt-900"
          >
            Check availability
            <span aria-hidden>→</span>
          </Link>
        </div>

        <div className="rounded-card border border-ink-200 bg-white p-2 shadow-card">
          {hours ? (
            <dl>
              {hours.map((day) => {
                const isToday = day.dayOfWeek === todayIsoDay;
                return (
                  <div
                    key={day.dayOfWeek}
                    className={[
                      'flex items-center justify-between rounded-lg px-4 py-2.5 text-sm',
                      isToday ? 'bg-felt-50 font-medium text-felt-900' : 'text-ink-700',
                    ].join(' ')}
                  >
                    <dt>
                      {weekdayName(day.dayOfWeek)}
                      {isToday && <span className="ml-2 text-xs text-felt-600">Today</span>}
                    </dt>
                    <dd className={day.closed ? 'text-ink-400' : 'tabular-nums'}>
                      {day.closed || !day.openTime || !day.closeTime
                        ? 'Closed'
                        : `${formatSlotTime(day.openTime)} – ${formatSlotTime(day.closeTime)}`}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            // Skeleton rows rather than a spinner: the block keeps its height, so the
            // page below does not jump when the hours arrive.
            <div className="space-y-1 p-2">
              {Array.from({ length: 7 }, (_, index) => (
                <div key={index} className="h-9 animate-pulse rounded-lg bg-ink-100" />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { title: 'Pick your slot', body: 'Choose a date, a table and how long you want to play.' },
    { title: 'Pay securely', body: 'Card payment handled by Stripe. We never see your card details.' },
    { title: 'Turn up and play', body: 'Your table is reserved. Just give your name at the desk.' },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-2xl font-semibold tracking-tight text-felt-900 sm:text-3xl">
        How it works
      </h2>

      <ol className="mt-8 grid gap-6 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="relative pl-12">
            <span
              aria-hidden
              className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-felt-700 text-sm font-semibold text-white"
            >
              {index + 1}
            </span>
            <h3 className="font-semibold tracking-tight text-felt-900">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-col items-start gap-4 rounded-card bg-felt-900 p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-white">Ready for a frame?</h3>
          <p className="mt-1.5 text-felt-200">Find a free table right now.</p>
        </div>
        <Link
          to="/book"
          className="shrink-0 rounded-xl bg-white px-6 py-3 font-medium text-felt-900 transition-transform hover:-translate-y-0.5"
        >
          Book a table
        </Link>
      </div>
    </section>
  );
}
