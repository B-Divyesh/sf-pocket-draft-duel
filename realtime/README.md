# Pocket Draft Duel room service

This product-owned Rust service makes room-code games authoritative. It uses
SQLite at `$DATA_DIR/pocket-draft-duel.sqlite`; mount durable product storage at
`/data` and run exactly one replica because writes are process-local.

```sh
cd realtime
DATA_DIR=/data PORT=8787 cargo run
```

For a container deployment, build this directory and mount a persistent `/data`
volume. Put it behind the static site's `/api` path, or build the static site
with `VITE_REALTIME_URL` set to this service's public HTTPS origin. The service
does not use accounts or third-party APIs.

The service has `GET /health` and room endpoints below `/rooms`. It persists
reconnect tokens, hides pending choices and opponent hands, resolves draft
conflicts in a rotating server order, resolves three battles deterministically,
and returns `429` with `Retry-After: 60` after 60 room requests per minute.

`cargo test` verifies the rule engine. `npm run test:realtime` starts the real
HTTP service against a temporary SQLite directory, completes a two-client game,
restarts it, reconnects, and verifies rate limiting. `npm run test:realtime-
browser` opens two independent browser contexts against that service and plays
to a visible result before reloading the host session.
