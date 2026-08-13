import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/apiError';
import { useAdminTables, useCreateTable, useSetTableActive, useUpdateTable } from './useAdmin';
import type { AdminTable, TableType } from './types';

const TABLE_TYPES: { value: TableType; label: string }[] = [
  { value: 'SNOOKER', label: 'Snooker' },
  { value: 'ENGLISH_POOL', label: 'English pool' },
  { value: 'AMERICAN_POOL', label: 'American pool' },
];

const schema = z.object({
  name: z.string().min(1, 'Give the table a name').max(100),
  tableType: z.enum(['SNOOKER', 'ENGLISH_POOL', 'AMERICAN_POOL']),
  // Coerced because a number input still hands back a string.
  displayOrder: z.coerce.number().int().min(0, 'Order cannot be negative'),
  // Always present, empty meaning "none" — see RegisterPage for why this is not .optional().
  notes: z.string().max(500),
});

type FormValues = z.input<typeof schema>;

/**
 * Table management.
 *
 * <p>There is no delete, and the page says so where staff would go looking for one. Bookings
 * reference the table they were played on, so removing a table would either destroy the club's
 * own history or orphan it. Deactivating takes it off sale and out of the availability grid
 * while leaving every past booking explicable.
 */
export function AdminTablesPage() {
  const { data: tables, isPending, isError, error } = useAdminTables();
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const setActive = useSetTableActive();

  const [editing, setEditing] = useState<AdminTable | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', tableType: 'SNOOKER', displayOrder: 0, notes: '' },
  });

  useEffect(() => {
    reset(
      editing
        ? {
            name: editing.name,
            tableType: editing.tableType,
            displayOrder: editing.displayOrder,
            notes: editing.notes ?? '',
          }
        : { name: '', tableType: 'SNOOKER', displayOrder: 0, notes: '' },
    );
  }, [editing, reset]);

  async function onSubmit(values: FormValues) {
    const input = {
      name: values.name.trim(),
      tableType: values.tableType as TableType,
      displayOrder: Number(values.displayOrder),
      notes: values.notes.trim() || null,
    };
    try {
      if (editing) {
        await updateTable.mutateAsync({ id: editing.id, input });
      } else {
        await createTable.mutateAsync(input);
      }
      setEditing(null);
      reset();
    } catch {
      // Surfaced from the mutation error below.
    }
  }

  const mutationError = createTable.error ?? updateTable.error ?? setActive.error;
  const errorMessage =
    mutationError instanceof ApiError
      ? mutationError.message
      : mutationError
        ? 'Could not save that table.'
        : null;

  if (isPending) return <p className="text-ink-600">Loading tables…</p>;
  if (isError) {
    return (
      <p role="alert" className="text-rose-700">
        {error instanceof ApiError ? error.message : 'Could not load tables.'}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Tables</h1>
      <p className="mt-2 text-sm text-ink-600">
        Tables are taken off sale rather than deleted, because past bookings refer to them. An
        inactive table disappears from the booking grid straight away.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 space-y-5 rounded-card border border-ink-200 bg-white p-6 shadow-card"
        noValidate
        aria-label={editing ? 'Edit table' : 'Add a table'}
      >
        <h2 className="text-lg font-semibold text-felt-900">
          {editing ? `Edit ${editing.name}` : 'Add a table'}
        </h2>

        <TextField label="Name" error={errors.name?.message} {...register('name')} />

        <div>
          <label
            htmlFor="tableType"
            className="block text-sm font-medium text-felt-900"
          >
            Type
          </label>
          <select
            id="tableType"
            className="mt-1.5 block w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-inset focus:ring-felt-600 focus:outline-none"
            {...register('tableType')}
          >
            {TABLE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <TextField
          label="Display order"
          type="number"
          hint="Lower numbers appear first in the booking grid."
          error={errors.displayOrder?.message}
          {...register('displayOrder')}
        />

        <TextField
          label="Notes"
          hint="Staff only — never shown to customers."
          error={errors.notes?.message}
          {...register('notes')}
        />

        {errorMessage && (
          <p role="alert" className="text-sm font-medium text-rose-700">
            {errorMessage}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add table'}
          </Button>
          {editing && (
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      <table className="mt-8 w-full border-collapse text-sm">
        <caption className="sr-only">Club tables</caption>
        <thead>
          <tr className="border-b border-ink-200 text-left text-ink-600">
            <th scope="col" className="py-2 pr-4 font-medium">Name</th>
            <th scope="col" className="py-2 pr-4 font-medium">Type</th>
            <th scope="col" className="py-2 pr-4 font-medium">Order</th>
            <th scope="col" className="py-2 pr-4 font-medium">Status</th>
            <th scope="col" className="py-2 pr-4 font-medium">Notes</th>
            <th scope="col" className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table) => (
            <tr
              key={table.id}
              className={`border-b border-ink-100 ${table.active ? '' : 'text-ink-400'}`}
            >
              <td className="py-3 pr-4 font-medium">{table.name}</td>
              <td className="py-3 pr-4">
                {TABLE_TYPES.find((t) => t.value === table.tableType)?.label ?? table.tableType}
              </td>
              <td className="py-3 pr-4">{table.displayOrder}</td>
              <td className="py-3 pr-4">{table.active ? 'On sale' : 'Inactive'}</td>
              <td className="py-3 pr-4">{table.notes ?? '—'}</td>
              <td className="py-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(table)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={setActive.isPending}
                    onClick={() => setActive.mutate({ id: table.id, active: !table.active })}
                  >
                    {table.active ? 'Take off sale' : 'Put on sale'}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
