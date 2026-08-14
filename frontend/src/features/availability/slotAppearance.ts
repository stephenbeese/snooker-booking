import { formatDuration } from '@/lib/datetime';
import type { Slot, UnavailableReason } from './types';

/**
 * Where a cell sits in the selected booking, if at all.
 *
 * <p>A booking covers several cells, not one. Highlighting only the start left the cells about
 * to be consumed looking like ordinary free time, so the grid never showed how much of the
 * evening the customer was actually taking. `'only'` is the single-cell case, where the
 * booking is one increment long and there is no run to draw.
 */
export type SpanPosition = 'start' | 'middle' | 'end' | 'only';

/** What a cell should look like and say. Pure, so it is cheap to unit test. */
export interface SlotAppearance {
  className: string;
  /** Announced to screen readers and shown as a title tooltip. */
  label: string;
  interactive: boolean;
  /** What to print in the cell. Blank for the middle of a run, which needs no time of its own. */
  text: string;
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

const BASE = 'h-10 w-full text-xs font-medium tabular-nums transition-all duration-150';

/** Everything not part of a selected run is a standalone cell, so it rounds on all four sides. */
const STANDALONE = 'rounded-lg';

/**
 * Corner rounding per position in a run.
 *
 * <p>Only the outer corners round; the inner ones stay square so consecutive cells butt together
 * into a single bar rather than a row of separate lozenges. This is what makes the booking read
 * as one block of time — and it only works because the grid no longer puts a gutter between
 * cells, which would leave visible gaps down the middle of the run whatever the corners did.
 */
const SPAN_SHAPE: Record<SpanPosition, string> = {
  start: 'rounded-l-lg',
  middle: '',
  end: 'rounded-r-lg',
  only: 'rounded-lg',
};

export function slotAppearance(
  slot: Slot,
  time: string,
  span: SpanPosition | null,
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
      className: `${BASE} ${STANDALONE} ${occupied} cursor-not-allowed`,
      label: `${time} — ${REASON_LABEL[reason]}`,
      interactive: false,
      text: time,
    };
  }

  // Deliberately checked before the span: a cell that no longer fits the requested
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
      className: `${BASE} ${STANDALONE} bg-felt-50 text-felt-700/50 cursor-not-allowed`,
      label: `${time} — ${label}`,
      interactive: false,
      text: time,
    };
  }

  if (span !== null) {
    // No ring. The old one used `ring-offset-1`, which drew into the gutter between cells and
    // read as a stray line beside the selection rather than a border around it; with the run
    // rendered as a solid bar the fill is the affordance and needs no outline.
    return {
      className: `${BASE} ${SPAN_SHAPE[span]} bg-felt-700 text-white shadow-card`,
      label: `${time} — selected`,
      interactive: true,
      // The middle of a run prints nothing: a column of times inside one continuous block
      // reads as several separate selections rather than one booking.
      text: span === 'middle' ? '' : time,
    };
  }

  return {
    className: `${BASE} ${STANDALONE} bg-felt-100 text-felt-900 hover:bg-felt-600 hover:text-white hover:shadow-card cursor-pointer`,
    label: `${time} — available`,
    interactive: true,
    text: time,
  };
}
