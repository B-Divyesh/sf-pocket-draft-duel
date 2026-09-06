# Review: Draft and duel with friends

## Verdict: PASS

Pocket Draft Duel completes its sample and real room-code game on desktop and
phone. Every declared claim passed from a fresh checkout. This strict review
found no defects and no untested public claims.

- Finding count: **0**
- Untested claim count: **0**

## Job, audience, and first action

- **Job:** Two to four friends draft shared cards, play three tactical battles,
  and get one result by room code.
- **Audience:** Friends who want a short card game without accounts,
  collections, deck building, chat, or ranked play.
- **First action:** **Try it with sample data** opens a populated four-player
  practice draft in one click.

Fresh 1440 × 900 desktop and Pixel 5 contexts showed the job, audience, first
action, three plain facts, and the game sheet before scrolling.

## Reviewed revisions

- Implementation candidate:
  `9430a3bd007c9ac02c18389c5e9cbd6aa8b33c11`
- Documentation baseline:
  `ebe4de1d5b6ff46a243d06f1cb3ca5def91bad36`
- Live room-service build:
  `84973460a8db421f14bfaec3b87bc66d177cc1ba`
- Live URL: `https://pocket-draft-duel.sociobot.in`
- Review date: 2026-09-06 UTC

The live JavaScript and CSS names match a clean build of the implementation
candidate. Their SHA-256 hashes also match byte for byte. Commits after the
implementation candidate only change review and handoff documents, so they do
not require a new product image. The full repository copy of verification 3
was reviewed. Its separately referenced `factory-evidence` report was not
mounted in this worker, so every relevant result was reproduced independently.

## Findings

None.

## Earlier findings

| Earlier finding | Current disposition |
| --- | --- |
| Live `/api` fell through to the static app | Fixed. Health returns room-service JSON, and independent desktop and phone clients completed a room and rematch. |
| CSP and Permissions-Policy were absent | Fixed. Both headers are present on the root and deliberate HTTP 404 responses. |
| Realtime guarantees lacked individual claims | Fixed. Each realtime guarantee has an independently runnable claim command. |
| A cold `npm test` timed out during Rust compilation | Fixed. The full suite passed after only the documented `npm ci` setup. |
| Stale reconnect tokens caused repeated requests | Fixed. A real stale token made one request, cleared itself, showed a stable error, and prefilled the room code. |
| Demo, wordmark, and legal targets were below 44 px | Fixed. All five controls measured at least 44 × 44 CSS px on Pixel 5. |
| Rotating collision priority was not tested | Fixed. Its separate three-seat, three-round claim passed. |

The $4.99 Stone and Market host set remains visibly disabled until the separate
operator registers billing. Checkout and activation are not claimed to work,
so this external dependency is not a defect in the complete free game.

## Declared claims

All 14 commands in `.factory/claims.json` ran separately from a clean checkout.

| Claim | Result |
| --- | --- |
| `practice-complete` | PASS |
| `demo-reset` | PASS |
| `demo-local-only` | PASS |
| `keyboard-draft` | PASS |
| `settings-persist` | PASS |
| `fixed-card-set` | PASS |
| `no-account-practice` | PASS |
| `no-third-party-requests` | PASS |
| `live-room-code` | PASS |
| `private-simultaneous-picks` | PASS |
| `reconnect-persistence` | PASS |
| `deterministic-resolution` | PASS |
| `room-rate-limit` | PASS |
| `rotating-draft-priority` | PASS |

The landing page, both READMEs, legal pages, demo document, and paid offer were
cross-checked against the registry. No public claim is missing, false,
incomplete, or untested. Offline play, automatic updates, paid checkout, paid
activation, and a frame-rate guarantee are not promised.

## Fresh checkout and build

- Node 22.23.2, npm 10.9.8, Rust/Cargo 1.98.0.
- `npm ci` passed with zero reported vulnerabilities.
- `npm test` passed: 3 unit tests, HTTP/SQLite integration, independent local
  browsers through result/reload/rematch, and 24 desktop/phone browser tests.
- `npm run build` passed and produced `dist/`.
- `npm run realtime:test` passed all 3 Rust privacy and resolution tests.
- Initial JavaScript is 10.48 KB gzip and CSS is 4.90 KB gzip.

## Sample and complete game

The one-click sample opened six populated choices with Moss, Brick, and
Thimble. The **Demo — sample data, nothing is saved** label stayed visible
through the result. A keyboard pick advanced the draft. **Reset demo** returned
to Draft 1, preserved a seeded real-room storage marker, made no `/api` call,
and made no cross-origin request.

