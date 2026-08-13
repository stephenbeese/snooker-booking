import type { BookingStatus } from '@/features/booking/types';

/**
 * One place mapping a status to words and colour.
 *
 * <p>Both maps are `Record<BookingStatus, …>` rather than partial lookups, so adding a status to
 * the enum is a type error here instead of a booking that renders as a blank badge.
 */
const STYLE: Record<BookingStatus, string> = {
  CONFIRMED: 'bg-felt-100 text-felt-900',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900',
  CANCELLED: 'bg-ink-200 text-ink-700',
  EXPIRED: 'bg-ink-200 text-ink-700',
  COMPLETED: 'bg-ink-200 text-ink-700',
  NO_SHOW: 'bg-rose-100 text-rose-900',
};

const LABEL: Record<BookingStatus, string> = {
  CONFIRMED: 'Confirmed',
  PENDING_PAYMENT: 'Awaiting payment',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLE[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}

export const STATUS_LABEL = LABEL;
