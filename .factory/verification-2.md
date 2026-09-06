# QA: Draft and duel with friends

## Verdict: FAIL

Pocket Draft Duel completes its main sample and live two-player game, and all
13 declared claim commands pass. It does not pass independent verification
because this review found three defects, including one untested public claim.

- Finding count: **3**
- Untested claim count: **1**

## Job, audience, and first action

- **Job:** Two to four friends draft shared cards, play three tactical
  battles, and see one result by room code.
- **Audience:** Friends who want a short card game without accounts,
  collections, deck building, chat, or ranked play.
- **First action:** **Try it with sample data** opens a populated four-player
  practice draft in one click.

The job, audience sentence, and first action were all visible before scrolling
in fresh 1440 × 900 desktop and Pixel 5 contexts.

## Reviewed revisions

- Implementation candidate:
  `84973460a8db421f14bfaec3b87bc66d177cc1ba`
- Documentation evidence:
  `076ff0e6fe68ba49a6f2b09c426d578c7299aed7`
- Earlier report-only revision:
  `b3912b5b6440982e6d622c1a5078d0b80bbd0ccf`
- Live URL: `https://pocket-draft-duel.sociobot.in`
- Review date: 2026-09-06 UTC

The live backend health response names the implementation candidate. The live
HTML loads `index-Djkjr_g0.js` and `style-DRQBxCoR.css`, which are the same
asset names produced from the current clean checkout. Changes after the
implementation candidate are tests and documentation, not a later product
image.

## Findings

1. **High — room-link recovery retries continuously when a saved token is no
   longer valid.** A controlled live-client recovery check returned 401 for a
   stale room token. The page made 30 identical reconnect requests in 600 ms,
   because each failed `loadRoom()` calls `render()`, which calls `loadRoom()`
   again. This quickly consumes the 60-request allowance, ignores
   `Retry-After`, repeatedly replaces the join form, and prevents a stable
   recovery state. A fresh room URL with no token has the related silent case:
   no error is rendered and the room code is not copied into the join form.
   Show one stable error, stop polling/retrying, preserve or prefill the room
   code, and let the player join again.

2. **Medium — several phone touch targets are smaller than the required 44 ×
   44 CSS pixels.** On the live Pixel 5 demo, **Reset demo** and **Start for
   real** measured 36 px high. The home wordmark measured 27.2 px high, and
   footer Privacy and Terms links measured 20.4 px high. These are real links
   and controls, including the two required exits from the sample sandbox.
   Increase their clickable boxes to at least 44 px in each dimension.

3. **Medium — rotating collision priority is a public fairness claim with no
   declared claim test.** The game says “Priority rotates when picks collide,”
   and both READMEs describe rotating collision priority. No entry in
   `.factory/claims.json` names that guarantee, and the collision tests only
   assert unique allocations or progression. They do not assert that which
   seat receives a contested card changes across rounds. Add one claim and an
   individually runnable test that has every seat request the same card over
   successive rounds and checks the stated rotation.

## Declared claims

Every command in `.factory/claims.json` was run separately from the clean
checkout and passed:

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

The untested-claim count is one because the public collision-priority guarantee
is not represented in this file. Offline operation and paid checkout are not
claimed.

## Clean checkout and build

- Node `22.23.2`, npm `10.9.8`, Rust/Cargo `1.98.0`.
- `npm ci` passed with zero reported vulnerabilities.
- A cold `npm test` passed. It included 3 rule tests, the real HTTP/SQLite
  isolation and restart run, two independent local browser clients through
  result/reconnect/rematch, and 18 Playwright desktop/phone tests.
- `cd realtime && cargo test` passed all 3 Rust tests.
- `npm run build` passed and produced `dist/`, including
  `staticwebapp.config.json`.
- Initial JavaScript is 10.14 KB gzip and CSS is 4.89 KB gzip. The fonts used
  on first load total about 56 KB WOFF2.

## Live sample and full game

The fresh sample showed six original card choices and the labelled opponents
Moss, Brick, and Thimble. The persistent **Demo — sample data, nothing is
saved** banner remained after a keyboard pick. **Reset demo** returned to Draft
1 and left a seeded real-room storage marker unchanged. All requests were
same-origin, with no `/api` call. The deterministic run completed three drafts
and three battles, showed **Moss won the duel**, listed all three battle
records, and **Play practice again** returned to Draft 1.

