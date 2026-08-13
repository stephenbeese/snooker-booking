import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { CheckboxDropdown } from '@/components/ui/CheckboxDropdown';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/apiError';
import { formatPence, penceToPounds, poundsToPence } from '@/lib/money';
import { useDeletePricingRule, usePricingRules, useSavePricingRule } from '../useAdmin';
import type { PricingRule, TableType, Weekday } from '../types';

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

const TABLE_TYPE_LABEL: Record<TableType, string> = {
  SNOOKER: 'Snooker',
  ENGLISH_POOL: 'English pool',
  AMERICAN_POOL: 'American pool',
};

/** '' is the wire's null: a select cannot hold null, and "any" is what null means here. */
const ANY = '';

const schema = z
  .object({
    name: z.string().min(1, 'Give the rule a name').max(100),
    // Pounds, because that is what a person types. Converted to pence on submit.
    ratePounds: z.coerce
      .number({ message: 'Enter a rate' })
      .positive('The rate must be more than zero')
      .max(1000, 'That looks too high — the rate is per hour'),
    priority: z.coerce.number().int('Priority must be a whole number'),
    tableType: z.string(),
    // An array, and empty is valid: it is how "every day" is expressed, so there is
    // deliberately no "at least one" rule here.
    daysOfWeek: z.array(z.string()),
    startTime: z.string(),
    endTime: z.string(),
    active: z.boolean(),
  })
  // Checked here as well as on the server, so the message lands on the field rather than in a
  // banner after a round trip. The server keeps its own copy — this is convenience, not the rule.
  .refine((values) => !values.startTime === !values.endTime, {
    message: 'Give both a start and an end time, or neither',
    path: ['endTime'],
  })
  .refine((values) => !values.startTime || !values.endTime || values.endTime > values.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  });

type FormValues = z.input<typeof schema>;

const BLANK: FormValues = {
  name: '',
  ratePounds: 12,
  priority: 0,
  tableType: ANY,
  daysOfWeek: [],
  startTime: '',
  endTime: '',
  active: true,
};

/** Monday-first, matching how the rest of the app orders a week. */
const WEEK: Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

/**
 * A day set in words.
 *
 * <p>Named runs rather than a list of seven: "Every day" and "Weekends" are what staff
 * actually mean, and a rule reading "Monday, Tuesday, Wednesday, Thursday, Friday" buries the
 * distinction between weekdays and one that merely happens to list five days.
 */
function describeDays(days: Weekday[]): string | null {
  if (days.length === 0 || days.length === 7) return null;
  const set = new Set(days);
  const weekdays = WEEK.slice(0, 5);
  const weekend = WEEK.slice(5);
  if (weekdays.every((day) => set.has(day)) && !weekend.some((day) => set.has(day))) {
    return 'Weekdays';
  }
  if (weekend.every((day) => set.has(day)) && !weekdays.some((day) => set.has(day))) {
    return 'Weekends';
  }
  return WEEK.filter((day) => set.has(day))
    .map((day) => WEEKDAY_LABEL[day].slice(0, 3))
    .join(', ');
}

