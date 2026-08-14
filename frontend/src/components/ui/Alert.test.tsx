import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from './Alert';

describe('Alert', () => {
  it('announces a failure as an alert, so it interrupts', () => {
    render(<Alert tone="danger">That time has just been taken.</Alert>);

    expect(screen.getByRole('alert')).toHaveTextContent('That time has just been taken.');
  });

  it('announces a success as a status, not an alert', () => {
    // The asymmetry is the point, and several page tests depend on it: they assert a
    // confirmation arrives as `status` while an error arrives as `alert`, and one asserts a
    // `status` is absent when a save failed. Announcing success as an alert would satisfy
    // none of those, and would cut a screen reader off mid-sentence to say nothing is wrong.
    render(<Alert tone="success">Opening hours saved.</Alert>);

    expect(screen.getByRole('status')).toHaveTextContent('Opening hours saved.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays silent for info, which is usually on the page from the start', () => {
    render(<Alert tone="info">Prices include VAT.</Alert>);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Prices include VAT.')).toBeInTheDocument();
  });

  it('lets a caller override the announcement', () => {
    // A warning that is part of the page on load rather than a reply to an action.
    render(
      <Alert tone="warning" live="none">
        The club is closed on Christmas Day.
      </Alert>,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
