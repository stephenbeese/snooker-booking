import type { TableAvailability, TableType } from '../types';

interface TableTypeFilterProps {
  /** The day's tables, as returned. The options are derived from these, not from a fixed list. */
  tables: TableAvailability[];
  /** The chosen type, or null for "everything". */
  value: TableType | null;
  onChange: (type: TableType | null) => void;
  label: (code: TableType) => string;
}

/**
 * Filter the grid down to one kind of table.
 *
 * <p>The options come from the tables actually returned for the day, so a club with no darts
 * board is never offered a darts filter that would empty the grid. The count comes from the
 * same place, which is why it cannot disagree with what filtering produces.
 *
 * <p>Renders nothing when there is only one kind of table: a filter with a single option
 * removes nothing and is one more control to read past.
 */
export function TableTypeFilter({ tables, value, onChange, label }: TableTypeFilterProps) {
  const counts = new Map<TableType, number>();
  for (const table of tables) {
    counts.set(table.tableType, (counts.get(table.tableType) ?? 0) + 1);
  }

  if (counts.size < 2) {
    return null;
  }

  // In the order the tables come back, which is the club's own display order — not
  // alphabetical, which would put the club's main format wherever the alphabet decided.
  const types = [...counts.keys()];

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by type">
      <Chip active={value === null} onClick={() => onChange(null)}>
        All tables
      </Chip>
      {types.map((type) => (
        <Chip key={type} active={value === type} onClick={() => onChange(type)}>
          {label(type)}{' '}
          <span className={value === type ? 'text-white/70' : 'text-ink-500'}>
            ({counts.get(type)})
          </span>
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // aria-pressed rather than a radio group: these are toggles over one list, and a screen
      // reader should hear which one is on without the roving focus a radiogroup implies.
      aria-pressed={active}
      onClick={onClick}
      className={[
        'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-felt-700 text-white'
          : 'bg-surface text-ink-700 ring-1 ring-inset ring-ink-300 hover:bg-ink-50',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