/** What a rule applies to, in a sentence. */
function appliesTo(rule: PricingRule): string {
  if (rule.catchAll) return 'Everything';
  return [
    rule.tableType ? TABLE_TYPE_LABEL[rule.tableType] : null,
    describeDays(rule.daysOfWeek),
    rule.startTime && rule.endTime
      ? `${rule.startTime.slice(0, 5)}–${rule.endTime.slice(0, 5)}`
      : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Would this change leave the club unable to price a booking?
 *
 * <p>`PricingService` throws when no active rule matches, which turns every booking attempt
 * into a 500 — the club silently stops selling. The server refuses such a change outright; this
 * predicts the refusal so staff are told before they click, rather than after.
 */
function isLastActiveCatchAll(rules: PricingRule[], rule: PricingRule): boolean {
  if (!rule.catchAll || !rule.active) return false;
  return rules.filter((candidate) => candidate.catchAll && candidate.active).length === 1;
}

/**
 * Pricing rules, editable.
 *
 * <p>The highest-priority matching rule sets the rate. Rules are edited in place rather than in
 * a modal: the list is the context — which rule wins depends on the others' priorities — and a
 * dialog that covers it makes that impossible to judge.
 */
export function PricingRules() {
  const { data: rules, isPending, isError, error } = usePricingRules();
  const saveRule = useSavePricingRule();
  const deleteRule = useDeletePricingRule();

  /** null = not editing; a number = that rule's id; 'new' = the add form. */
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: BLANK });

  useEffect(() => {
    if (editing === null || editing === 'new') {
      reset(BLANK);
      return;
    }
    const rule = rules?.find((candidate) => candidate.id === editing);
    if (!rule) {
      // The rule went away — deleted here, or in another tab. Closing the form is the honest
      // response; leaving it open would let staff edit fields and save into a 404.
      setEditing(null);
      return;
    }
    reset({
      name: rule.name,
      ratePounds: Number(penceToPounds(rule.hourlyRatePence)),
      priority: rule.priority,
      tableType: rule.tableType ?? ANY,
      daysOfWeek: rule.daysOfWeek ?? [],
      startTime: rule.startTime?.slice(0, 5) ?? '',
      endTime: rule.endTime?.slice(0, 5) ?? '',
      active: rule.active,
    });
  }, [editing, rules, reset]);

  async function onSubmit(values: FormValues) {
    // String(): z.coerce.number() types its *input* as unknown, since anything may be
    // coerced. The value has already passed the schema, so it is a usable number or numeric
    // string by here — poundsToPence still guards, because a silent NaN would be a wrong price.
    const pence = poundsToPence(String(values.ratePounds));
    if (pence === null || pence <= 0) return;

    // Same reason as in remove(): a leftover delete error would otherwise sit above the form
    // and read as though this save had failed.
    deleteRule.reset();

    try {
      await saveRule.mutateAsync({
        id: editing === 'new' || editing === null ? null : editing,
        input: {
          name: String(values.name).trim(),
          // '' back to null: the wire's "matches anything".
          tableType: (values.tableType || null) as TableType | null,
          // All seven ticked is the same as none: both mean "every day". Normalising here
          // keeps one representation in the database instead of two that behave alike.
          daysOfWeek:
            values.daysOfWeek.length === WEEK.length ? [] : (values.daysOfWeek as Weekday[]),
          // The server wants seconds; a time input gives HH:mm.
          startTime: values.startTime ? `${values.startTime}:00` : null,
          endTime: values.endTime ? `${values.endTime}:00` : null,
          hourlyRatePence: pence,
          priority: Number(values.priority),
          active: Boolean(values.active),
        },
      });
      setEditing(null);
    } catch {
      // Rendered from the mutation error below.
    }
  }

  async function remove(id: number) {
    // Clear the other operation's error first. Without this a failed save leaves its banner
    // on screen while a delete succeeds, and vice versa — the two mutations were sharing one
    // message with nothing resetting it, so a stale error made the *next* action look broken.
    saveRule.reset();
    try {
      await deleteRule.mutateAsync(id);
    } catch {
      // Rendered from the mutation error below.
    } finally {
      // finally, not just on success: leaving the row on "Confirm delete" after a refusal
      // gives staff a button that keeps failing with no indication that anything changed.
      setConfirmingDelete(null);
    }
  }

  // Kept separate so the message names the operation that actually failed. "Could not save
  // that pricing rule" after a failed delete sends staff looking at the form.
  const errorMessage = saveRule.error
    ? saveRule.error instanceof ApiError
      ? saveRule.error.message
      : 'Could not save that pricing rule.'
    : deleteRule.error
      ? deleteRule.error instanceof ApiError
        ? deleteRule.error.message
        : 'Could not delete that pricing rule.'
      : null;

  if (isPending) return <p className="text-ink-600">Loading pricing…</p>;
  if (isError) {
    return (
      <p role="alert" className="text-sm font-medium text-rose-700">
        {error instanceof ApiError ? error.message : 'Could not load pricing rules.'}
      </p>
    );
  }

  const all = rules ?? [];
  const duplicateCatchAlls = all.filter((rule) => rule.catchAll && rule.active);

  return (
    <>
      <p className="text-sm text-ink-600">
        The highest-priority matching rule sets the hourly rate. A rule with no restrictions
        applies to everything and is the club&rsquo;s fallback — at least one must stay active, or
        a booking that matches nothing could not be priced.
      </p>
      <p className="mt-1 text-sm text-ink-600">
        Changing a rate never alters a booking already taken: those keep the price they were
        quoted.
      </p>

      {errorMessage && (
        <p role="alert" className="mt-4 text-sm font-medium text-rose-700">
          {errorMessage}
        </p>
      )}

      {/* Two rules that both match everything is legal but almost never intended: the
          lower-priority one can never win, so it looks active while doing nothing, and staff
          editing "the fallback rate" have even odds of editing the one with no effect. Worth
          saying out loud rather than leaving them to work out why a rate change did nothing. */}
      {duplicateCatchAlls.length > 1 && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {duplicateCatchAlls.length} active rules apply to everything (
          {duplicateCatchAlls.map((rule) => rule.name).join(', ')}). Only the
          highest-priority one is ever used — the others have no effect.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Pricing rules</caption>
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-600">
              <th scope="col" className="py-2 pr-4 font-medium">Rule</th>
              <th scope="col" className="py-2 pr-4 font-medium">Applies to</th>
              <th scope="col" className="py-2 pr-4 font-medium">Rate / hour</th>
              <th scope="col" className="py-2 pr-4 font-medium">Priority</th>
              <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {all.map((rule) => (
              <tr key={rule.id} className="border-b border-ink-100 align-middle">
                <td className="py-3 pr-4 font-medium text-felt-900">{rule.name}</td>
                <td className="py-3 pr-4">{appliesTo(rule)}</td>
                <td className="py-3 pr-4 tabular-nums">{formatPence(rule.hourlyRatePence)}</td>
                <td className="py-3 pr-4 tabular-nums">{rule.priority}</td>
                <td className="py-3 pr-4">{rule.active ? 'Active' : 'Inactive'}</td>
                <td className="py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing(editing === rule.id ? null : rule.id)}
                      aria-expanded={editing === rule.id}
                    >
                      {editing === rule.id ? 'Close' : 'Edit'}
                    </Button>
                    {/* Deleting the last rule that can price anything is refused by the server.
                        Saying so here means staff are not left guessing why the button failed. */}
                    {isLastActiveCatchAll(all, rule) ? (
                      <span className="self-center text-xs text-ink-500">
                        Required — the club&rsquo;s fallback rate
                      </span>
                    ) : confirmingDelete === rule.id ? (
                      <>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={deleteRule.isPending}
                          onClick={() => remove(rule.id)}
                        >
                          {deleteRule.isPending ? 'Deleting…' : 'Confirm delete'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingDelete(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingDelete(rule.id)}
                        aria-label={`Delete ${rule.name}`}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing === null ? (
        <Button className="mt-5" variant="secondary" onClick={() => setEditing('new')}>
          Add a pricing rule
        </Button>
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          aria-label={editing === 'new' ? 'Add a pricing rule' : 'Edit pricing rule'}
          className="mt-5 space-y-5 rounded-card border border-ink-200 bg-ink-50 p-5"
        >
          <h3 className="text-base font-semibold text-felt-900">
            {editing === 'new' ? 'Add a pricing rule' : 'Edit pricing rule'}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Rule name"
              error={errors.name?.message}
              hint="What staff will recognise it by, e.g. “Weekend evenings”."
              {...register('name')}
            />
            <TextField
              label="Rate per hour (£)"
              type="number"
              step="0.01"
              min="0.01"
              error={errors.ratePounds?.message}
              hint="In pounds. Stored to the penny."
              {...register('ratePounds')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="pricing-table-type"
                className="block text-sm font-medium text-felt-900"
              >
                Table type
              </label>
              <select
                id="pricing-table-type"
                className="mt-1.5 block w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-inset focus:ring-felt-600 focus:outline-none"
                {...register('tableType')}
              >
                <option value={ANY}>Any table</option>
                {Object.entries(TABLE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Controller rather than register(): this is a button-and-popover, not a native
                input, so there is no DOM element for react-hook-form to bind to directly. */}
            <Controller
              control={control}
              name="daysOfWeek"
              render={({ field }) => (
                <CheckboxDropdown
                  legend="Days"
                  options={WEEK.map((day) => ({
                    value: day,
                    // Full name for the list and for screen readers; the abbreviation only
                    // appears on the closed button, where seven full names would not fit.
                    label: WEEKDAY_LABEL[day],
                    shortLabel: WEEKDAY_LABEL[day].slice(0, 3),
                  }))}
                  selected={field.value}
                  onChange={field.onChange}
                  emptyLabel="Every day"
                  summary={describeDays(field.value as Weekday[])}
                  hint="Leave all unticked to apply every day."
                />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="From (optional)"
              type="time"
              error={errors.startTime?.message}
              {...register('startTime')}
            />
            <TextField
              label="Until (optional)"
              type="time"
              error={errors.endTime?.message}
              hint="Leave both blank to apply at any time."
              {...register('endTime')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Priority"
              type="number"
              error={errors.priority?.message}
              hint="Higher wins when more than one rule matches."
              {...register('priority')}
            />
            <label className="flex items-end gap-2 pb-2.5 text-sm text-ink-700">
              <input type="checkbox" className="mb-0.5" {...register('active')} />
              Active
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting || saveRule.isPending}>
              {saveRule.isPending ? 'Saving…' : 'Save rule'}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
