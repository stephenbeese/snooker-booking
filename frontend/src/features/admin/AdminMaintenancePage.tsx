import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/apiError';
import { formatSlotTime } from '@/lib/datetime';
import {
  useAdminTables,
  useCreateMaintenanceBlock,
  useDeleteMaintenanceBlock,
  useMaintenanceBlocks,
} from './useAdmin';

const schema = z
  .object({
    tableId: z.coerce.number().int().positive('Choose a table'),
    date: z.string().min(1, 'Choose a date'),
    startTime: z.string().min(1, 'Choose a start time'),
    endTime: z.string().min(1, 'Choose an end time'),
    notes: z.string().max(500),
  })
  // Checked here as well as on the server so the obvious mistake is caught without a round
  // trip. The server is still the control — this is only a convenience.
  .refine((values) => values.endTime > values.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  });

type FormValues = z.input<typeof schema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Taking tables out of service.
 *
 * <p>The server refuses a block that would cover existing bookings, and names them. That
 * refusal is surfaced verbatim rather than replaced with a generic message: knowing *which*
 * bookings are in the way is the difference between staff being able to act and having to go
 * hunting.
 */
export function AdminMaintenancePage() {
  const [from, setFrom] = useState(today);
  const to = addDays(from, 30);

  const { data: tables } = useAdminTables();
  const { data: blocks, isPending, isError, error } = useMaintenanceBlocks(from, to);
  const createBlock = useCreateMaintenanceBlock();
  const deleteBlock = useDeleteMaintenanceBlock();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: today(), startTime: '09:00', endTime: '12:00', notes: '' },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createBlock.mutateAsync({
        tableId: Number(values.tableId),
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
        reason: values.notes.trim() || null,
      });
      reset({ date: values.date, startTime: '09:00', endTime: '12:00', notes: '' });
    } catch {
      // Surfaced below.
    }
  }

  const mutationError = createBlock.error ?? deleteBlock.error;
  const errorMessage =
    mutationError instanceof ApiError
      ? mutationError.message
      : mutationError
        ? 'Could not save that maintenance block.'
        : null;

  const activeTables = (tables ?? []).filter((table) => table.active);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Maintenance</h1>
      <p className="mt-2 text-sm text-ink-600">
        A blocked table cannot be booked, by customers or by staff. Existing bookings are never
        overwritten — if any fall inside the period, the block is refused and they are listed so
        you can deal with them first.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 space-y-5 rounded-card border border-ink-200 bg-white p-6 shadow-card"
        noValidate
        aria-label="Add a maintenance block"
      >
        <h2 className="text-lg font-semibold text-felt-900">Block a table</h2>

        <Select label="Table" error={errors.tableId?.message} {...register('tableId')}>
            <option value="">Choose a table…</option>
            {activeTables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
        </Select>

        <TextField label="Date" type="date" error={errors.date?.message} {...register('date')} />
        <TextField
          label="From"
          type="time"
          error={errors.startTime?.message}
          {...register('startTime')}
        />
        <TextField
          label="Until"
          type="time"
          error={errors.endTime?.message}
          {...register('endTime')}
        />
        <TextField
          label="Reason"
          hint="Shown to staff only, e.g. “re-clothing”."
          error={errors.notes?.message}
          {...register('notes')}
        />

        {errorMessage && (
          <p role="alert" className="text-sm font-medium text-rose-700">
            {errorMessage}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Block table'}
        </Button>
      </form>

      <div className="mt-10 flex items-end gap-3">
        <TextField
          label="Showing 30 days from"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </div>

      {isPending && <p className="mt-4 text-ink-600">Loading…</p>}
      {isError && (
        <p role="alert" className="mt-4 text-rose-700">
          {error instanceof ApiError ? error.message : 'Could not load maintenance blocks.'}
        </p>
      )}

      {blocks && blocks.length === 0 && (
        <p className="mt-4 text-ink-600">No maintenance is scheduled in this period.</p>
      )}

      {blocks && blocks.length > 0 && (
        <table className="mt-4 w-full border-collapse text-sm">
          <caption className="sr-only">Scheduled maintenance</caption>
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-600">
              <th scope="col" className="py-2 pr-4 font-medium">Table</th>
              <th scope="col" className="py-2 pr-4 font-medium">Date</th>
              <th scope="col" className="py-2 pr-4 font-medium">Time</th>
              <th scope="col" className="py-2 pr-4 font-medium">Reason</th>
              <th scope="col" className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block) => (
              <tr key={block.id} className="border-b border-ink-100">
                <td className="py-3 pr-4 font-medium">{block.tableName}</td>
                <td className="py-3 pr-4">{block.date}</td>
                <td className="py-3 pr-4">
                  {formatSlotTime(block.startTime)}–{formatSlotTime(block.endTime)}
                </td>
                <td className="py-3 pr-4">{block.reason ?? '—'}</td>
                <td className="py-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={deleteBlock.isPending}
                    onClick={() => deleteBlock.mutate(block.id)}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
