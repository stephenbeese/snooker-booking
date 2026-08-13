import { formatDuration } from '@/lib/datetime';
import type { Slot, UnavailableReason } from './types';

/** What a cell should look like and say. Pure, so it is cheap to unit test. */
export interface SlotAppearance {
  className: string;
  /** Announced to screen readers and shown as a title tooltip. */
  label: string;
  interactive: boolean;
}

const REASON_LABEL: Record<UnavailableReason, string> = {
  BOOKED: 'Already booked',
  MAINTENANCE: 'Unavailable — maintenance',
  TABLE_INACTIVE: 'Table out of service',
  CLUB_CLOSED: 'Club closed',
  PAST: 'Time has passed',
  INSUFFICIENT_NOTICE: 'Too soon to book',
  TOO_FAR_IN_ADVANCE: 'Too far in advance',
  INSUFFICIENT_REMAINING_TIME: 'Not enough time before closing',
};

const BASE = 'h-10 w-full rounded-lg text-xs font-medium tabular-nums transition-all duration-150';

export function slotAppearance(
  slot: Slot,
  time: string,
  isSelected: boolean,
): SlotAppearance {
  // Occupied cells never invite a click, whatever duration was requested.
  if (!slot.available) {
    const reason = slot.reason ?? 'BOOKED';
    const occupied =
      reason === 'MAINTENANCE'
        ? 'bg-amber-100 text-amber-800'
        : reason === 'TABLE_INACTIVE'
          ? 'bg-ink-100 text-ink-400'
          : reason === 'PAST' || reason === 'INSUFFICIENT_NOTICE'
            ? 'bg-ink-50 text-ink-400'
            : 'bg-rose-100 text-rose-800';
    return {
      className: `${BASE} ${occupied} cursor-not-allowed`,
      label: `${time} — ${REASON_LABEL[reason]}`,
      interactive: false,
    };
  }

  // Deliberately checked before `isSelected`: a cell that no longer fits the requested
  // duration must stop looking selected, whatever was picked earlier. Showing it green and
  // clickable is how a stale selection reaches the summary bar priced for the old duration.
  //
  // Free, but the requested duration does not fit. Visibly distinct from both bookable
  // and occupied, so the grid does not look broken when a late slot cannot be clicked.
  //
  // `reason` is only set when NO permitted duration fits; when a shorter booking would
  // still work it is null, so say how long actually fits rather than "not enough time".
  if (slot.bookableForRequestedDuration === false) {
    const label =
      slot.reason !== null
        ? REASON_LABEL[slot.reason]
        : slot.maxDurationMinutes > 0
          ? `Up to ${formatDuration(slot.maxDurationMinutes)} only`
          : 'Does not fit';
    return {
      className: `${BASE} bg-felt-50 text-felt-700/50 cursor-not-allowed`,
      label: `${time} — ${label}`,
      interactive: false,
    };
  }

  if (isSelected) {
    return {
      className: `${BASE} bg-felt-700 text-white shadow-card ring-2 ring-felt-900 ring-offset-1`,
      label: `${time} — selected`,
      interactive: true,
    };
  }

  return {
    className: `${BASE} bg-felt-100 text-felt-900 hover:bg-felt-600 hover:text-white hover:shadow-card cursor-pointer`,
    label: `${time} — available`,
    interactive: true,
  };
}
