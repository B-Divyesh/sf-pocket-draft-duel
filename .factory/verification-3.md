# QA: Draft and duel with friends

## Verdict: PASS

Pocket Draft Duel completes its sample and real room-code job on desktop and
phone. Every declared claim passed from a fresh checkout. This review found no
defects and no untested public claims.

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
action, and game sheet before scrolling.

## Reviewed revisions

- Implementation candidate:
  `9430a3bd007c9ac02c18389c5e9cbd6aa8b33c11`
- Documentation evidence:
  `0ee9e1ed1a1ae06ec3983e7ad6da910f77796bc6`
- Existing room-service build reported by live health:
  `84973460a8db421f14bfaec3b87bc66d177cc1ba`
- Live URL: `https://pocket-draft-duel.sociobot.in`
- Review date: 2026-09-06 UTC

Only `.factory/handoff.md` differs between the implementation and documentation
revisions. The live JavaScript and CSS names match the clean candidate build,
and their SHA-256 hashes match byte for byte. The later documentation revision
does not require another product image.

## Findings

None.

## Earlier findings

| Earlier finding | Current disposition |
| --- | --- |
| Live `/api` fell through to the static app | Fixed. Live health returns JSON, and independent desktop and phone clients completed a room and rematch. |
| CSP and Permissions-Policy were absent | Fixed. Both are present on root and 404 HTTPS responses. |
| Realtime guarantees lacked individual claims | Fixed. Every realtime guarantee has an individually runnable claim command. |
| A cold `npm test` timed out while Cargo compiled | Fixed. It passed from the documented fresh setup after `npm ci`. |
| Stale reconnect tokens looped requests | Fixed. A real stale token made one request, cleared itself, showed one recovery message, and prefilled the room code. |
| Demo, wordmark, and legal targets were below 44 px | Fixed. All five measured controls are at least 44 × 44 CSS px on Pixel 5. |
| Rotating collision priority was untested | Fixed. The new three-seat, three-round claim passed independently. |

The earlier unresolved billing registration is still an external dependency,
not a defect in the complete free game. Checkout and activation are visibly
disabled and are not claimed to work.

## Declared claims

All 14 commands in `.factory/claims.json` ran separately from the fresh clone.

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

The landing page, README, legal pages, room-service README, and paid offer were
cross-checked against this list. No operational claim was missing, false, or
only partly tested. Offline play, automatic updates, paid checkout, and paid
activation are not promised.

## Fresh checkout and build

- Node 22.23.2, npm 10.9.8, Rust/Cargo 1.98.0.
- `npm ci` passed with zero reported vulnerabilities.
- `npm test` passed: 3 unit rules, HTTP/SQLite integration, independent local
  browsers through result/reload/rematch, and 24 desktop/phone browser checks.
- `npm run build` passed and produced `dist/`.
- `npm run realtime:test` passed all 3 Rust privacy and resolution tests.
- Initial JavaScript is 10.48 KB gzip and CSS is 4.90 KB gzip.

## Sample and real game

The one-click sample opened six populated cards with Moss, Brick, and Thimble.
The **Demo — sample data, nothing is saved** label stayed visible throughout.
A keyboard pick advanced the draft. **Reset demo** returned to Draft 1, left a
seeded real-room storage value unchanged, made no `/api` request, and made no
cross-origin request.

The deterministic sample completed three drafts and three battles. It showed
**Moss won the duel**, four final scores, and three battle records. **Play
practice again** returned to Draft 1.

A fresh desktop host and independent Pixel 5 guest created and joined a live
two-player room. The first host pick used Enter. The guest saw only “1 of 2
picks are locked”; public hand counts did not change before the guest locked.
Both clients completed three drafts and three battles and showed the same
winner, scores, and three records. The guest reloaded into that result. The
host started a rematch, which restored Draft 1, zero scores, and no records.

## Backend, boundaries, and recovery

The live service passed these separate checks:

- health: 200 with the expected product-service build;
- player counts 1 and 5: 400;
- empty and 19-character names: 400;
- unavailable paid set: 403;
- malformed JSON: 400;
- unknown room: 404;
- start before full: 409;
- wrong token: 401;
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
report-only assignment. Live reload persistence and wrong-token isolation were
also checked with independent browsers. A tokenless room link made no room
request, showed a recovery message, and prefilled its join code.

## Accessibility, routes, privacy, and performance

- `/opt/fleet/lib/verify-url.sh` passed: HTTPS 200, no console errors, title,
  `lang="en"`, one h1, main landmark, and complete labels.
- Playwright Axe found zero serious or critical violations on `/`, `/demo`,
  `/privacy`, `/terms`, and the in-app not-found route.
- The skip link is first in keyboard order and has a visible focus outline.
  Enter and Space operate cards. SPA navigation and Back move focus to the new
  h1. No keyboard trap appeared.
- Reduced motion removes smooth scrolling and transitions. The saved motion
  setting survives reload. The sample remains readable and operable at 200%
  text size.
- Pixel 5 targets measured: wordmark 156 × 44, Privacy 44 × 44, Terms 44 × 44,
  Reset demo 85 × 44, and Start for real 84 × 44 CSS px.
- Every rendered link resolved. Route titles, canonical URLs, legal pages,
  sitemap, robots, icons, and social art are present.
- A missing asset deliberately returned HTTP 404 with the designed title, one
  h1, main landmark, and a link home. Its expected 404 console resource message
  is not a defect.
- Root and 404 responses send CSP, Permissions-Policy, HSTS,
  Referrer-Policy, and `nosniff`.
- No analytics, third-party scripts, external fonts, or cross-origin demo
  requests appeared.
- Lighthouse scored 99 performance, 100 accessibility, 100 best practices,
  and 100 SEO. LCP was 1.29 s, total blocking time 121 ms, CLS 0.029, and total
  transfer was 73 KB.
- A two-second animation-frame sample measured 60.6 fps on desktop and 60.5
  fps in the Pixel 5 context. The turn-based game makes no public frame-rate
  claim.

## Evidence

Evidence is under `/work/.evidence/verification-3/`. Important files include:

- `live/demo-result.png`
- `live/live-desktop-result.png`
- `live/live-phone-result.png`
- `live/stale-token-recovery.png`
- `live/http-404.png`
- `live-qa.log`, `live-api-qa.log`, and `live-misc-qa.log`
- `claims/*.log`, `npm-test.log`, `npm-build.log`, and `rust-tests.log`
- `url/verify.json`
- `lighthouse.report.json` and `lighthouse.report.html`
- `live-candidate-sha256.txt`
