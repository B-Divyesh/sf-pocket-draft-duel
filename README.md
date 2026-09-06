# Pocket Draft Duel

Pocket Draft Duel is a browser card game for two to four friends. Make a room,
draft from 18 shared cards at the same time, choose a tactic for each of three
battles, and see one result. A round is designed to be short; it has no
accounts, collection, ranked ladder, chat, or custom cards.

The immediate sample is at `/demo`. It is a deterministic four-player practice
game with local practice opponents. It completes a full draft, three battles,
and a result without saving or reading real room data. The persistent demo
banner can reset the sample or return to the real-room start.

## Who it is for

Two to four friends who want a fresh tactical game by room code, without a
physical deck, login, deck building, or collectible cards.

## Run the static game

Prerequisites: Node 22+ and npm.

```sh
npm install
npm run dev
# Open http://127.0.0.1:5173/demo for the isolated sample
```

Controls work with pointer/touch and keyboard. Tab to a card and press Enter or
Space to lock it. The Settings control has a motion choice that persists in the
current storage area.

## Run a real room service

The static app expects a product-owned room service at `/api` by default. Start
the supplied Rust/SQLite service separately during development:

```sh
cd realtime
DATA_DIR=/tmp/pocket-draft-duel-data PORT=8787 cargo run
cd ..
VITE_REALTIME_URL=http://127.0.0.1:8787 npm run dev
```

Each browser receives a random reconnect token in localStorage after it creates
or joins a room. The service uses SQLite in `$DATA_DIR`, never a shared
database. It is server-authoritative: pending picks and other hands do not
appear in a player's room response; the service resolves collisions with a
rotating priority order and resolves battles from the fixed card values.

For production, run `realtime/Dockerfile` as one product-owned replica with a
durable `/data` volume, health probe `GET /health`, and a proxy from `/api` to
the service. Details are in `realtime/README.md`.

## Verify

```sh
npm test
npm run build
```

`npm test` runs deterministic rule tests, an actual two-client HTTP/SQLite room
run that includes a restart/reconnect and rate-limit check, an independent
two-browser room through its real result and reload, then desktop and phone
browser checks. Browser checks include the sample from draft to result,
demo reset isolation, keyboard play, persisted motion choice, privacy request
scope, route titles, console errors, and axe serious/critical violations.

To run only a public claim check:

```sh
npm run test:claims -- --grep @claim:practice-complete
```

The build writes the static site to `dist/`.

## Privacy and billing

No analytics, advertising pixels, third-party scripts, or third-party fonts are
loaded. The practice game uses only a `demo:pocket-draft-duel:*` localStorage
namespace. See `/privacy` and `/terms` for the room-service data and planned
host unlock terms.

The free Marsh practice set is complete. A planned $4.99 one-time host set
unlock keeps two additional balanced draft sets paid. Billing registration,
checkout, and license activation are not yet available, so the product does not
claim that purchase or activation works.

## Deploy

Deploy `dist/` as the static site. Keep `staticwebapp.config.json` with the
deployment for headers and SPA routing. The factory must separately deploy the
included product-owned realtime service with its durable `/data` volume before
advertising live room codes. Do not use a shared database or more than one
realtime replica.

## License

MIT. See [LICENSE](LICENSE).
