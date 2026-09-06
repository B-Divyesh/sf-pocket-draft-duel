# QA: Draft and duel with friends

## Verdict: FAIL

Pocket Draft Duel’s public practice game works, but its real room-code game is
not available at the live URL. This prevents the product from completing its
main job for friends, so it cannot pass.

## Job, audience, and first action

- **Job:** Two to four friends draft shared cards, play three tactical battles,
  and see a result by room code.
- **Audience:** Friends who want a short, fresh card game without accounts,
  collections, deck building, chat, or ranked play.
- **First action:** Select **Try it with sample data**. It immediately opens a
  populated four-player practice draft.

## Reviewed revision and scope

- Implementation candidate: `f36ec0c5016f4ee396fe28d8cf22b9ea94d86768`
- Documentation candidate: `c2afc0b165ef5d6710f3bb6065ad120a87850123`
- Live URL: `https://pocket-draft-duel.sociobot.in`
- Review date: 2026-09-06 UTC

The live HTML references `assets/index-Djkjr_g0.js` and
`assets/style-DRQBxCoR.css`, matching the candidate built locally. Earlier
documentation said the hostname was unresolved. It now resolves and serves
HTTP 200. The earlier documented missing realtime deployment and billing
registration remain absent; only the former blocks the core game.

## Findings

1. **Blocker — live rooms cannot be created or joined.**
   On the live home page, submitting the valid Host a room form displays:
   “Could not create a room: Room service returned 405. Try practice while the
   service is unavailable.” `POST /api/rooms` returns 405. `GET /api/health`
   and `GET /api/rooms` return the static HTML fallback with HTTP 200 rather
   than room-service JSON. The local Rust/SQLite service works, but it is not
   connected to the live static app. This fails the real two-to-four-friend
   room-code job and prevents a live independent-client, persistence, or
   rematch check.

2. **Medium — the live deployment does not send the configured CSP or
   Permissions-Policy headers.**
   `staticwebapp.config.json` specifies both headers, including
   `frame-ancestors 'none'`, but the live root response contains neither.
   The page has no equivalent CSP meta tag. The deployment must carry the
   static configuration or set equivalent response headers.

3. **Medium — several public realtime claims are not registered in
   `.factory/claims.json` with individual `@claim:` checks.**
   The README and room-service README state that live rooms are
   server-authoritative/private, persist reconnects, resolve deterministically,
   and apply a `429`/`Retry-After: 60` limit. The landing page also promises
   two-to-four-player room-code play and simultaneous hidden picks. Existing
   broad integration tests exercise much of this locally, but none of these
   claims has the required claim entry and tagged, individually runnable
   sandbox command. This is four untested public-claim groups.

4. **Low — `npm test` is not reliable from the documented clean setup.**
   After `npm ci`, the first `npm test` run timed out in
   `test:realtime-browser` while its `cargo run` child was compiling Rust
   dependencies; its fixed 12-second health wait expired. `README.md` names
   Node 22+ as the only prerequisite. After running `npm run realtime:test`
   to finish that compilation, `npm test` passed. Document Rust/Cargo and make
   the browser integration test wait through a first compile, or run the built
   binary in the test.

## Checks that passed

- Fresh `npm ci` completed with no dependency vulnerabilities reported.
- `npm run build` passed and created `dist/`. The main JS is 10.14 KB gzip and
  CSS is 4.89 KB gzip.
- `npm run realtime:test` passed: 3 Rust rule/privacy tests.
- A subsequent full `npm test` passed. Its recorded Playwright result is
  `status: passed`; it included local two-browser play to a result, reload
  reconnect, and the real HTTP/SQLite run with 429 handling.
- Every declared claim command was run separately and passed:
  `practice-complete`, `demo-reset`, `demo-local-only`, `keyboard-draft`,
  `settings-persist`, `fixed-card-set`, `no-account-practice`, and
  `no-third-party-requests`.
- Local manual room-service boundary checks returned 400 for player counts 1
  and 5, 404 for an unknown room, accepted and filled 2-, 3-, and 4-player
  rooms, and returned 409 when each was overfilled. No tokens are recorded in
  this report.
- Fresh live desktop and Pixel 5 contexts showed the job, audience, and
  one-click sample action before scrolling. Both opened a realistic populated
  six-card practice draft with the persistent “Demo — sample data, nothing is
  saved” label and no console errors on initial load.
- A live desktop deterministic practice run used keyboard Enter for the first
  draft pick, completed three battles, showed “Moss won the duel” with three
  battle records, and retained the demo label. “Play practice again” returned
  to Draft 1; no non-demo localStorage keys were created in the clean context.
- Live route titles and designed pages passed for `/privacy`, `/terms`, and an
  invalid route. The invalid route renders a usable in-app 404 page with a way
  back.
- Playwright Axe checks against live `/`, `/demo`, `/privacy`, `/terms`, and
  an invalid route found zero serious or critical violations. The standalone
  `@axe-core/cli` command could not locate a system Chrome binary in this
  container; the project’s Playwright Axe integration and the live
  Playwright-Axe check were used instead.
- Phone and desktop screenshots, including the live end screen and unavailable
  room path, are stored under `/work/.evidence/` for this verification run.

## Required next steps

1. Deploy the product-owned single-replica Rust room service with its durable
   `/data` SQLite mount and route the static app’s `/api` requests to it.
2. Recheck two fresh live browser clients through draft, all three battles,
   reload/reconnect, and rematch; then correct the live header deployment.
3. Register each public realtime guarantee in `.factory/claims.json` and add
   tagged tests. Make the documented clean verification setup reliable.

