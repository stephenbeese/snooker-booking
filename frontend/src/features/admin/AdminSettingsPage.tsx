import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/apiError';
import { PricingRules } from './components/PricingRules';
import { SettingsWarnings } from './components/SettingsWarnings';
import {
  useBookingRules,
  useClubDetails,
  useOpeningHours,
  useUpdateBookingRules,
  useUpdateClubDetails,
  useUpdateOpeningHours,
} from './useAdmin';
import type { BookingRules, ClubDetails, DayHours, SettingsWarning, Weekday } from './types';

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

function messageOf(error: unknown, fallback: string): string | null {
  if (error instanceof ApiError) return error.message;
  return error ? fallback : null;
}

/**
 * The settings that decide what the club can sell.
 *
 * <p>One page with three sections rather than three routes: staff adjusting opening hours
 * often want to change the booking window in the same sitting, and the settings are small
 * enough that splitting them would add navigation without adding clarity.
 *
 * <p>Each section saves independently. A failed save in one must not discard unsaved edits in
 * another, which a single page-wide form would do.
 */
export function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Settings</h1>
      <p className="mt-2 text-sm text-ink-600">
        These control what customers can book. Changes apply to new bookings only — bookings
        already taken are never cancelled automatically, but you will be told which ones a
        change affects.
      </p>

      <OpeningHoursSection />
      <BookingRulesSection />
      <PricingSection />
      <ClubDetailsSection />
    </div>
  );
}

// ---------------------------------------------------------------- opening hours

function OpeningHoursSection() {
  const { data, isPending } = useOpeningHours();
  const mutation = useUpdateOpeningHours();
  const [days, setDays] = useState<DayHours[]>([]);
  const [warnings, setWarnings] = useState<SettingsWarning[]>([]);

  useEffect(() => {
    if (data) setDays(data);
  }, [data]);

  function update(index: number, changes: Partial<DayHours>) {
    setDays((current) =>
      current.map((day, i) => (i === index ? { ...day, ...changes } : day)),
    );
  }

  async function save() {
    setWarnings([]);
    const result = await mutation.mutateAsync(days).catch(() => null);
    if (result) setWarnings(result.warnings);
  }

  if (isPending) return <Section title="Opening hours">Loading…</Section>;

  return (
    <Section title="Opening hours">
      <p className="text-sm text-ink-600">
        A closed day disappears from the booking grid entirely. Times are kept when you close a
        day, so reopening restores them.
      </p>

      <div className="mt-4 space-y-3">
        {days.map((day, index) => (
          <div key={day.day} className="flex flex-wrap items-center gap-3">
            <span className="w-24 text-sm font-medium text-felt-900">
              {WEEKDAY_LABEL[day.day]}
            </span>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                // Without this the accessible name is just "on" — seven identical checkboxes
                // with no indication of which day each belongs to.
                aria-label={`${WEEKDAY_LABEL[day.day]} closed`}
                checked={day.closed}
                onChange={(event) => update(index, { closed: event.target.checked })}
              />
              Closed
            </label>
            <input
              type="time"
              aria-label={`${WEEKDAY_LABEL[day.day]} opening time`}
              className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset ring-ink-300 disabled:bg-ink-50 disabled:text-ink-400"
              value={day.openTime?.slice(0, 5) ?? ''}
              disabled={day.closed}
              onChange={(event) => update(index, { openTime: `${event.target.value}:00` })}
            />
            <span className="text-ink-500">to</span>
            <input
              type="time"
              aria-label={`${WEEKDAY_LABEL[day.day]} closing time`}
              className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset ring-ink-300 disabled:bg-ink-50 disabled:text-ink-400"
              value={day.closeTime?.slice(0, 5) ?? ''}
              disabled={day.closed}
              onChange={(event) => update(index, { closeTime: `${event.target.value}:00` })}
            />
          </div>
        ))}
      </div>

      <SaveRow
        onSave={save}
        pending={mutation.isPending}
        error={messageOf(mutation.error, 'Could not save the opening hours.')}
      />
      <SettingsWarnings warnings={warnings} />
    </Section>
  );
}

