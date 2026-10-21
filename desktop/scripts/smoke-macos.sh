#!/usr/bin/env bash
# Installs the app from a generated DMG into an isolated folder and opens that
# copy twice natively: checks architecture, signatures, the packaged backend,
# migrations and the Keychain-backed secret key, which must survive a restart.
#
#   bash desktop/scripts/smoke-macos.sh <life-board-VERSION-mac-ARCH.dmg> [--team-id TEAMID] [--evidence DIR]
#
# The ZIP update payload next to the DMG must contain the same signed app.
# Without --team-id the build must be a deliberately ad-hoc (build-only) one;
# with it, Developer ID, notarization tickets and Gatekeeper are required.
# A temporary keychain becomes the default during the run and is removed after.
set -euo pipefail

fail() { echo "smoke-macos: $*" >&2; exit 1; }

dmg=
team=
evidence=test-results/macos-smoke
while [ $# -gt 0 ]; do
  case "$1" in
    --team-id) team=${2:?--team-id needs a value}; shift 2 ;;
    --evidence) evidence=${2:?--evidence needs a directory}; shift 2 ;;
    -*) fail "unknown option $1" ;;
    *) [ -z "$dmg" ] || fail "only one DMG is accepted"; dmg=$1; shift ;;
  esac
done
[ -n "$dmg" ] || fail "usage: smoke-macos.sh <dmg> [--team-id TEAMID] [--evidence DIR]"
[ "$(uname -s)" = Darwin ] || fail "this smoke requires native macOS"
[ -z "$team" ] || [[ $team =~ ^[A-Z0-9]{10}$ ]] || fail "invalid Team ID $team"

name=$(basename "$dmg")
[[ $name =~ ^life-board-([0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?)-mac-(x64|arm64)\.dmg$ ]] || fail "unexpected DMG name $name"
version=${BASH_REMATCH[1]}
arch=${BASH_REMATCH[3]}
machine=$([ "$arch" = x64 ] && echo x86_64 || echo arm64)
# Rosetta would run an x64 app on Apple Silicon; that proves nothing about arm64.
translated=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)
[[ $(uname -m) = "$machine" && $translated = 0 ]] || fail "$arch needs a native $machine Mac (uname -m: $(uname -m), translated: $translated)"

dmg="$(cd "$(dirname "$dmg")" && pwd)/$name"
zip="${dmg%.dmg}.zip"
[[ -f $dmg && -f $zip ]] || fail "missing $dmg or its ZIP update payload"
mkdir -p "$evidence"
evidence=$(cd "$evidence" && pwd)

# Spaces, an accent, # and %20 exercise the libSQL file URL encoding.
work=$(mktemp -d "${TMPDIR:-/tmp}/life board smoke.XXXXXX")
volume="$work/volume"
app="$work/Applications/Life Board.app"
data="$work/Application Support/life-board-app ç #1 %20"
keychain="$work/smoke.keychain-db"
mounted=
keychains=()
default_keychain=
pid=

