import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiError';
import { formatPence, penceToPounds, poundsToPence } from '@/lib/money';
import { useCafeItems, useCreateCafeItem, useSetCafeItemActive, useUpdateCafeItem } from './useAdmin';
import type { CafeItem } from './types';

const schema = z.object({
  name: z.string().min(1, 'Give the item a name').max(120),
  // Always present, empty meaning "none", matching every other optional field in this codebase.
  description: z.string().max(500),
  /**
   * Pounds as a person types them, validated here and converted to pence on submit.
   *
   * <p>Not `z.coerce.number()`: "" coerces to 0, so an empty price would save as free rather
   * than being rejected. `poundsToPence` returns null for anything unusable, which is the same
   * check the pricing rule editor makes.
   */
  price: z
    .string()
    .min(1, 'Give the item a price')
    .refine((value) => poundsToPence(value) !== null, 'Enter a price like 2.50')
    .refine((value) => (poundsToPence(value) ?? -1) >= 0, 'A price cannot be negative'),
  imageUrl: z.string().max(2000),
});

type FormValues = z.input<typeof schema>;

const EMPTY: FormValues = { name: '', description: '', price: '', imageUrl: '' };

/**
 * The cafe and bar menu.
 *
 * <p>A priced list and nothing more. There are no bills, no stock counts and no till — those need
 * decisions nobody has made, and guessing at them here would put a schema behind the guess.
 *
 * <p>Items are withdrawn rather than deleted, as tables are, so a menu that changed last summer
 * still explains a receipt from last summer.
 */
export function AdminCafePage() {
  const { data: items, isPending, isError, error } = useCafeItems();
  const createItem = useCreateCafeItem();
  const updateItem = useUpdateCafeItem();
  const setActive = useSetCafeItemActive();
  const toast = useToast();

  const [editing, setEditing] = useState<CafeItem | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    reset(
      editing
        ? {
            name: editing.name,
            description: editing.description ?? '',
            // penceToPounds, not formatPence: "£2.75" is not something a number field can
            // parse back out again.
            price: penceToPounds(editing.pricePence),
            imageUrl: editing.imageUrl ?? '',
          }
        : EMPTY,
    );
  }, [editing, reset]);

  async function onSubmit(values: FormValues) {
    const pricePence = poundsToPence(values.price);
    // Already guaranteed by the schema; the check is here so the type narrows without a
    // non-null assertion that would silently send NaN if the schema ever changed.
    if (pricePence === null) return;

    const input = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      pricePence,
      imageUrl: values.imageUrl.trim() || null,
    };

    try {
      if (editing) {
        await updateItem.mutateAsync({ id: editing.id, input });
        // Named and priced, because saving collapses the form back to "Add an item" and leaves
        // nothing on screen saying which one changed.
        toast(`${input.name} saved at ${formatPence(pricePence)}.`);
      } else {
        await createItem.mutateAsync(input);
        toast(`${input.name} added at ${formatPence(pricePence)}.`);
      }
      setEditing(null);
      reset(EMPTY);
    } catch {
      // Surfaced from the mutation error below.
    }
  }

  async function toggleOnMenu(item: CafeItem) {
    const updated = await setActive
      .mutateAsync({ id: item.id, active: !item.active })
      .catch(() => null);
    if (!updated) return;
    toast(
      updated.active ? `${updated.name} is back on the menu.` : `${updated.name} taken off the menu.`,
    );
  }

  const mutationError = createItem.error ?? updateItem.error ?? setActive.error;
  const errorMessage =
    mutationError instanceof ApiError
      ? mutationError.message
      : mutationError
        ? 'Could not save that item.'
        : null;

  if (isPending) return <p className="text-ink-600">Loading the menu…</p>;
  if (isError) {
    return (
      <p role="alert" className="text-rose-700">
        {error instanceof ApiError ? error.message : 'Could not load the menu.'}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Cafe &amp; bar</h1>
      <p className="mt-2 text-sm text-ink-600">
        What the club sells alongside table time. Items are taken off the menu rather than
        deleted, so a withdrawn one can be put back and still explains itself later.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 space-y-5 rounded-card border border-ink-200 bg-white p-6 shadow-card"
        noValidate
        aria-label={editing ? 'Edit item' : 'Add an item'}
      >
        <h2 className="text-lg font-semibold text-felt-900">
          {editing ? `Edit ${editing.name}` : 'Add an item'}
        </h2>

        <TextField label="Name" error={errors.name?.message} {...register('name')} />

        <TextField
          label="Price"
          // Not type="number": a spinner on a price invites a stray scroll to change it, and
          // inputMode already brings up the numeric keypad on a phone.
          inputMode="decimal"
          hint="In pounds, e.g. 2.50. Free items are allowed."
          error={errors.price?.message}
          {...register('price')}
        />

        <TextField
          label="Description"
          hint="Optional. Shown with the item."
          error={errors.description?.message}
          {...register('description')}
        />

        <TextField
          label="Image URL"
          type="url"
          hint="Optional. A link to a picture the club already hosts."
          error={errors.imageUrl?.message}
          {...register('imageUrl')}
        />

        {errorMessage && (
          <p role="alert" className="text-sm font-medium text-rose-700">
            {errorMessage}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
          </Button>
          {editing && (
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-ink-600">Nothing on the menu yet.</p>
      ) : (
        <table className="mt-8 w-full border-collapse text-sm">
          <caption className="sr-only">Cafe and bar menu</caption>
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-600">
              <th scope="col" className="py-2 pr-4 font-medium">Item</th>
              <th scope="col" className="py-2 pr-4 font-medium">Price</th>
              <th scope="col" className="py-2 pr-4 font-medium">Description</th>
              <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={['border-b border-ink-100', item.active ? '' : 'text-ink-400'].join(' ')}
              >
                <td className="py-3 pr-4 font-medium">{item.name}</td>
                <td className="py-3 pr-4">{formatPence(item.pricePence)}</td>
                <td className="py-3 pr-4">{item.description ?? '—'}</td>
                <td className="py-3 pr-4">{item.active ? 'On the menu' : 'Withdrawn'}</td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing(item)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={setActive.isPending}
                      onClick={() => void toggleOnMenu(item)}
                    >
                      {item.active ? 'Take off menu' : 'Put back'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
