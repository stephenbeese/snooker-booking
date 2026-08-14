import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiError';
import { PricingRules } from './components/PricingRules';
import { SettingsWarnings } from './components/SettingsWarnings';
import { formatDateLong } from '@/lib/datetime';
import {
  useAdminTableTypes,
  useBookingRules,
  useClubDetails,
  useCreateTableType,
  useDeleteOpeningHoursOverride,
  useOpeningHours,
  useOpeningHoursOverrides,
  useSaveOpeningHoursOverride,
  useSetTableTypeActive,
  useUpdateBookingRules,
  useUpdateClubDetails,
  useUpdateOpeningHours,
} from './useAdmin';
import type {
  BookingRules,
  ClubDetails,
  DateHours,
  DayHours,
  SettingsWarning,
  Weekday,
} from './types';

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
      <SpecialHoursSection />
      <TableTypesSection />
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
  const toast = useToast();
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
    if (!result) return;
    setWarnings(result.warnings);
    // The toast confirms the save happened at all. The warnings block below says which
    // bookings it stranded, and stays put — that is not something to read in five seconds.
    toast('Opening hours saved.');
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

// ---------------------------------------------------------------- special hours

/** A blank override form: closed by default, which is the common case. */
const BLANK_OVERRIDE: DateHours = {
  date: '',
  closed: true,
  openTime: null,
  closeTime: null,
  note: null,
};

/**
 * Opening hours for named dates — Christmas, a bank holiday, a private function.
 *
 * <p>Separate from the weekly hours above because they answer different questions: those set
 * what an ordinary Tuesday looks like, these say that <em>this</em> Tuesday is not ordinary.
 * An override wins outright over the weekday for its date.
 */