stop_app() {
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null || true; fi
  pkill -9 -f "$app/Contents/" 2>/dev/null || true
  pid=
}
cleanup() {
  status=$?
  set +e
  stop_app
  [ -z "$mounted" ] || hdiutil detach "$volume" -force -quiet
  if [ -n "$default_keychain" ]; then
    security default-keychain -d user -s "$default_keychain"
    security list-keychains -d user -s ${keychains[@]+"${keychains[@]}"}
    security delete-keychain "$keychain" 2>/dev/null
  fi
  if [ "$status" -ne 0 ]; then
    for log in "$evidence"/app-*.log; do [ -f "$log" ] && { echo "== $log" >&2; tail -n 80 "$log" >&2; }; done
  fi
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

plist() { /usr/libexec/PlistBuddy -c "Print :$2" "$1/Contents/Info.plist"; }
json() { plutil -extract "$2" raw -o - - <<<"$1"; }

# Signatures, architecture and entitlements of a bundle; prints its CDHash.
check_signature() {
  local bundle=$1 label=$2 details
  codesign --verify --deep --strict --verbose=2 "$bundle" >>"$evidence/codesign.txt" 2>&1 || fail "$label signature is invalid"
  details=$(codesign -dv --verbose=4 "$bundle" 2>&1)
  printf '== %s\n%s\n' "$label" "$details" >>"$evidence/codesign.txt"
  grep -Eq '^CodeDirectory .*flags=0x[0-9a-f]+\(.*runtime' <<<"$details" || fail "$label lacks the hardened runtime"
  codesign -d --entitlements - --xml "$bundle" 2>/dev/null | grep -q com.apple.security.cs.allow-jit || fail "$label lacks the JIT entitlement"
  if [ -n "$team" ]; then
    grep -q '^Authority=Developer ID Application: ' <<<"$details" || fail "$label is not signed with Developer ID"
    grep -qx "TeamIdentifier=$team" <<<"$details" || fail "$label belongs to another team"
    grep -q '^Timestamp=' <<<"$details" || fail "$label has no secure timestamp"
    spctl --assess --type execute --verbose=2 "$bundle" >>"$evidence/codesign.txt" 2>&1 || fail "Gatekeeper rejects $label"
    xcrun stapler validate "$bundle" >>"$evidence/codesign.txt" 2>&1 || fail "$label has no stapled notarization ticket"
  else
    grep -qx 'Signature=adhoc' <<<"$details" || fail "build-only $label must be deliberately ad-hoc signed"
    grep -qx 'TeamIdentifier=not set' <<<"$details" || fail "build-only $label must not carry a Team ID"
  fi
  sed -n 's/^CDHash=//p' <<<"$details"
}

find_api_url() {
  local pids port
  pids=$(pgrep -f "$app/Contents/" | paste -sd , -)
  [ -n "$pids" ] || return 0
  for port in $(lsof -nP -a -iTCP@127.0.0.1 -sTCP:LISTEN -p "$pids" -Fn 2>/dev/null | sed -n 's/^n127\.0\.0\.1://p'); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" 2>/dev/null | grep -q '"life-board-api"'; then
      echo "http://127.0.0.1:$port"
      return 0
    fi
  done
}

start_app() {
  local log="$evidence/app-$1.log" health
  "$app/Contents/MacOS/$executable" --user-data-dir="$data" >"$log" 2>&1 &
  pid=$!
  url=
  for _ in $(seq 1 240); do
    kill -0 "$pid" 2>/dev/null || fail "installed app exited before the API was ready"
    ! grep -Eq 'Unable to load preload|ERR_FILE_NOT_FOUND|Não foi possível carregar a interface' "$log" || fail "installed renderer/preload failed to load"
    url=$(sed -n 's/.*API ouvindo em \(http:\/\/127\.0\.0\.1:[0-9]*\).*/\1/p' "$log" | head -n 1)
    [ -n "$url" ] || url=$(find_api_url)
    if [ -n "$url" ]; then
      health=$(curl -fsS --max-time 5 "$url/api/health")
      [[ $(json "$health" ok) = true && $(json "$health" service) = life-board-api ]] || fail "unexpected health response: $health"
      return 0
    fi
    sleep 0.25
  done
  fail "installed backend did not answer within 60 seconds"
}

# Quit like the system does; a forced kill could lose Chromium's pending writes.
quit_app() {
  kill -TERM "$pid"
  for _ in $(seq 1 120); do
    kill -0 "$pid" 2>/dev/null || { wait "$pid" 2>/dev/null || true; pid=; return 0; }
    sleep 0.25
  done
  fail "installed app did not quit within 30 seconds"
}

safe_storage_items() {
  security dump-keychain "$keychain" 2>/dev/null | grep -c '"svce"<blob>=".* Safe Storage"' || true
}

: >"$evidence/codesign.txt"
echo "Host: $(sw_vers -productName) $(sw_vers -productVersion) ($(sw_vers -buildVersion)), $(uname -m), translated=$translated"
if [ -n "$team" ]; then
  codesign --verify --strict --verbose=2 "$dmg" >>"$evidence/codesign.txt" 2>&1 || fail "DMG signature is invalid"
  codesign -dv --verbose=4 "$dmg" 2>&1 | grep -qx "TeamIdentifier=$team" || fail "DMG belongs to another team"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg" >>"$evidence/codesign.txt" 2>&1 || fail "Gatekeeper rejects the DMG"
  xcrun stapler validate "$dmg" >>"$evidence/codesign.txt" 2>&1 || fail "DMG has no stapled notarization ticket"
fi

mkdir -p "$volume" "$work/Applications" "$work/zip"
hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$volume" "$dmg" >/dev/null
mounted=1
[ -d "$volume/Life Board.app" ] || fail "DMG has no Life Board.app"
[ -L "$volume/Applications" ] || fail "DMG has no Applications link"
ditto "$volume/Life Board.app" "$app"
hdiutil detach "$volume" -quiet
mounted=

executable=$(plist "$app" CFBundleExecutable)
[ "$(plist "$app" CFBundleIdentifier)" = dev.nathanmota.lifeboard ] || fail "wrong bundle identifier"
[ "$(plist "$app" CFBundleShortVersionString)" = "$version" ] || fail "installed app is not version $version"
file "$app/Contents/MacOS/$executable" | tee -a "$evidence/codesign.txt"
[ "$(lipo -archs "$app/Contents/MacOS/$executable")" = "$machine" ] || fail "installed executable is not thin $machine"
native="$app/Contents/Resources/app.asar.unpacked/node_modules/@libsql/darwin-$arch/index.node"
[ "$(lipo -archs "$native")" = "$machine" ] || fail "installed libSQL module is not $machine"
for resource in app.asar app-update.yml migrations/meta/_journal.json; do
  [ -s "$app/Contents/Resources/$resource" ] || fail "missing installed resource $resource"
done
for helper in "" " (GPU)" " (Plugin)" " (Renderer)"; do
  [ "$(lipo -archs "$app/Contents/Frameworks/$executable Helper$helper.app/Contents/MacOS/$executable Helper$helper")" = "$machine" ] || fail "helper$helper is not $machine"
done
cdhash=$(check_signature "$app" "installed app")
[ -n "$team" ] || [ "$(codesign -dv "$native" 2>&1 | sed -n 's/^Signature=//p')" = adhoc ] || fail "libSQL module is not ad-hoc signed"
[ -z "$team" ] || codesign -dv --verbose=2 "$native" 2>&1 | grep -qx "TeamIdentifier=$team" || fail "libSQL module belongs to another team"

# The updater installs the ZIP, so it must carry the identical signed code.
ditto -x -k "$zip" "$work/zip"
zip_cdhash=$(check_signature "$work/zip/Life Board.app" "ZIP app")
[ "$zip_cdhash" = "$cdhash" ] || fail "ZIP and DMG contain different code"

security list-keychains -d user >"$work/keychains.txt"
while IFS= read -r line; do
  line=${line#"${line%%[![:space:]]*}"}
  line=${line#\"}
  keychains+=("${line%\"}")
done <"$work/keychains.txt"
default_keychain=$(security default-keychain -d user | sed 's/^[[:space:]]*"\(.*\)"$/\1/')
password=$(uuidgen)
security create-keychain -p "$password" "$keychain"
security set-keychain-settings "$keychain"
security unlock-keychain -p "$password" "$keychain"
security list-keychains -d user -s "$keychain" ${keychains[@]+"${keychains[@]}"}
security default-keychain -d user -s "$keychain"

start_app 1
task=$(curl -fsS --max-time 5 -H 'Content-Type: application/json' -d '{"title":"Installed macOS smoke"}' "$url/api/tasks")
task_id=$(json "$task" id)
for file in life-board.db secret.key.enc; do [ -s "$data/$file" ] || fail "empty or missing $file"; done
[ "$(safe_storage_items)" = 1 ] || fail "safeStorage did not create its key in the isolated Keychain"
key_hash=$(shasum -a 256 "$data/secret.key.enc")
quit_app

# loadSecretKey must decrypt the existing key through the Keychain this time.
start_app 2
saved=$(curl -fsS --max-time 5 "$url/api/tasks/$task_id")
[ "$(json "$saved" title)" = "Installed macOS smoke" ] || fail "task did not survive the restart"
[ "$(shasum -a 256 "$data/secret.key.enc")" = "$key_hash" ] || fail "secret key changed on restart"
[ "$(safe_storage_items)" = 1 ] || fail "restart replaced the Keychain item"
quit_app

status=$([ -n "$team" ] && echo signed || echo adhoc)
team_json=$([ -n "$team" ] && echo "\"$team\"" || echo null)
notarized=$([ -n "$team" ] && echo true || echo false)
sha() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
cat >"$evidence/signing-info.json" <<EOF
{
  "schemaVersion": 1,
  "status": "$status",
  "teamId": $team_json,
  "notarized": $notarized,
  "cdHash": "$cdhash",
  "dmgSha256": "$(sha "$dmg")",
  "zipSha256": "$(sha "$zip")"
}
EOF
cat >"$evidence/smoke.json" <<EOF
{
  "macosVersion": "$(sw_vers -productVersion)",
  "machine": "$(uname -m)",
  "version": "$version",
  "architecture": "$arch",
  "signing": "$status",
  "health": true,
  "databaseRestart": true,
  "keychainRestart": true
}
EOF
echo "Installed macOS smoke passed ($status, $arch): $name"
