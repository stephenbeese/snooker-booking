import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/ui/PageShell';
import { Panel } from '@/components/ui/Panel';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiError';
import { formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { useAnswerPaymentDecision, usePaymentDecisions } from './useAdmin';
import type { PaymentDecision } from './types';

/**
 * Money the club is holding that somebody has to make a call on.
 *
 * <p>The dashboard has always counted these and never named one, so "3 payments need a decision"
 * was a number with nothing behind it and no way to act. Each row now carries its booking, its
 * customer and what they paid, and ends in the two things that can actually be done about it.
 *
 * <p>Refunds and resolutions both go through the server, which decides what is refundable: a
 * booking paid in cash at the counter reaches this queue too, and there is no card payment
 * behind it to send back.
 */
export function AdminPaymentsPage() {
  const { data: decisions, isPending, isError, error } = usePaymentDecisions();

  return (
    <PageShell
      title="Payments"
      description="Money taken for a booking that was cancelled or lost its slot."
      width="lg"
    >
      {isPending && <div className="mt-8 h-32 animate-pulse rounded-card bg-ink-100" />}

      {isError && (
        <Panel tone="danger" className="mt-8">
          <p className="text-sm font-medium text-rose-800">Could not load the payments queue</p>
          <p className="mt-1 text-sm text-rose-700">{error.message}</p>
        </Panel>
      )}

      {!isPending && !isError && decisions.length === 0 && (
        <EmptyState
          className="mt-8"
          title="Nothing to decide"
          description="Refunds raised by a cancellation or a lost slot will appear here."
        />
      )}

      {!isPending && !isError && decisions.length > 0 && (
        <ul className="mt-8 space-y-4">
          {decisions.map((decision) => (
            <DecisionRow key={decision.id} decision={decision} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function DecisionRow({ decision }: { decision: PaymentDecision }) {
  const answer = useAnswerPaymentDecision();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  function act(action: 'refund' | 'resolve') {
    // Read before the mutation: the row unmounts on success, taking the amount with it.
    const amount = formatPence(decision.amountPence);
    answer.mutate(
      { id: decision.id, action },
      {
        onSuccess: () =>
          toast(
            action === 'refund'
              ? `${amount} refunded to ${decision.customerName}.`
              : `Decision on ${decision.reference} marked as settled.`,
          ),
      },
    );
  }

  const errorMessage =
    answer.error instanceof ApiError
      ? answer.error.message
      : answer.error
        ? 'Could not update this payment. Please try again.'
        : null;

  return (
    <li className="rounded-card border border-ink-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to={`/admin/bookings/${encodeURIComponent(decision.reference)}`}
            className="font-mono text-sm text-felt-700 underline underline-offset-2 hover:text-felt-900"
          >
            {decision.reference}
          </Link>
          <p className="mt-1 font-medium text-felt-900">
            {decision.customerName} · {decision.tableName}
          </p>
          <p className="mt-1 text-sm text-ink-600">
            {decision.date}, {formatSlotTime(decision.startTime)}–
            {formatSlotTime(decision.endTime)}
          </p>
          {/* The way to reach the customer, which is the next thing anyone working this queue
              needs — the decision is usually a conversation. */}
          {(decision.customerEmail || decision.customerPhone) && (
            <p className="mt-1 text-sm text-ink-500">
              {[decision.customerEmail, decision.customerPhone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <p className="text-lg font-semibold text-felt-900">
          {formatPence(decision.amountPence)}
        </p>
      </div>

      <p className="mt-3 text-sm text-ink-700">{decision.reason}</p>

      {errorMessage && (
        <div role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="text-sm text-rose-800">{errorMessage}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {decision.refundable &&
          (!confirming ? (
            <Button disabled={answer.isPending} onClick={() => setConfirming(true)}>
              Refund in full
            </Button>
          ) : (
            <>
              {/* Behind a second click, because it moves real money and cannot be undone
                  from here. */}
              <Button disabled={answer.isPending} onClick={() => act('refund')}>
                {answer.isPending
                  ? 'Refunding…'
                  : `Confirm ${formatPence(decision.amountPence)} refund`}
              </Button>
              <Button
                variant="secondary"
                disabled={answer.isPending}
                onClick={() => setConfirming(false)}
              >
                Keep the payment
              </Button>
            </>
          ))}

        {!confirming && (
          <Button
            variant="secondary"
            disabled={answer.isPending}
            onClick={() => act('resolve')}
          >
            Mark as settled
          </Button>
        )}
      </div>

      {!decision.refundable && !confirming && (
        <p className="mt-2 text-sm text-ink-500">
          This was not paid by card, so it cannot be refunded here — settle it with the
          customer and mark it as settled.
        </p>
      )}
    </li>
  );
}
