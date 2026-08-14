import type { DurationOption, Slot, TableAvailability } from './types';

/**
 * Resolving a gesture across the grid into a duration the club actually sells.
 *
 * <p>Every interactive path — clicking a second cell, dragging across a run, or clicking a
 * faded cell that cannot hold the current duration — ends in the same question: given an
 * anchor and a target, how long a booking is that? Answering it in three places would let the
 * three disagree, and the drag and the click would resolve the same two cells differently.
 *
 * <p>The hard constraint is that the client must never invent a duration. `durationOptions`
 * is issued by the server from the club's min/max/increment, and `DurationPicker` already
 * carries the note that deriving them here would eventually offer a length the API rejects.
 * A range gesture is therefore a *request* for a duration, which gets snapped to the nearest
 * permitted one at or below what was dragged — never above, because rounding up would quietly
 * bill for and reserve time the customer did not drag over.
 */

/** How far a run may extend before it hits something the club will not sell. */
export function freeRunMinutes(
  table: TableAvailability,
  anchorIndex: number,
  incrementMinutes: number,
): number {
  let cells = 0;
  for (let index = anchorIndex; index < table.slots.length; index++) {
    // The anchor itself is included regardless of its `bookableForRequestedDuration`, which
    // answers "could the CURRENT duration start here" — the very thing being recalculated.
    // Only "is this time unsold" bounds the run.
    if (index > anchorIndex && !table.slots[index]!.available) {
      break;
    }
    cells++;
  }
  return cells * incrementMinutes;
}

/**
 * The longest permitted duration that is no longer than `wanted` and no longer than `ceiling`.
 *
 * <p>Returns null when even the shortest bookable duration does not fit, which is the honest
 * answer for a cell with ten minutes of trading left — better than snapping up to a length
 * the server will refuse.
 */
export function snapDuration(
  options: DurationOption[],
  wanted: number,
  ceiling: number,
): number | null {
  const limit = Math.min(wanted, ceiling);
  let best: number | null = null;
  for (const option of options) {
    if (option.minutes <= limit && (best === null || option.minutes > best)) {
      best = option.minutes;
    }
  }
  return best;
}

/**
 * The duration implied by dragging (or click-click) from `anchor` to `target` in one row.
 *
 * <p>Inclusive of the target cell: dragging 19:00 → 19:30 asks for an hour, not a half-hour.
 * Someone dragging across two cells has covered two half-hours on screen, and reading it as
 * one would make the bar stop short of where they released.
 *
 * <p>A backwards drag returns null rather than silently reinterpreting which end is the start.
 * The caller re-anchors instead, so dragging left picks a new start time — which is what the
 * gesture looks like it is doing.
 */
export function durationForRange(
  table: TableAvailability,
  anchorStartAt: string,
  targetStartAt: string,
  options: DurationOption[],
  incrementMinutes: number,
): number | null {
  const anchorIndex = table.slots.findIndex((slot) => slot.startAt === anchorStartAt);
  const targetIndex = table.slots.findIndex((slot) => slot.startAt === targetStartAt);
  if (anchorIndex < 0 || targetIndex < 0 || targetIndex < anchorIndex) {
    return null;
  }

  const wanted = (targetIndex - anchorIndex + 1) * incrementMinutes;
  return snapDuration(
    options,
    wanted,
    freeRunMinutes(table, anchorIndex, incrementMinutes),
  );
}

/**
 * The duration to fall back to when a cell cannot hold the one currently requested.
 *
 * <p>`maxDurationMinutes` is the server's own answer for how much fits at this slot, so this
 * clamps to it rather than recomputing the rule. Null when nothing the club sells fits, which
 * leaves the cell genuinely unusable and the caller declines the click.
 */
export function clampedDuration(slot: Slot, options: DurationOption[]): number | null {
  return snapDuration(options, slot.maxDurationMinutes, slot.maxDurationMinutes);
}
