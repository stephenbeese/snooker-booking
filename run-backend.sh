#!/usr/bin/env bash
# Starts the backend with .env loaded. Gradle has no dotenv support, so without this
# the Stripe keys are absent and the app fails at startup by design.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env found. Run: cp .env.example .env" >&2
  exit 1
fi

# set -a exports everything sourced, which is what Spring reads.
set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ "${STRIPE_SECRET_KEY:-}" == sk_live_* ]]; then
  echo "STRIPE_SECRET_KEY is a LIVE key. Refusing to start in development." >&2
  exit 1
fi

# An earlier backend left running holds 8080, and Gradle's failure ("Port 8080 was
# already in use") arrives ~10s in, after a full startup. Check first, and only offer to
# kill a process that is actually this application — never something else on the port.
PORT="${SERVER_PORT:-8080}"
HOLDER="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
if [ -n "$HOLDER" ]; then
  if ps -p "$HOLDER" -o command= 2>/dev/null | grep -q "uk.co.club.booking.BookingApplication"; then
    # That backend may be someone's foreground terminal, mid-use. Killing it silently
    # shows up there as a SIGTERM build failure with no explanation, so ask first —
    # unless FORCE_RESTART=1 says otherwise (for scripted use).
    if [ "${FORCE_RESTART:-0}" = "1" ]; then
      REPLY=y
    elif [ -t 0 ]; then
      printf 'A backend is already running on port %s (pid %s). Stop it and restart? [y/N] ' "$PORT" "$HOLDER"
      read -r REPLY
    else
      REPLY=n
    fi
    case "$REPLY" in
      [yY]*)
        echo "Stopping previous backend (pid $HOLDER)."
        kill "$HOLDER"
        for _ in $(seq 1 20); do
          lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
          sleep 0.5
        done
        ;;
      *)
        echo "Leaving it running. It is already serving http://localhost:$PORT" >&2
        exit 0
        ;;
    esac
  else
    echo "Port $PORT is held by pid $HOLDER, which is not this backend:" >&2
    ps -p "$HOLDER" -o command= >&2
    echo "Stop it yourself, or run with SERVER_PORT=8081 ./run-backend.sh" >&2
    exit 1
  fi
fi

# bootRun is a server task, so Gradle's progress bar parks at "80% EXECUTING" for the
# whole life of the app and only reaches 100% on shutdown. That reads as a hang. Announce
# readiness from a watcher instead, so the terminal says so plainly.
(
  for _ in $(seq 1 120); do
    if curl -fsS -m 2 "http://localhost:$PORT/api/health" 2>/dev/null | grep -q '"status"'; then
      echo ""
      echo "  Backend ready on http://localhost:$PORT"
      echo "  Gradle stays at 80% while the server runs — that is normal, not a hang."
      echo "  Frontend: run 'cd frontend && yarn dev' in another terminal, then open http://localhost:5173"
      echo "  Stop with Ctrl-C."
      echo ""
      exit 0
    fi
    sleep 1
  done
) &

cd backend
exec ./gradlew bootRun --args="--spring.profiles.active=dev --server.port=$PORT"
