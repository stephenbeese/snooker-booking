import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { AvailabilityGrid } from '@/features/availability/components/AvailabilityGrid';
import { useAdminAvailability, useTableTypeLabel } from '@/features/availability/useAvailability';
import { isAdmin } from '@/features/auth/types';
import { useCurrentUser } from '@/features/auth/useAuth';
import { ApiError } from '@/lib/apiError';
import { formatSlotTime } from '@/lib/datetime';
import { useAmendBooking } from '../useAdmin';
import type { AdminBooking } from '../types';
import type { Slot } from '@/features/availability/types';

/**
 * Moving a booking to another time or table.
 *
 * <p>Staff used to cancel and re-book, which loses the reference the customer was given, raises
 * a refund decision if they had paid, and re-prices at today's rates. Moving keeps all three.
 *
 * <p>Admin only, and the server enforces that — this hides a control staff cannot use rather
 * than deciding anything. Cancelling remains staff work; who may rearrange the day is a
 * separate question from who may release a table.
 *
 * <p>The grid is the same component and the same endpoint the new-booking screen uses, under
 * the staff policy, so what it offers here is exactly what the amend endpoint will accept.
 */
export function AmendBookingPanel({ booking }: { booking: AdminBooking }) {
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(booking.date);
  const [picked, setPicked] = useState<{ tableId: number; startAt: string } | null>(null);
  const amend = useAmendBooking();
  const toast = useToast();
  const typeLabel = useTableTypeLabel();

  const { data: availability, isPending } = useAdminAvailability({
    date,
    // Only fetched once the panel is open: the detail page is read far more often than a
    // booking is moved, and this is a second request against the whole day.
    enabled: open,
  });

  // A live booking only. A cancelled or finished one has nothing left to move, and the server
  // refuses it — offering the control anyway would be a button whose only outcome is an error.
  if (!user || !isAdmin(user.role) || booking.status === 'CANCELLED'
      || booking.status === 'EXPIRED' || booking.status === 'COMPLETED'
      || booking.status === 'NO_SHOW') {
    return null;
  }

  function submit() {
    if (!picked) {
      return;
    }
    amend.mutate(
      {
        reference: booking.reference,
        tableId: picked.tableId,
        date,
        // The grid deals in instants; the endpoint wants the club's own wall clock, which is
        // what the slot's own start time already is.
        startTime: startTimeOf(picked.startAt, availability),
        durationMinutes: booking.durationMinutes,
      },
      {
        onSuccess: (moved) => {
          setOpen(false);
          setPicked(null);
          toast(
            `Booking ${moved.reference} moved to ${moved.tableName}, ` +
              `${formatSlotTime(moved.startTime)}.`,
          );
        },
      },
    );
  }

  const errorMessage =
    amend.error instanceof ApiError
      ? amend.error.message
      : amend.error
        ? 'Could not move this booking. Please try again.'
        : null;

  if (!open) {
    return (
      <div className="mt-6">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Move this booking
        </Button>
      </div>
    );
  }

  return (
    <section className="mt-6 rounded-card border border-ink-200 bg-white p-5 shadow-card">
      <h3 className="font-medium text-felt-900">Move this booking</h3>
      <p className="mt-1 text-sm text-ink-600">
        Keeps the reference and the original price of{' '}
        {booking.durationMinutes} minutes. Pick the new time below.
      </p>

      <div className="mt-4">
        <label htmlFor="amend-date" className="block text-sm font-medium text-felt-900">
          Date
        </label>
        <input
          id="amend-date"
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            // A selection on the old day means nothing on the new one, and leaving it would
            // submit a slot the user can no longer see.
            setPicked(null);
          }}
          className="mt-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm text-felt-900"
        />
      </div>

      {errorMessage && (
        <div role="alert" className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="text-sm text-rose-800">{errorMessage}</p>
        </div>
      )}

      <div className="mt-4">
        {isPending && <div className="h-32 animate-pulse rounded-card bg-ink-100" />}
        {!isPending && availability && (
          <AvailabilityGrid
            availability={availability}
            selected={picked}
            durationMinutes={booking.durationMinutes}
            typeLabel={typeLabel}
            onSelect={(tableId, slot) => setPicked({ tableId, startAt: slot.startAt })}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={!picked || amend.isPending} onClick={submit}>
          {amend.isPending ? 'Moving…' : 'Move booking'}
        </Button>
        <Button
          variant="secondary"
          disabled={amend.isPending}
          onClick={() => {
            setOpen(false);
            setPicked(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}

/**
 * The club-local start time of the chosen slot.
 *
 * <p>Read off the availability the server sent rather than converted from the instant here: the
 * server has already done that conversion for every slot on the grid, and doing it again in the
 * browser is how an hour goes missing twice a year.
 */
function startTimeOf(
  startAt: string,
  availability: { tables: { slots: Slot[] }[] } | undefined,
): string {
  const slot = availability?.tables
    .flatMap((table) => table.slots)
    .find((candidate) => candidate.startAt === startAt);
  return slot?.startTime ?? '';
}
