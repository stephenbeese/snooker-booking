import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { addDays, todayIso } from '@/lib/datetime';
import { DateSelector } from './DateSelector';

describe('DateSelector', () => {
  it("caps the date input at the club's own advance window", () => {
    // The bug item 19 names. This defaulted to 30 while the club's window comes from
    // booking_settings, so raising it to 60 left customers unable to reach the second month
    // the club was already selling — the input refused the date and the arrow disabled early.
    render(<DateSelector date={todayIso()} maxAdvanceDays={60} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Booking date')).toHaveAttribute(
      'max',
      addDays(todayIso(), 60),
    );
  });

  it('caps at a shorter window too, rather than at a fixed number', () => {
    // The other direction: a club selling only a fortnight ahead must not offer a month. One
    // hardcoded default cannot be wrong in only one direction.
    render(<DateSelector date={todayIso()} maxAdvanceDays={14} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Booking date')).toHaveAttribute(
      'max',
      addDays(todayIso(), 14),
    );
  });

  it('sets no upper bound while the club settings are still loading', () => {
    // Guessing a cap here would block dates that are genuinely bookable. The server rejects
    // anything past the real window regardless, so no attribute is the honest interim state.
    render(<DateSelector date={todayIso()} maxAdvanceDays={undefined} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Booking date')).not.toHaveAttribute('max');
  });

  it('disables the forward arrow only at the real end of the window', () => {
    const onChange = vi.fn();
    const lastDay = addDays(todayIso(), 45);
    render(<DateSelector date={lastDay} maxAdvanceDays={45} onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  });

  it('leaves the forward arrow live inside the window', () => {
    // Day 30 of a 45-day window: the old hardcoded 30 disabled here, fifteen sellable days
    // early.
    render(
      <DateSelector date={addDays(todayIso(), 30)} maxAdvanceDays={45} onChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
  });
});