// ---------------------------------------------------------------- booking rules

const RULE_FIELDS: { key: keyof BookingRules; label: string; hint: string }[] = [
  { key: 'minDurationMinutes', label: 'Shortest booking (minutes)', hint: 'Must be a multiple of the increment.' },
  { key: 'maxDurationMinutes', label: 'Longest booking (minutes)', hint: 'Must be a multiple of the increment.' },
  { key: 'incrementMinutes', label: 'Slot increment (minutes)', hint: 'The spacing of the booking grid.' },
  { key: 'minNoticeMinutes', label: 'Minimum notice (minutes)', hint: 'Staff bypass this; customers do not.' },
  { key: 'maxAdvanceDays', label: 'Book up to (days ahead)', hint: 'How far the grid extends.' },
  { key: 'cancellationNoticeHours', label: 'Free cancellation until (hours before)', hint: 'After this, customers cannot cancel themselves.' },
  { key: 'paymentHoldMinutes', label: 'Payment hold (minutes)', hint: 'How long a slot is held while paying. At least 5.' },
];

function BookingRulesSection() {
  const { data, isPending } = useBookingRules();
  const mutation = useUpdateBookingRules();
  const [rules, setRules] = useState<BookingRules | null>(null);
  const [warnings, setWarnings] = useState<SettingsWarning[]>([]);

  useEffect(() => {
    if (data) setRules(data);
  }, [data]);

  async function save() {
    if (!rules) return;
    setWarnings([]);
    const result = await mutation.mutateAsync(rules).catch(() => null);
    if (result) setWarnings(result.warnings);
  }

  if (isPending || !rules) return <Section title="Booking rules">Loading…</Section>;

  return (
    <Section title="Booking rules">
      <div className="grid gap-4 sm:grid-cols-2">
        {RULE_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            hint={field.hint}
            type="number"
            min={0}
            value={rules[field.key]}
            onChange={(event) =>
              setRules({ ...rules, [field.key]: Number(event.target.value) })
            }
          />
        ))}
      </div>

      <SaveRow
        onSave={save}
        pending={mutation.isPending}
        error={messageOf(mutation.error, 'Could not save the booking rules.')}
      />
      <SettingsWarnings warnings={warnings} />
    </Section>
  );
}

// ---------------------------------------------------------------- pricing

function PricingSection() {
  return (
    <Section title="Pricing">
      <PricingRules />
    </Section>
  );
}

// ---------------------------------------------------------------- club details

const CLUB_FIELDS: { key: keyof ClubDetails; label: string; type?: string }[] = [
  { key: 'name', label: 'Club name' },
  { key: 'addressLine1', label: 'Address line 1' },
  { key: 'addressLine2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'description', label: 'Description' },
];

function ClubDetailsSection() {
  const { data, isPending } = useClubDetails();
  const mutation = useUpdateClubDetails();
  const [club, setClub] = useState<ClubDetails | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setClub(data);
  }, [data]);

  async function save() {
    if (!club) return;
    setSaved(false);
    const result = await mutation.mutateAsync(club).catch(() => null);
    if (result) setSaved(true);
  }

  if (isPending || !club) return <Section title="Club details">Loading…</Section>;

  return (
    <Section title="Club details">
      <p className="text-sm text-ink-600">
        Shown on the public club page. These do not affect booking rules.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {CLUB_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            {...(field.type ? { type: field.type } : {})}
            value={club[field.key] ?? ''}
            onChange={(event) => setClub({ ...club, [field.key]: event.target.value })}
          />
        ))}
      </div>

      <SaveRow
        onSave={save}
        pending={mutation.isPending}
        error={messageOf(mutation.error, 'Could not save the club details.')}
      />
      {saved && !mutation.error && (
        <p role="status" className="mt-3 text-sm font-medium text-felt-800">
          Club details saved.
        </p>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- shared

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-card border border-ink-200 bg-white p-6 shadow-card">
      <h2 className="text-lg font-semibold text-felt-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SaveRow({
  onSave,
  pending,
  error,
}: {
  onSave: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}
      <Button type="button" className="mt-4" disabled={pending} onClick={onSave}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </>
  );
}
