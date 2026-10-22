#!/usr/bin/env bash
# Opens the installed DEB headless as the current (non-root) user and checks
# that the packaged backend answers, migrations run and the keyring is used.
# Requires: life-board, xvfb, xauth, gnome-keyring, dbus-x11 and curl.
set -euo pipefail

if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
  exec dbus-run-session -- "$0" "$@"
fi

# Chromium picks its keyring from the desktop; headless sessions would get "basic".
export XDG_CURRENT_DESKTOP="${XDG_CURRENT_DESKTOP:-GNOME}"
log=$(mktemp)
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then cat "$log" >&2; fi
  pkill -f "/opt/Life Board/life-board-app" || true
  rm -f "$log"
  exit "$status"
}
trap cleanup EXIT
data="${XDG_CONFIG_HOME:-$HOME/.config}/life-board-app"
echo smoke | gnome-keyring-daemon --unlock --components=secrets >/dev/null
xvfb-run -a life-board-app >"$log" 2>&1 &

for _ in $(seq 1 60); do
  grep -q "API ouvindo" "$log" && break
  sleep 1
done
url=$(grep -o "http://127.0.0.1:[0-9]*" "$log" | head -1 || true)
if [ -z "$url" ]; then
  echo "Packaged backend did not start." >&2
  exit 1
fi

curl -fsS "$url/api/health"
echo
test -s "$data/secret.key.enc"
test -s "$data/life-board.db"
echo "Smoke test passed: $url"