The deterministic sample completed three drafts and three battles. It showed
**Moss won the duel**, four final scores, and three battle records. **Play
practice again** returned to Draft 1.

## Live multiplayer

A fresh desktop host and independent Pixel 5 guest created and joined a live
two-player room. The first host pick used Enter and the next used Space. While
one choice was locked, the guest saw only “1 of 2 picks are locked”; public
hand counts did not change until both players locked.

Both clients completed three drafts and three battles. They showed the same
winner, scores, and three battle records. The phone client reloaded into the
same result. The host started a rematch, which restored Draft 1, zero scores,
and no battle records.

## Backend, boundaries, and recovery

The live product service passed these independent checks:

- health: 200 with build `84973460a8db421f14bfaec3b87bc66d177cc1ba`;
- player counts 1 and 5: 400;
- empty and 19-character names: 400;
- unavailable paid set: 403;
- malformed JSON: 400;
- unknown room: 404;
- start before full: 409;
- another room's token: 401;
- overfill: 409;
- guest start: 403;
- invalid card: 400;
- duplicate pick: 409;
- battle before draft completion: 409;
- first 60 isolated room reads: 200;
- next read: 429 with `Retry-After: 60`;
- product origin CORS: allowed; unrelated origin: not allowed.

The clean integration restarted the owned service over temporary SQLite data
and restored the same room and seat. Production was not restarted for this
report-only assignment. Source inspection confirms the service uses bundled
SQLite at `$DATA_DIR/pocket-draft-duel.sqlite` and has no PostgreSQL dependency.

A real stale reconnect token made one request, cleared itself, showed one
recovery message, and prefilled the room code. A tokenless room link made no
room request and also left its code ready to join.

## Accessibility, routes, privacy, and performance

- `/opt/fleet/lib/verify-url.sh` passed: HTTPS 200, no console errors, title,
  `lang="en"`, one h1, main landmark, and labelled controls.
- Playwright Axe found zero serious or critical violations on `/`, `/demo`,
  `/privacy`, `/terms`, the in-app not-found route, and the HTTP 404 page.
- The skip link is first in keyboard order and visible when focused. Enter and
  Space operate cards. SPA navigation and browser Back focus the new h1.
- Reduced motion uses instant transitions and automatic scrolling. The saved
  motion setting passed its reload claim. The sample remained readable and
  operable at 200% text size without horizontal overflow.
- Pixel 5 targets measured: wordmark 156 × 44, Privacy 44 × 44, Terms 44 × 44,
  Reset demo 85 × 44, and Start for real 84 × 44 CSS px.
- Required empty names and short room codes are blocked by browser validation.
  An unknown six-character code produces a stable plain-language error.
- Every rendered same-origin link resolved. Route titles, canonical URLs,
  legal pages, sitemap, robots, icons, and 1200 × 630 social art are present.
- A missing asset deliberately returned HTTP 404 with the designed title, one
  h1, main landmark, no serious or critical Axe issue, and a link home.
- Root and 404 responses send CSP, Permissions-Policy, HSTS,
  Referrer-Policy, and `nosniff`.
- No analytics, third-party scripts, external fonts, cross-origin sample
  requests, or sample requests to the room API appeared.
- Lighthouse scored 100 performance, 100 accessibility, 100 best practices,
  and 100 SEO. LCP was 1.23 s, total blocking time 0 ms, CLS 0.029, and total
  transfer was 73 KB.
- A two-second animation-frame sample measured 60.8 fps on desktop and 60.4 fps
  in the Pixel 5 context. The turn-based game makes no public frame-rate claim.

The game has no timer, continuous simulation, sound, or precise-timing action,
so pause, audio, fixed-timestep, and assist controls do not apply. Practice
progress and motion settings recover locally; live progress recovers through
the room service.

## Evidence

Evidence is under `/work/.evidence/review-1/`. Key files are:

- `clean/npm-ci.log`, `clean/npm-test.log`, `clean/npm-build.log`, and
  `clean/realtime-test.log`;
- `claims/*.log` for every declared command;
- `live/desktop-first-screen.png` and `live/phone-first-screen.png`;
- `live/demo-phone-result.png`, `live/live-desktop-result.png`, and
  `live/live-phone-result.png`;
- `live/stale-token-recovery.png` and `live/http-404.png`;
- `live/browser-review.log`, `live/api-review.log`,
  `live/recovery-accessibility.log`, and `live/forms-links.log`;
- `url/verify.json`, `lighthouse.json`, and
  `live/live-candidate-sha256.txt`.
