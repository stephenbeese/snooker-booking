import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { PageShell } from '@/components/ui/PageShell';
import { AvailabilityGrid } from '@/features/availability/components/AvailabilityGrid';
import type { Slot } from '@/features/availability/types';
import { useAdminAvailability, useTableTypeLabel } from '@/features/availability/useAvailability';
import { ApiError } from '@/lib/apiError';
import { addMinutesToTime, formatDuration, formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { useAdminTables, useCreateTelephoneBooking } from './useAdmin';
import type { AdminBooking } from './types';

const schema = z.object({
  tableId: z.coerce.number().int().positive('Choose a table'),
  date: z.string().min(1, 'Choose a date'),
  startTime: z.string().min(1, 'Choose a start time'),
  durationMinutes: z.coerce.number().int().positive(),
  customerEmail: z.email('Enter a valid email address').max(255),
  firstName: z.string().min(1, "Enter the caller's first name").max(100),
  lastName: z.string().min(1, "Enter the caller's last name").max(100),
  customerPhone: z.string().regex(/^$|^[0-9 +()-]{7,20}$/, 'Enter a valid phone number'),
  notes: z.string().max(500),
});

type FormValues = z.input<typeof schema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Taking a booking over the telephone.
 *
 * <p>Confirmed immediately with no payment: the customer is on the phone, and payment is
 * settled at the counter. The email is the identity — an existing account is reused, so the
 * booking appears in that customer's own dashboard rather than on a duplicate shell account.
 *
 * <p>No price field. The server prices the booking from the club's own rules, and a figure
 * typed here would either be ignored or, worse, believed.
 *
 * <h2>The grid</h2>
 *
 * <p>Staff previously typed a time blind and discovered on submit whether the table was free.
 * The grid is fed by {@code /api/admin/availability} — the same service the public page uses,
 * under {@code BookingPolicy.staff()}, so what it offers is exactly what the create endpoint
 * accepts: notice and advance limits lifted, occupied and maintenance slots still refused.
 *
 * <p>The time field stays, and stays editable. The grid is an affordance, not a constraint:
 * staff could always key an arbitrary time, and taking that away to make the picker
 * authoritative would remove a freedom the backend still grants them.
 */
export function AdminTelephoneBookingPage() {
  const navigate = useNavigate();
  const { data: tables } = useAdminTables();
  const createBooking = useCreateTelephoneBooking();
  const [created, setCreated] = useState<AdminBooking | null>(null);
  // Narrows the grid to one table. Not part of the form: it changes what staff are looking
  // at, not what gets booked — the booked table is whichever cell they click.
  const [filterTableId, setFilterTableId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: today(),
      startTime: '19:00',
      durationMinutes: 60,
      customerPhone: '',
      notes: '',
    },
  });

  // Watched rather than read on submit: the grid is driven by the same date and duration the
  // form holds, so a change to either must re-query rather than leave a stale grid on screen.
  const date = watch('date');
  const durationMinutes = Number(watch('durationMinutes')) || undefined;
  const tableId = Number(watch('tableId')) || null;
  const startTime = watch('startTime');
  const typeLabel = useTableTypeLabel();

  const { data: availability, isPending: availabilityPending } = useAdminAvailability({
    date,
    durationMinutes,
    ...(filterTableId !== null ? { tableIds: [filterTableId] } : {}),
  });

  function selectSlot(pickedTableId: number, slot: Slot) {
    // Both fields, together: a cell identifies a table and a time, and setting only one
    // would leave the form describing a slot nobody picked.
    setValue('tableId', pickedTableId, { shouldValidate: true });
    // The form's time input is HH:mm; the slot carries HH:mm:ss.
    setValue('startTime', slot.startTime.slice(0, 5), { shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    try {
      const booking = await createBooking.mutateAsync({
        tableId: Number(values.tableId),
        date: values.date,
        startTime: values.startTime,
        durationMinutes: Number(values.durationMinutes),
        customerEmail: values.customerEmail.trim(),
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        customerPhone: values.customerPhone.trim() || null,
        notes: values.notes.trim() || null,
      });
      setCreated(booking);
      reset({
        date: values.date,
        startTime: '19:00',
        durationMinutes: 60,
        customerPhone: '',
        notes: '',
      });
    } catch {
      // Surfaced below. The server's message is the useful one — it distinguishes "that slot
      // has gone" from "the club is closed then" from "that table is being re-clothed".
    }
  }

  const errorMessage =
    createBooking.error instanceof ApiError
      ? createBooking.error.message
      : createBooking.error
        ? 'Could not take that booking.'
        : null;

  const activeTables = (tables ?? []).filter((table) => table.active);

  // The grid marks a cell selected by table and absolute instant, so the form's date and
  // local time have to be resolved back to the slot they name. Matching on startTime rather
  // than recomputing an instant keeps the browser's timezone out of it — the server already
  // resolved the club's.
  const selectedSlot = availability?.tables
    .find((row) => row.tableId === tableId)
    ?.slots.find((slot) => slot.startTime.slice(0, 5) === startTime);
  const gridSelection =
    tableId !== null && selectedSlot ? { tableId, startAt: selectedSlot.startAt } : null;

  return (
    <PageShell
      title="New booking"
      description="Confirmed straight away, with no online payment — take payment at the counter. Notice and advance limits do not apply, but the table must genuinely be free."
    >

      {created && (
        <div
          role="status"
          className="mt-6 rounded-card border border-felt-200 bg-felt-50 p-4 text-sm text-felt-900"
        >
          <p className="font-semibold">Booked — {created.reference}</p>
          <p className="mt-1">
            {created.tableName}, {created.date} at {created.startTime.slice(0, 5)} for{' '}
            {created.durationMinutes} minutes. {formatPence(created.pricePence)} to collect.
          </p>
          <button
            type="button"
            className="mt-2 underline"
            onClick={() => navigate(`/admin/bookings/${created.reference}`)}
          >
            View booking
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 space-y-5 rounded-card border border-ink-200 bg-white p-6 shadow-card"
        noValidate
      >
        <h2 className="text-lg font-semibold text-felt-900">The slot</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Date" type="date" error={errors.date?.message} {...register('date')} />

          <Select label="Duration" {...register('durationMinutes')}>
              {/* From the server, never derived here. A hardcoded list drifts the moment
                  someone edits the club's min/max/increment settings.

                  The default duration is offered until the real options arrive: a select
                  with no options renders blank and, on the first change, submits whatever
                  the browser picked rather than what the form's default said. */}
              {(availability?.durationOptions ?? [{ minutes: 60, label: '1 hour' }]).map(
                (option) => (
                  <option key={option.minutes} value={option.minutes}>
                    {option.label}
                  </option>
                ),
              )}
            </Select>
        </div>

        <Select
            label="Show"
            className="sm:max-w-xs"
            value={filterTableId ?? ''}
            onChange={(event) =>
              setFilterTableId(event.target.value === '' ? null : Number(event.target.value))
            }
          >
            <option value="">All tables</option>
            {activeTables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </Select>

        <div aria-live="polite" aria-busy={availabilityPending}>
          {availabilityPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-11 animate-pulse rounded-lg bg-ink-100" />
              ))}
            </div>
          ) : (
            availability && (
              <AvailabilityGrid
                availability={availability}
                selected={gridSelection}
                // Staff see the same span and the same type labels as a customer does: the
                // point of putting the grid on this screen was that the two agree.
                durationMinutes={durationMinutes ?? null}
                typeLabel={typeLabel}
                onSelect={selectSlot}
              />
            )
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Table" error={errors.tableId?.message} {...register('tableId')}>
              <option value="">Choose a table…</option>
              {activeTables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </Select>

          {/* Still editable. The grid fills it in, and staff may overwrite it: the backend
              lets them book a time the customer grid would refuse, and the picker must not
              quietly take that away. */}
          <TextField
            label="Start time"
            type="time"
            hint="Filled in by the grid; edit it to book an off-grid time."
            error={errors.startTime?.message}
            {...register('startTime')}
          />
        </div>

        {/* What is about to be booked, in words. The grid says which cell is lit; this says
            what that means once the duration is applied. */}
        {tableId !== null && startTime && (
          <p className="rounded-lg bg-felt-50 px-3.5 py-2.5 text-sm text-felt-900">
            {activeTables.find((table) => table.id === tableId)?.name ?? `Table ${tableId}`} ·{' '}
            {formatSlotTime(startTime)}
            {durationMinutes !== undefined && (
              <>
                –{addMinutesToTime(startTime, durationMinutes)} · {formatDuration(durationMinutes)}
              </>
            )}
            {selectedSlot?.pricePenceForRequestedDuration != null &&
              ` · ${formatPence(selectedSlot.pricePenceForRequestedDuration)}`}
          </p>
        )}

        <h2 className="pt-2 text-lg font-semibold text-felt-900">The caller</h2>
        <p className="text-sm text-ink-600">
          If they already have an account, this booking is added to it.
        </p>

        <TextField
          label="Email address"
          type="email"
          error={errors.customerEmail?.message}
          {...register('customerEmail')}
        />
        <TextField
          label="First name"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField label="Last name" error={errors.lastName?.message} {...register('lastName')} />
        <TextField
          label="Phone number"
          error={errors.customerPhone?.message}
          {...register('customerPhone')}
        />
        <TextField
          label="Notes"
          hint="Staff only."
          error={errors.notes?.message}
          {...register('notes')}
        />

        {errorMessage && (
          <p role="alert" className="text-sm font-medium text-rose-700">
            {errorMessage}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Booking…' : 'Take booking'}
        </Button>
      </form>
    </PageShell>
  );
}
