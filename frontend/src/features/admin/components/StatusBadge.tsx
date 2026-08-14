import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { BookingStatus } from '@/features/booking/types';

/**
 * One place mapping a status to words and colour.
 *
 * <p>Both maps are `Record<BookingStatus, …>` rather than partial lookups, so adding a status to
 * the enum is a type error here instead of a booking that renders as a blank badge.
 */
const TONE: Record<BookingStatus, BadgeTone> = {
  CONFIRMED: 'positive',
  PENDING_PAYMENT: 'pending',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  COMPLETED: 'neutral',
  NO_SHOW: 'negative',
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
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}

export const STATUS_LABEL = LABEL;
