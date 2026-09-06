# Pocket Draft Duel room service

This product-owned Rust service makes room-code games authoritative. It uses
SQLite at `$DATA_DIR/pocket-draft-duel.sqlite`; mount durable product storage at
`/data` and run exactly one active revision and replica because writes are
process-local. On Azure Files, the durable database uses SQLite's `nolock` URI
and an in-memory journal because SMB rollback-journal locks are not reliable;
this is safe only with that enforced one-process deployment.

```sh
cd realtime
DATA_DIR=/data PORT=8080 cargo run
```

For a container deployment, build this directory and mount a persistent `/data`
volume. Link the product-owned container app as the static site's backend so
the static site sends its `/api` path here. The service does not use accounts
or third-party APIs.

The service has `GET /health` and room endpoints below `/rooms`. It stores
rooms and reconnect tokens in product SQLite. A room response shows only a
player's own hand, keeps pending choices private, rotates collision priority,
and records each chosen card and tactic value. It returns `429` with
`Retry-After: 60` after 60 room requests per minute.

`cargo test` verifies the rule engine. `npm run test:realtime` starts the real
HTTP service against a temporary SQLite directory, verifies a token from one
room cannot read another room, completes a two-client game, restarts it,
reconnects, and verifies rate limiting. `npm run test:realtime-browser` opens
two independent browser contexts against that service, plays to a visible
result, reloads the host session, and starts a rematch. Run each
public room claim independently with `npm run test:realtime-claims -- --grep
@claim:<id>`; the claim ids are in `.factory/claims.json`.
