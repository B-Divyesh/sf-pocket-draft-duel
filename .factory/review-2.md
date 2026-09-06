# Review 2: Draft and duel with friends

## Verdict: PASS

Pocket Draft Duel completes its sample and live room-code game on desktop and
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
action, three plain facts, and part of the playable game sheet before scrolling.

## Reviewed revisions

- Implementation candidate:
  `9430a3bd007c9ac02c18389c5e9cbd6aa8b33c11`
- Documentation baseline:
  `2093994ffee2dd3def8cf1c5cc574695e17a5c0d`
- Live room-service build:
  `84973460a8db421f14bfaec3b87bc66d177cc1ba`
- Live URL: `https://pocket-draft-duel.sociobot.in`
- Review date: 2026-09-06 UTC

The live JavaScript and CSS names match a clean build of the implementation
candidate. Their SHA-256 hashes also match byte for byte. Changes after that
candidate are review and handoff documents only, so no later product image is
required.

## Findings

None.

## Earlier findings

| Earlier finding | Current disposition |
| --- | --- |
| Live `/api` fell through to the static app | Fixed. Health returns room-service JSON, and independent desktop and phone clients completed a live game and rematch. |
| CSP and Permissions-Policy were absent | Fixed. Both headers are present on the root and deliberate HTTP 404 responses. |
| Realtime guarantees lacked individual claims | Fixed. Every public realtime guarantee has an independently runnable claim command. |
| A cold `npm test` timed out during Rust compilation | Fixed. The full suite passed after only the documented clean setup. |
| Stale reconnect tokens caused repeated requests | Fixed. A wrong token for an existing room made one request, cleared itself, showed a stable error, and prefilled the code. |
| Demo, wordmark, and legal targets were below 44 px | Fixed. All five controls measured at least 44 × 44 CSS px on Pixel 5. |
| Rotating collision priority was not tested | Fixed. Its separate three-seat, three-round claim passed. |

The $4.99 Stone and Market host set remains visibly disabled until the separate
operator registers billing. Checkout and activation are explicitly unavailable
and are not claimed to work. The complete free game does not depend on them.

## Declared claims

All 14 commands in `.factory/claims.json` ran separately from the clean
checkout. Each claim tag appears in exactly one test definition.

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
- Initial JavaScript is 10.38 KB gzip and CSS is 4.90 KB gzip.

## Sample and complete game

The one-click sample opened six populated choices with Moss, Brick, and
Thimble. The **Demo — sample data, nothing is saved** label stayed visible
through the result. Enter and Space both advanced card choices. **Reset demo**
returned to Draft 1, preserved a seeded real-room storage marker, made no
`/api` call, and made no cross-origin request.

The deterministic sample completed three drafts and three battles. It showed
**Moss won the duel**, four final scores, and three battle records. **Play
practice again** returned to Draft 1. The motion setting persisted after reload
and removed control movement.

## Live multiplayer

A fresh desktop host and independent Pixel 5 guest created and joined a live
two-player room. Host picks used both Enter and Space. While one choice was
locked, the guest saw only “1 of 2 picks are locked”; public hand counts did
not change until both players locked.

Both clients completed three drafts and three battles. They showed the same
winner, scores, and three battle records. The phone reloaded into the same
result. The host started a rematch, which restored Draft 1, zero scores, and no
battle records on both clients. Separate live checks also filled three- and
four-player rooms.

A direct live resolution check chose a visible value 5 against value 1. The
returned record contained those values and named the higher play as winner.
Pending draft and battle choices were absent from the other player's response.

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
- allowance exhaustion: 429 with `Retry-After: 60`;
- product origin CORS: allowed; unrelated origin: not allowed.

The clean integration restarted the owned service over temporary SQLite data
and restored the same room and seat. Production was not restarted for this
report-only assignment. Source inspection confirms the service uses bundled
SQLite at `$DATA_DIR/pocket-draft-duel.sqlite` and has no PostgreSQL or
third-party service dependency.

A wrong token for an existing room made one request, cleared itself, showed a
stable recovery message, and prefilled the room code. A tokenless room link
made no room request and also left its code ready to join.

## Accessibility, routes, privacy, and performance

- `/opt/fleet/lib/verify-url.sh` passed: HTTPS 200, no console errors, title,
  `lang="en"`, one h1, main landmark, and labelled controls.
- Playwright Axe found zero serious or critical violations on `/`, `/demo`,
  `/privacy`, `/terms`, the in-app not-found route, and the HTTP 404 page.
- The skip link is first in keyboard order and visibly focused. Enter and Space
  operate cards. SPA navigation focuses the new h1. No keyboard trap appeared.
- System reduced motion disables smooth scrolling and transitions. The saved
  motion choice removes control movement. The sample remained operable at 200%
  text size without horizontal overflow.
- Pixel 5 targets measured: wordmark 156 × 44, Privacy 44 × 44, Terms 44 × 44,
  Reset demo 85 × 44, and Start for real 84 × 44 CSS px.
- Empty and short room codes are blocked by browser validation. An unknown
  six-character code produces a stable plain-language error.
- Every rendered internal link resolved. Route titles, canonical URLs, legal
  pages, sitemap, robots, icons, and 1200 × 630 social art are present.
- A missing asset deliberately returned HTTP 404 with the designed title, one
  h1, main landmark, no serious or critical Axe issue, and a link home.
- Root and 404 responses send CSP, Permissions-Policy, HSTS,
  Referrer-Policy, and `nosniff`.
- No analytics, third-party scripts, external fonts, cross-origin sample
  requests, or sample requests to the room API appeared.
- Lighthouse scored 100 performance, 100 accessibility, 100 best practices,
  and 100 SEO. LCP was 1.26 s, total blocking time 68 ms, CLS 0.029, and total
  transfer was 73.4 KB.
- A two-second animation-frame sample measured 60.9 fps on desktop and 60.4 fps
  in the Pixel 5 context. The turn-based game makes no frame-rate claim.

The game has no timer, continuous simulation, sound, screen shake, or
precise-timing action, so pause, audio, fixed-timestep, and assist controls do
not apply. Practice progress and motion settings recover locally; live
progress recovers through the room service.

## Evidence

Evidence is under `/work/.evidence/review-2/`. Key files are:

- `clean/npm-ci-clean.log`, `clean/npm-test.log`, `clean/npm-build.log`, and
  `clean/realtime-test.log`;
- `claims/*.log` for every declared command;
- `live/desktop-first-screen.png` and `live/phone-first-screen.png`;
- `live/demo-desktop-result.png`, `live/live-desktop-result.png`, and
  `live/live-phone-result.png`;
- `live/video-desktop/`, `live/video-live-host/`, and
  `live/video-live-guest/` for recorded runs;
- `live/stale-token-recovery.png` and `live/http-404.png`;
- `live/browser-review.log`, `live/api-review.log`,
  `live/live-resolution.log`, and `live/frame-rate.log`;
- `url/verify.json`, `lighthouse.json`, and
  `live/live-candidate-sha256.txt`.
