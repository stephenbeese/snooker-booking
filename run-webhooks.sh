#!/usr/bin/env bash
# Forwards Stripe webhooks to the local backend.
#
# Without this running, a payment succeeds at Stripe and the application never hears about
# it: the booking stays PENDING_PAYMENT, the page spins on "Confirming your payment...",
# and the hold sweeper eventually cancels a booking the customer has paid for. It is the
# third process this app needs in development, alongside the backend and the frontend.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v stripe >/dev/null 2>&1; then
  echo "The Stripe CLI is not installed. Install it with:" >&2
  echo "  brew install stripe/stripe-cli/stripe" >&2
  echo "then authenticate once with: stripe login" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "No .env found. Run: cp .env.example .env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

PORT="${SERVER_PORT:-8080}"
ENDPOINT="http://localhost:$PORT/api/webhooks/stripe"

# A listener forwarding into nothing looks identical to a working one until a payment is
# made and silently lost, so say so now rather than at the till.
if ! curl -fsS -m 2 "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "Warning: no backend answering on port $PORT. Start it with ./run-backend.sh" >&2
  echo "Forwarding anyway — events will be retried once it is up." >&2
fi

# The CLI mints a signing secret per account, printed at startup. The backend verifies
# every event against STRIPE_WEBHOOK_SECRET, so if the two disagree each event is rejected
# with a 400 and the symptom is identical to no listener at all: payments never confirm.
# Comparing them here turns a silent mismatch into one line of output.
CLI_SECRET="$(stripe listen --print-secret 2>/dev/null || true)"
if [ -n "$CLI_SECRET" ] && [ -n "${STRIPE_WEBHOOK_SECRET:-}" ]; then
  if [ "$CLI_SECRET" != "$STRIPE_WEBHOOK_SECRET" ]; then
    echo "" >&2
    echo "  STRIPE_WEBHOOK_SECRET in .env does not match this CLI's signing secret." >&2
    echo "  Every event will be rejected as unsigned and no payment will confirm." >&2
    echo "  Fix by setting this in .env:" >&2
    echo "" >&2
    echo "    STRIPE_WEBHOOK_SECRET=$CLI_SECRET" >&2
    echo "" >&2
    echo "  Then restart the backend so it picks the new value up." >&2
    exit 1
  fi
fi

echo ""
echo "  Forwarding Stripe webhooks to $ENDPOINT"
echo "  Leave this running while developing. Stop with Ctrl-C."
echo ""

exec stripe listen --forward-to "$ENDPOINT"
