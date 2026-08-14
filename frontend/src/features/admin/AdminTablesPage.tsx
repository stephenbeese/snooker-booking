import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiError';
import { useTableTypeLabel, useTableTypes } from '@/features/availability/useAvailability';
import {
  useAdminTables,
  useCreateTable,
  useReorderTables,
  useSetTableActive,
  useUpdateTable,
} from './useAdmin';
import type { AdminTable, TableType } from './types';

const schema = z.object({
  name: z.string().min(1, 'Give the table a name').max(100),
  // A plain string, not an enum: since Phase 7 the types are rows a manager can add, so a
  // closed list here would reject a type the club had just created. The server checks the
  // code against the table_type table, which is the only place that can know.
  tableType: z.string().min(1, 'Choose a type'),
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
  const { data: tableTypes } = useTableTypes();
  const typeLabel = useTableTypeLabel();
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const setActive = useSetTableActive();
  const reorder = useReorderTables();
  const toast = useToast();

  const [editing, setEditing] = useState<AdminTable | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  /**
   * Moves one table to another position and sends the whole new order.
   *
   * <p>Positions come from the rendered list rather than from `displayOrder`, which is not
   * unique — two tables sharing a number would otherwise swap unpredictably.
   */
  function move(from: number, to: number) {
    if (!tables || to < 0 || to >= tables.length) return;
    const ids = tables.map((table) => table.id);
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder.mutate(ids, {
      // Rows visibly move either way — a drag rearranges them on screen whether or not the
      // PUT succeeded. Without this there is nothing distinguishing "saved" from "will snap
      // back on the next refetch".
      onSuccess: () => toast('Table order saved.'),
    });
  }

  /** Drops the dragged table onto the target's position. */
  function dropOn(targetId: number) {
    if (dragging === null || dragging === targetId || !tables) return;
    const ids = tables.map((table) => table.id);
    const from = ids.indexOf(dragging);
    const to = ids.indexOf(targetId);
    setDragging(null);
    if (from < 0 || to < 0) return;
    move(from, to);
  }

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
        // Named, because editing collapses the form back to "Add a table" — leaving no trace
        // on screen of which table was just changed.
        toast(`${input.name} saved.`);
      } else {
        await createTable.mutateAsync(input);
        toast(`${input.name} added.`);
      }
      setEditing(null);
      reset();
    } catch {
      // Surfaced from the mutation error below.
    }
  }

  async function toggleOnSale(table: AdminTable) {
    const updated = await setActive
      .mutateAsync({ id: table.id, active: !table.active })
      .catch(() => null);
    if (!updated) return;
    toast(
      updated.active
        ? `${updated.name} is back on sale.`
        : `${updated.name} taken off sale. Existing bookings still stand.`,
    );
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

        <Select label="Type" error={errors.tableType?.message} {...register('tableType')}>
          {(tableTypes ?? []).map((type) => (
            <option key={type.code} value={type.code}>
              {type.label}
            </option>
          ))}
        </Select>

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
            <th scope="col" className="py-2 pr-2 font-medium">
              <span className="sr-only">Reorder</span>
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">Name</th>
            <th scope="col" className="py-2 pr-4 font-medium">Type</th>
            <th scope="col" className="py-2 pr-4 font-medium">Order</th>
            <th scope="col" className="py-2 pr-4 font-medium">Status</th>
            <th scope="col" className="py-2 pr-4 font-medium">Notes</th>
            <th scope="col" className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table, index) => (
            <tr
              key={table.id}
              draggable
              onDragStart={() => setDragging(table.id)}
              onDragEnd={() => setDragging(null)}
              // Without preventDefault the drop never fires — the browser's default is to
              // refuse the drag.
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(table.id)}
              className={[
                'border-b border-ink-100',
                table.active ? '' : 'text-ink-400',
                dragging === table.id ? 'opacity-40' : '',
              ].join(' ')}
            >
              <td className="py-3 pr-2">
                {/* Dragging alone would put reordering out of reach of anyone using a keyboard
                    or a screen reader, so the same operation is also two ordinary buttons.
                    The grip is decorative and hidden from assistive technology; the buttons
                    are the accessible path, and they are not a lesser one — on a phone they
                    are easier than dragging. */}
                <div className="flex items-center gap-1">
                  <span aria-hidden="true" className="cursor-grab text-ink-400">
                    ⠿
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      className="px-1 text-xs text-ink-500 hover:text-felt-900 disabled:opacity-30"
                      disabled={index === 0 || reorder.isPending}
                      aria-label={`Move ${table.name} up`}
                      onClick={() => move(index, index - 1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="px-1 text-xs text-ink-500 hover:text-felt-900 disabled:opacity-30"
                      disabled={index === tables.length - 1 || reorder.isPending}
                      aria-label={`Move ${table.name} down`}
                      onClick={() => move(index, index + 1)}
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </td>
              <td className="py-3 pr-4 font-medium">{table.name}</td>
              <td className="py-3 pr-4">{typeLabel(table.tableType)}</td>
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
                    onClick={() => void toggleOnSale(table)}
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
