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
  onSelect: (slot: Slot) => void;
}

export function SlotCell({ slot, span, spanLabel, onSelect }: SlotCellProps) {
  const time = formatSlotTime(slot.startTime);
  const { className, label, interactive, text } = slotAppearance(slot, time, span);

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
    >
      {/* A non-breaking space rather than nothing, so a blank middle cell keeps the row's
          height instead of collapsing and breaking the bar it is part of. */}
      {text === '' ? ' ' : text}
    </button>
  );
}
