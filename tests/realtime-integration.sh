#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d)"
data_dir="$test_dir/data"
port=18787
log_file="$test_dir/realtime.log"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  rm -rf "$test_dir"
}
trap cleanup EXIT

start_server() {
  (cd "$repo_dir/realtime" && DATA_DIR="$data_dir" PORT="$port" cargo run --quiet >"$log_file" 2>&1) &
  server_pid=$!
  for _ in $(seq 1 50); do
    if curl --silent --fail "http://127.0.0.1:$port/health" >/dev/null; then return; fi
    sleep .2
  done
  cat "$log_file"
  exit 1
}

json_field() {
  node -e 'const [json,path]=process.argv.slice(1); let value=JSON.parse(json); for (const key of path.split(".")) value=value[key]; process.stdout.write(String(value));' "$1" "$2"
}

request() {
  curl --silent --show-error --fail-with-body -H 'content-type: application/json' "$@"
}

start_server
health="$(curl --silent --fail "http://127.0.0.1:$port/health")"
[[ "$(json_field "$health" status)" == "ok" ]]

host="$(request -X POST "http://127.0.0.1:$port/rooms" --data '{"name":"Host","players":2,"setId":"marsh"}')"
code="$(json_field "$host" code)"
host_token="$(json_field "$host" token)"
guest="$(request -X POST "http://127.0.0.1:$port/rooms/$code/join" --data '{"name":"Guest"}')"
guest_token="$(json_field "$guest" token)"

request -X POST "http://127.0.0.1:$port/rooms/$code/start" --data "{\"token\":\"$host_token\"}" >/dev/null

for round in 1 2 3; do
  host_view="$(curl --silent --fail "http://127.0.0.1:$port/rooms/$code?token=$host_token")"
  card="$(node -e 'console.log(JSON.parse(process.argv[1]).offers[0])' "$host_view")"
  request -X POST "http://127.0.0.1:$port/rooms/$code/draft" --data "{\"token\":\"$host_token\",\"cardId\":\"$card\"}" >/dev/null
  request -X POST "http://127.0.0.1:$port/rooms/$code/draft" --data "{\"token\":\"$guest_token\",\"cardId\":\"$card\"}" >/dev/null
done

for round in 1 2 3; do
  host_view="$(curl --silent --fail "http://127.0.0.1:$port/rooms/$code?token=$host_token")"
  host_card="$(node -e 'console.log(JSON.parse(process.argv[1]).player.cards[0])' "$host_view")"
  guest_view="$(curl --silent --fail "http://127.0.0.1:$port/rooms/$code?token=$guest_token")"
  guest_card="$(node -e 'console.log(JSON.parse(process.argv[1]).player.cards[0])' "$guest_view")"
  request -X POST "http://127.0.0.1:$port/rooms/$code/battle" --data "{\"token\":\"$host_token\",\"cardId\":\"$host_card\",\"tactic\":\"advance\"}" >/dev/null
  request -X POST "http://127.0.0.1:$port/rooms/$code/battle" --data "{\"token\":\"$guest_token\",\"cardId\":\"$guest_card\",\"tactic\":\"brace\"}" >/dev/null
done

final_view="$(curl --silent --fail "http://127.0.0.1:$port/rooms/$code?token=$host_token")"
[[ "$(json_field "$final_view" status)" == "result" ]]
[[ "$(node -e 'console.log(JSON.parse(process.argv[1]).records.length)' "$final_view")" == "3" ]]

kill "$server_pid"; wait "$server_pid" || true; server_pid=""
start_server
reconnected="$(curl --silent --fail "http://127.0.0.1:$port/rooms/$code?token=$host_token")"
[[ "$(json_field "$reconnected" status)" == "result" ]]

rate_status=""
for _ in $(seq 1 66); do
  rate_status="$(curl --silent -o "$test_dir/rate-body" -D "$test_dir/rate-headers" -w '%{http_code}' "http://127.0.0.1:$port/rooms/$code?token=$host_token")"
done
[[ "$rate_status" == "429" ]]
grep -qi '^retry-after: 60' "$test_dir/rate-headers"

echo "realtime integration passed: independent clients completed a room, reconnect persisted, and rate limits returned 429"
