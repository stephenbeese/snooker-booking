import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeTable } from '@/test/factories';
import { TableTypeFilter } from './TableTypeFilter';

const LABELS: Record<string, string> = {
  SNOOKER: 'Snooker',
  ENGLISH_POOL: 'English pool',
  DARTS: 'Darts',
};

function renderFilter(tables = MIXED, value: string | null = null) {
  const onChange = vi.fn();
  render(
    <TableTypeFilter
      tables={tables}
      value={value}
      onChange={onChange}
      label={(code) => LABELS[code] ?? code}
    />,
  );
  return { onChange };
}

const MIXED = [
  makeTable({ tableId: 1, tableType: 'SNOOKER' }),
  makeTable({ tableId: 2, tableType: 'SNOOKER' }),
  makeTable({ tableId: 3, tableType: 'SNOOKER' }),
  makeTable({ tableId: 4, tableType: 'SNOOKER' }),
  makeTable({ tableId: 5, tableType: 'ENGLISH_POOL' }),
  makeTable({ tableId: 6, tableType: 'ENGLISH_POOL' }),
];

describe('TableTypeFilter', () => {
  it('counts the tables of each type', () => {
    renderFilter();

    expect(screen.getByRole('button', { name: /Snooker \(4\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /English pool \(2\)/ })).toBeInTheDocument();
  });

  it('offers only types the club actually has a table of', () => {
    // The requirement, in the user's words: if there is no darts board, do not offer a darts
    // filter. A fixed list of every type the system knows about would offer one that empties
    // the grid — a control whose only outcome is a blank page.
    renderFilter();

    expect(screen.queryByRole('button', { name: /Darts/ })).toBeNull();
  });

  it('renders nothing at all when every table is the same type', () => {
    // A filter with one option removes nothing.
    const { container } = render(
      <TableTypeFilter
        tables={[makeTable({ tableId: 1 }), makeTable({ tableId: 2 })]}
        value={null}
        onChange={vi.fn()}
        label={(code) => LABELS[code] ?? code}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('reports the chosen type, and null when going back to all', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter(MIXED, 'SNOOKER');

    await user.click(screen.getByRole('button', { name: /English pool/ }));
    expect(onChange).toHaveBeenCalledWith('ENGLISH_POOL');

    await user.click(screen.getByRole('button', { name: 'All tables' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('says which chip is on, for assistive technology as well as by colour', () => {
    renderFilter(MIXED, 'ENGLISH_POOL');

    expect(screen.getByRole('button', { name: /English pool/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All tables' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
