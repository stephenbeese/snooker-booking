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

const BASE = 'h-9 w-full rounded text-xs font-medium transition-colors';

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} mins`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
  return remainder === 0 ? hourPart : `${hourPart} ${remainder} mins`;
}

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
          ? 'bg-gray-100 text-gray-400'
          : reason === 'PAST' || reason === 'INSUFFICIENT_NOTICE'
            ? 'bg-gray-50 text-gray-400'
            : 'bg-rose-100 text-rose-800';
    return {
      className: `${BASE} ${occupied} cursor-not-allowed`,
      label: `${time} — ${REASON_LABEL[reason]}`,
      interactive: false,
    };
  }

  if (isSelected) {
    return {
      className: `${BASE} bg-felt-700 text-white ring-2 ring-felt-900`,
      label: `${time} — selected`,
      interactive: true,
    };
  }

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
          ? `Up to ${formatMinutes(slot.maxDurationMinutes)} only`
          : 'Does not fit';
    return {
      className: `${BASE} bg-felt-50 text-felt-700/50 cursor-not-allowed`,
      label: `${time} — ${label}`,
      interactive: false,
    };
  }

  return {
    className: `${BASE} bg-felt-100 text-felt-900 hover:bg-felt-500 hover:text-white cursor-pointer`,
    label: `${time} — available`,
    interactive: true,
  };
}
