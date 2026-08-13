import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/apiError';
import { formatPence } from '@/lib/money';
import { useAdminTables, useCreateTelephoneBooking } from './useAdmin';
import type { AdminBooking } from './types';

const DURATIONS = [60, 90, 120, 180, 240];

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
 */
export function AdminTelephoneBookingPage() {
  const navigate = useNavigate();
  const { data: tables } = useAdminTables();
  const createBooking = useCreateTelephoneBooking();
  const [created, setCreated] = useState<AdminBooking | null>(null);

  const {
    register,
    handleSubmit,
    reset,
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Telephone booking</h1>
      <p className="mt-2 text-sm text-ink-600">
        Confirmed straight away, with no online payment — take payment at the counter. Notice
        and advance limits do not apply, but the table must genuinely be free.
      </p>

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

        <div>
          <label htmlFor="phoneTable" className="block text-sm font-medium text-felt-900">
            Table
          </label>
          <select
            id="phoneTable"
            className="mt-1.5 block w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-inset focus:ring-felt-600 focus:outline-none"
            {...register('tableId')}
          >
            <option value="">Choose a table…</option>
            {activeTables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
          {errors.tableId && (
            <p className="mt-1.5 text-xs font-medium text-rose-700">{errors.tableId.message}</p>
          )}
        </div>

        <TextField label="Date" type="date" error={errors.date?.message} {...register('date')} />
        <TextField
          label="Start time"
          type="time"
          error={errors.startTime?.message}
          {...register('startTime')}
        />

        <div>
          <label htmlFor="phoneDuration" className="block text-sm font-medium text-felt-900">
            Duration
          </label>
          <select
            id="phoneDuration"
            className="mt-1.5 block w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-inset focus:ring-felt-600 focus:outline-none"
            {...register('durationMinutes')}
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </div>

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
    </div>
  );
}
