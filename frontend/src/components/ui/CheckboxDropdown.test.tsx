import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CheckboxDropdown } from './CheckboxDropdown';

const DAYS = [
  { value: 'MONDAY', label: 'Monday', shortLabel: 'Mon' },
  { value: 'TUESDAY', label: 'Tuesday', shortLabel: 'Tue' },
  { value: 'SATURDAY', label: 'Saturday', shortLabel: 'Sat' },
];

/** Controlled by a parent, as it is in the real form. */
function Harness({ initial = [] as string[], summary }: { initial?: string[]; summary?: string }) {
  const [selected, setSelected] = useState(initial);
  return (
    <>
      <CheckboxDropdown
        legend="Days"
        options={DAYS}
        selected={selected}
        onChange={setSelected}
        emptyLabel="Every day"
        hint="Leave all unticked to apply every day."
        {...(summary === undefined ? {} : { summary })}
      />
      <button type="button">Outside</button>
    </>
  );
}

describe('CheckboxDropdown', () => {
  it('stays closed until asked, so the form is not covered by an open panel', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: /^Days/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows the empty label when nothing is selected', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /Every day/ })).toBeInTheDocument();
  });

  it('summarises the selection on the closed button', async () => {
    // The whole reason to use a dropdown rather than a row of checkboxes: it has to say what
    // is selected while closed, or staff must open it to find out what a rule covers.
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /^Days/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await user.click(screen.getByRole('checkbox', { name: 'Saturday' }));

    expect(screen.getByRole('button', { name: /Mon, Sat/ })).toBeInTheDocument();
  });

  it('keeps the summary in option order, not click order', async () => {
    // Otherwise the same set of days reads differently depending on which box was ticked
    // first, and two identical rules look different in the list.
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /^Days/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Saturday' }));
    await user.click(screen.getByRole('checkbox', { name: 'Monday' }));

    expect(screen.getByRole('button', { name: /Mon, Sat/ })).toBeInTheDocument();
  });

  it('lets a caller override the summary', async () => {
    render(<Harness initial={['MONDAY', 'TUESDAY']} summary="Weekdays" />);
    expect(screen.getByRole('button', { name: /Weekdays/ })).toBeInTheDocument();
  });

  it('unticks a selected option', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['MONDAY']} />);

    await user.click(screen.getByRole('button', { name: /^Days/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Monday' }));

    expect(screen.getByRole('button', { name: /Every day/ })).toBeInTheDocument();
  });

  it('stays open while several options are ticked', async () => {
    // A dropdown that closed on each click would make selecting four days four round trips —
    // the single worst thing about using a native select for this.
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /^Days/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Monday' }));

    expect(screen.getByRole('checkbox', { name: 'Tuesday' })).toBeVisible();
  });

  it('closes when the user clicks away', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /^Days/ }));
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the button', async () => {
    // Without the focus return a keyboard user is left focused on an element that no longer
    // exists, and has to tab from the top of the page to get back.
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: /^Days/ });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('is operable by keyboard alone', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(screen.getByRole('button', { name: /^Days/ })).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.tab();
    const monday = screen.getByRole('checkbox', { name: 'Monday' });
    expect(monday).toHaveFocus();

    await user.keyboard(' ');
    expect(monday).toBeChecked();
  });
});
