import { formatSlotTime } from '@/lib/datetime';
import { slotAppearance } from '../slotAppearance';
import type { Slot } from '../types';

interface SlotCellProps {
  slot: Slot;
  isSelected: boolean;
  onSelect: (slot: Slot) => void;
}

export function SlotCell({ slot, isSelected, onSelect }: SlotCellProps) {
  const time = formatSlotTime(slot.startTime);
  const { className, label, interactive } = slotAppearance(slot, time, isSelected);

  return (
    <button
      type="button"
      // A real button rather than a styled div, so keyboard and screen-reader users get
      // focus and activation for free.
      disabled={!interactive}
      aria-pressed={isSelected}
      aria-label={label}
      title={label}
      className={className}
      onClick={() => onSelect(slot)}
    >
      {time}
    </button>
  );
}