A fresh desktop host and independent Pixel 5 guest created and joined one live
room. In every draft round, the guest saw the same six-card offer and “1 of 2
picks are locked” after the host locked by keyboard; the pending card was not
shown. Both clients completed three drafts and three battles. Both showed
**Pixel Guest won the duel**, the same three battle records, and a 5–4 result.
Both clients reloaded into that result. The host then started a rematch; both
clients returned to Draft 1 with zero scores and no battle records.

Screenshots are under `/work/.evidence/verification-2-live/`, including the
desktop and phone first screens, sample result, hidden-pick phone state, and
live desktop/phone result screens.

## Boundaries, privacy, and recovery

The live API returned the expected results for these independent checks:

- player counts 1 and 5: 400;
- empty and 19-character names: 400;
- unavailable paid set: 403 with the billing dependency explained;
- malformed JSON: 400;
- unknown room: 404;
- start before the room is full: 409;
- another room's token: 401;
- overfill: 409;
- guest start: 403;
- invalid card: 400;
- duplicate pick: 409;
- battle before draft completion: 409;
- first 60 isolated room reads: 200;
- next read: 429 with `Retry-After: 60`.

The local integration also restarted the owned service over its temporary
SQLite database and restored the same room and seat. Production was not
restarted during this report-only verification. The live CORS response allows
the product origin and does not allow an unrelated origin. No analytics,
third-party script, or external font request appeared during the checked
flows.

## Accessibility, routes, security, and performance

- `/opt/fleet/lib/verify-url.sh` passed with HTTP 200, no console errors,
  `lang="en"`, one h1, a main landmark, and labelled controls. Its output is in
  `/work/.evidence/verification-2-url/`.
- Playwright Axe found zero serious or critical issues on `/`, `/demo`,
  `/privacy`, `/terms`, and the in-app not-found route. The touch-size finding
  above comes from direct CSS-pixel measurements beyond Axe's result.
- The skip link is the first focus target and has a visible 3 px focus ring.
  Enter and Space both operated cards. SPA navigation and browser Back moved
  focus to the new h1. No keyboard trap appeared.
- The motion setting survived reload. System reduced motion changed smooth
  scrolling to `auto` and removed transition duration. Browser zoom was not
  disabled, and the sample remained operable at 200%.
- Every visible site link resolved. Route titles, canonical URLs, legal pages,
  robots, sitemap, icons, and social art were present.
- An excluded missing asset deliberately returned HTTP 404 with the designed
  title, one h1, main landmark, and link home. Its expected browser resource
  error is not a defect.
- The live root sends CSP, Permissions-Policy, HSTS, Referrer-Policy, and
  `nosniff` headers.
- Mobile Lighthouse scored 100 performance, 100 accessibility, 100 best
  practices, and 100 SEO. Measured LCP was 1.3 s, total blocking time 60 ms,
  and CLS 0.029. The report is
  `/work/.evidence/verification-2-live/lighthouse.json`.
- A two-second animation-frame sample measured 60.7 fps on desktop and 60.4
  fps in the Pixel 5 context. The game itself is turn-based and makes no public
  frame-rate claim.

## Earlier findings

| Earlier finding | Current disposition |
| --- | --- |
| Live `/api` returned the static fallback and rooms failed | Fixed. Health returns backend JSON, and two live clients completed and rematched a room. |
| CSP and Permissions-Policy missing | Fixed. Both are present on live HTTPS responses. |
| Realtime claims lacked individual commands | Fixed for the five added realtime claims; every command passes. The separate rotating-priority claim in this report remains missing. |
| Cold `npm test` timed out while compiling Rust | Fixed. The documented clean run passed without preparation beyond the stated prerequisites. |

## External dependency

The $4.99 Stone and Market host set unlock is visibly disabled and says billing
registration, checkout, and activation are unavailable. The offer metadata is
present and consistent. Commercial registration belongs to the separate
operator and was not treated as a defect in the free sample or live-room game.
