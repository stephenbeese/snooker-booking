import { useState } from 'react';
import { formatSlotTime, todayIso } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { AvailabilityGrid } from './components/AvailabilityGrid';
import { DateSelector } from './components/DateSelector';
import { DurationPicker } from './components/DurationPicker';
import type { Slot } from './types';
import { useAvailability } from './useAvailability';

interface Selection {
  tableId: number;
  tableName: string;
  startAt: string;
  startTime: string;
  pricePence: number | null;
}

export function BookPage() {
  const [date, setDate] = useState(todayIso);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(60);
  const [selected, setSelected] = useState<Selection | null>(null);

  const { data, isPending, isError, error, isPlaceholderData } = useAvailability({
    date,
    durationMinutes: durationMinutes ?? undefined,
  });

  function handleSelect(tableId: number, slot: Slot) {
    const table = data?.tables.find((candidate) => candidate.tableId === tableId);
    if (!table) {
      return;
    }
    setSelected({
      tableId,
      tableName: table.tableName,
      startAt: slot.startAt,
      startTime: slot.startTime,
      pricePence: slot.pricePenceForRequestedDuration,
    });
  }

  function changeDate(next: string) {
    setDate(next);
    // The selection refers to a slot on the old date, so it cannot survive.
    setSelected(null);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-felt-900">Book a table</h1>
        <p className="mt-1 text-sm text-gray-600">
          Choose a date, then pick a table and start time.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <DateSelector date={date} onChange={changeDate} />
        {data && (
          <DurationPicker
            options={data.durationOptions}
            value={durationMinutes}
            onChange={setDurationMinutes}
          />
        )}
      </div>

      <section className="mt-6" aria-live="polite" aria-busy={isPending}>
        {isPending && <p className="text-sm text-gray-500">Loading availability…</p>}

        {isError && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-800">Could not load availability</p>
            <p className="mt-1 text-sm text-rose-700">{error.message}</p>
          </div>
        )}

        {data && (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <AvailabilityGrid
              availability={data}
              selected={selected ? { tableId: selected.tableId, startAt: selected.startAt } : null}
              onSelect={handleSelect}
            />
          </div>
        )}
      </section>

      {selected && (
        <aside className="mt-6 rounded-lg border border-felt-100 bg-felt-50 p-4">
          <h2 className="text-sm font-semibold text-felt-900">Your selection</h2>
          <p className="mt-1 text-sm text-felt-900">
            {selected.tableName} at {formatSlotTime(selected.startTime)}
            {selected.pricePence !== null && <> — {formatPence(selected.pricePence)}</>}
          </p>
          {/* Booking is Phase 2; the grid is read-only for now. */}
          <p className="mt-2 text-xs text-gray-600">
            Booking and payment are not enabled yet.
          </p>
        </aside>
      )}
    </main>
  );
}
