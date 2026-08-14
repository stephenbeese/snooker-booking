import { formatSlotTime } from '@/lib/datetime';
import { slotAppearance, type SpanPosition } from '../slotAppearance';
import type { Slot } from '../types';

interface SlotCellProps {
  slot: Slot;
  /** Where this cell sits in the selected booking, or null if it is not part of one. */
  span: SpanPosition | null;
  /**
   * What the whole booking covers, e.g. "14:00 to 16:00". Used to label every cell in the run,
   * so a screen reader landing on the middle of a booking is told what it is part of rather
   * than just "selected".
   */
  spanLabel?: string | undefined;
  /**
   * When the booking finishes, e.g. "12:00". Printed at the right-hand end of the bar.
   *
   * <p>Not the end cell's own start time, which is what it showed at first: a 10:00 booking for
   * two hours ends at 12:00, but its last half-hour cell *starts* at 11:30, so the bar read
   * "10:00 … 11:30" for a booking that runs to noon.
   */
  spanEndTime?: string | undefined;
  onSelect: (slot: Slot) => void;
  /** Begins a drag. The grid decides what a drag means; the cell only reports where it started. */
  onExtendStart?: ((slot: Slot) => void) | undefined;
  /** The pointer has reached this cell mid-drag. */
  onExtendTo?: ((slot: Slot) => void) | undefined;
}

export function SlotCell({
  slot,
  span,
  spanLabel,
  spanEndTime,
  onSelect,
  onExtendStart,
  onExtendTo,
}: SlotCellProps) {
  const time = formatSlotTime(slot.startTime);
  const { className, label, interactive, text } = slotAppearance(slot, time, span);

  // The far end of the bar shows when the booking finishes, not when its last cell begins.
  const shown = (span === 'end' || span === 'only') && spanEndTime ? spanEndTime : text;

  // Inside a booking, every cell says what the booking is rather than repeating "selected"
  // four times over. The start keeps its own time in the label so the anchor stays findable.
  const accessibleLabel =
    span !== null && spanLabel
      ? span === 'start' || span === 'only'
        ? `${time} — selected, ${spanLabel}`
        : `Part of your booking, ${spanLabel}`
      : label;

  return (
    <button
      type="button"
      // A real button rather than a styled div, so keyboard and screen-reader users get
      // focus and activation for free.
      disabled={!interactive}
      aria-pressed={span !== null}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={className}
      onClick={() => onSelect(slot)}
      // Pointer events, not mouse events, so the drag works with a finger and a stylus too.
      onPointerDown={(event) => {
        if (!interactive || !onExtendStart) {
          return;
        }
        // A button implicitly captures the pointer on contact, which would send every
        // subsequent move to THIS cell and stop `onPointerEnter` firing on the ones the
        // pointer crosses — the drag would silently never extend. Releasing the capture is
        // what makes the gesture reach the rest of the row.
        //
        // Feature-detected rather than called outright: jsdom implements neither method, and
        // an unguarded call throws straight out of the pointerdown handler — which in a
        // browser missing the API would take the ordinary click down with it.
        const target = event.currentTarget;
        if (
          typeof target.hasPointerCapture === 'function' &&
          typeof target.releasePointerCapture === 'function' &&
          target.hasPointerCapture(event.pointerId)
        ) {
          target.releasePointerCapture(event.pointerId);
        }
        onExtendStart(slot);
      }}
      onPointerEnter={() => onExtendTo?.(slot)}
    >
      {/* A non-breaking space rather than nothing, so a blank middle cell keeps the row's
          height instead of collapsing and breaking the bar it is part of. */}
      {shown === '' ? ' ' : shown}
    </button>
  );
}