function SpecialHoursSection() {
  const { data, isPending } = useOpeningHoursOverrides();
  const save = useSaveOpeningHoursOverride();
  const remove = useDeleteOpeningHoursOverride();
  const toast = useToast();
  const [draft, setDraft] = useState<DateHours>(BLANK_OVERRIDE);
  const [warnings, setWarnings] = useState<SettingsWarning[]>([]);

  async function onSave() {
    setWarnings([]);
    if (!draft.date) return;
    // Clear the other operation's error first. SaveRow renders `save.error ?? remove.error`,
    // so a failed remove would otherwise leave its message sitting above a save that then
    // succeeded — the same trap PricingRules documents between its own two mutations.
    remove.reset();
    const result = await save.mutateAsync(draft).catch(() => null);
    if (!result) return;
    setWarnings(result.warnings);
    // Names the date. The form clears itself on success, so without it there is nothing left
    // on screen saying which date was just saved.
    toast(`Special hours saved for ${formatDateLong(draft.date)}.`);
    setDraft(BLANK_OVERRIDE);
  }

  async function onRemove(date: string) {
    // The mirror of onSave above: a failed save must not leave its banner over a successful
    // removal.
    save.reset();
    // The delete resolves to void, so success is signalled by not throwing rather than by a
    // returned value — hence a try/catch instead of the `.catch(() => null)` used above,
    // where `undefined` and `null` would be indistinguishable.
    try {
      await remove.mutateAsync(date);
    } catch {
      // The failure is already rendered inline by SaveRow, which reads remove.error.
      return;
    }
    // The row vanishes from a list that may be long. A confirmation naming the date is the
    // difference between "that worked" and "did I just delete the wrong one?".
    toast(`Special hours removed for ${formatDateLong(date)}.`);
  }

  if (isPending) return <Section title="Special opening hours">Loading…</Section>;

  return (
    <Section title="Special opening hours">
      <p className="text-sm text-ink-600">
        Hours for one date, overriding that day of the week. A date set to closed disappears
        from the booking grid and is refused by the booking form.
      </p>

      {data && data.length > 0 ? (
        <ul className="mt-4 divide-y divide-ink-100">
          {data.map((override) => (
            <li key={override.date} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="w-28 text-sm font-medium text-felt-900">
                {formatDateLong(override.date)}
              </span>
              <span className="text-sm text-ink-700">
                {override.closed
                  ? 'Closed'
                  : `${override.openTime?.slice(0, 5)}–${override.closeTime?.slice(0, 5)}`}
              </span>
              {override.note && (
                <span className="text-sm text-ink-500">{override.note}</span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="ml-auto"
                disabled={remove.isPending}
                onClick={() => void onRemove(override.date)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink-500">
          No special hours set. The club follows its weekly hours on every date.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-5">
        <div>
          <label htmlFor="override-date" className="block text-sm font-medium text-felt-900">
            Date
          </label>
          <input
            id="override-date"
            type="date"
            className="mt-1.5 rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-ink-300"
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={draft.closed}
            onChange={(event) => setDraft({ ...draft, closed: event.target.checked })}
          />
          Closed all day
        </label>
        <div>
          <label htmlFor="override-open" className="block text-sm font-medium text-felt-900">
            Opens
          </label>
          <input
            id="override-open"
            type="time"
            className="mt-1.5 rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-ink-300 disabled:bg-ink-50 disabled:text-ink-400"
            disabled={draft.closed}
            value={draft.openTime?.slice(0, 5) ?? ''}
            onChange={(event) =>
              setDraft({ ...draft, openTime: `${event.target.value}:00` })
            }
          />
        </div>
        <div>
          <label htmlFor="override-close" className="block text-sm font-medium text-felt-900">
            Closes
          </label>
          <input
            id="override-close"
            type="time"
            className="mt-1.5 rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-ink-300 disabled:bg-ink-50 disabled:text-ink-400"
            disabled={draft.closed}
            value={draft.closeTime?.slice(0, 5) ?? ''}
            onChange={(event) =>
              setDraft({ ...draft, closeTime: `${event.target.value}:00` })
            }
          />
        </div>
        <div className="grow">
          <label htmlFor="override-note" className="block text-sm font-medium text-felt-900">
            Reason
          </label>
          <input
            id="override-note"
            type="text"
            placeholder="Christmas Day"
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-ink-300"
            value={draft.note ?? ''}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />
        </div>
      </div>

      <SaveRow
        onSave={onSave}
        pending={save.isPending}
        error={messageOf(
          save.error ?? remove.error,
          'Could not save those special hours.',
        )}
      />
      <SettingsWarnings warnings={warnings} />
    </Section>
  );
}

// ---------------------------------------------------------------- table types

/**
 * The kinds of table the club holds.
 *
 * <p>Data rather than a fixed list since Phase 7, so a manager can add a format the club takes
 * up without waiting for a deployment. There is no delete: tables and pricing rules reference
 * a type by code, so withdrawing it takes it off the list of choices while leaving history
 * readable — and the server refuses even that while any table still carries it.
 */
function TableTypesSection() {
  const { data, isPending } = useAdminTableTypes();
  const create = useCreateTableType();
  const setActive = useSetTableTypeActive();
  const toast = useToast();
  const [label, setLabel] = useState('');

  async function add() {
    if (!label.trim()) return;
    const created = await create.mutateAsync({ label: label.trim() }).catch(() => null);
    if (!created) return;
    setLabel('');
    // Names the derived code: it is what pricing rules and the API refer to, and this is the
    // only moment the manager sees the label they typed turn into one.
    toast(`Table type “${created.label}” added as ${created.code}.`);
  }

  async function toggleActive(code: string, active: boolean) {
    const updated = await setActive.mutateAsync({ code, active }).catch(() => null);
    if (!updated) return;
    toast(
      active
        ? `“${updated.label}” restored and available again.`
        : `“${updated.label}” withdrawn. Existing tables keep it.`,
    );
  }

  if (isPending) return <Section title="Table types">Loading…</Section>;

  return (
    <Section title="Table types">
      <p className="text-sm text-ink-600">
        The kinds of table you offer. Adding one makes it available on every table and pricing
        rule. A type in use cannot be withdrawn — change those tables first.
      </p>

      <ul className="mt-4 divide-y divide-ink-100">
        {(data ?? []).map((type) => (
          <li key={type.code} className="flex flex-wrap items-center gap-3 py-2.5">
            <span
              className={`text-sm font-medium ${type.active ? 'text-felt-900' : 'text-ink-400'}`}
            >
              {type.label}
            </span>
            <span className="font-mono text-xs text-ink-400">{type.code}</span>
            {!type.active && <span className="text-xs text-ink-500">withdrawn</span>}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="ml-auto"
              disabled={setActive.isPending}
              onClick={() => void toggleActive(type.code, !type.active)}
            >
              {type.active ? 'Withdraw' : 'Restore'}
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-5">
        <div className="grow">
          <label htmlFor="new-table-type" className="block text-sm font-medium text-felt-900">
            New type
          </label>
          <input
            id="new-table-type"
            type="text"
            placeholder="Chinese pool"
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-inset ring-ink-300"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <Button type="button" disabled={create.isPending || !label.trim()} onClick={add}>
          {create.isPending ? 'Adding…' : 'Add type'}
        </Button>
      </div>

      {(create.error ?? setActive.error) && (
        <p role="alert" className="mt-4 text-sm font-medium text-rose-700">
          {messageOf(create.error ?? setActive.error, 'Could not save that table type.')}
        </p>
      )}
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
  const toast = useToast();
  const [rules, setRules] = useState<BookingRules | null>(null);
  const [warnings, setWarnings] = useState<SettingsWarning[]>([]);

  useEffect(() => {
    if (data) setRules(data);
  }, [data]);

  async function save() {
    if (!rules) return;
    setWarnings([]);
    const result = await mutation.mutateAsync(rules).catch(() => null);
    if (!result) return;
    setWarnings(result.warnings);
    toast('Booking rules saved.');
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
  const toast = useToast();
  const [club, setClub] = useState<ClubDetails | null>(null);

  useEffect(() => {
    if (data) setClub(data);
  }, [data]);

  async function save() {
    if (!club) return;
    // Previously a local `saved` boolean rendering a permanent line under this one section.
    // The toast replaces it: the same confirmation, in the same place as every other save on
    // the page, and it does not linger over a form the user has since edited again.
    const result = await mutation.mutateAsync(club).catch(() => null);
    if (result) toast('Club details saved.');
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
