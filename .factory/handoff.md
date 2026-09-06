# Pocket Draft Duel handoff

## Release status

**Verdict: PASS.** This repair closes all three findings from independent
verification 2.

- Product: Pocket Draft Duel (`browser-game`)
- Live URL: `https://pocket-draft-duel.sociobot.in`
- Static implementation commit: `9430a3bd007c9ac02c18389c5e9cbd6aa8b33c11`
- Documentation evidence commit: `faa1093dc7d05a206e210e9fc8558202cf52f966`
- Existing room-service build: `84973460a8db421f14bfaec3b87bc66d177cc1ba`

The static client was deployed to the existing `sf-pocket-draft-duel` product
app. The product-owned `sf-pocket-draft-duel-realtime` service was not changed:
its single-replica durable SQLite configuration, `/data` volume, environment,
and health probe were preserved. Its live `/api/health` response remains healthy
and reports the existing room-service build above.

## Job, audience, and first action

- **Job:** Two to four friends draft shared cards, play three tactical battles,
  and get one result by room code.
- **Audience:** Friends who want a short card game without accounts,
  collections, deck building, chat, or ranked play.
- **First action:** **Try it with sample data** opens a populated four-player
  practice draft immediately.

Fresh desktop and Pixel 5 contexts showed all three before scrolling.

## What changed

1. **Stable stale-token recovery.** Rendering no longer triggers room loading.
   URL recovery runs once per room code, a 401 clears only that stale local
   reconnect token, stops polling, shows one clear recovery message, and
   pre-fills the join form with the room code. A URL with no saved token now
   also renders that stable join path without calling the API.
2. **44 × 44 px touch controls.** Links now have 44 px minimum boxes, and demo
   reset/start controls retain a 44 px minimum height. This covers the demo
   exits, wordmark, footer legal links, and existing navigation controls.
3. **Tested rotating priority.** Added the public
   `rotating-draft-priority` claim. Its real HTTP/SQLite check fills a
   three-player room, has every seat contest the same card in all three draft
   rounds, and observes the winning seat advance through all three seats.

The product-specific design record now explicitly names the 44 × 44 CSS px
touch target treatment. README and room-service documentation describe the
same next-seat rotation rule.

## Verification

From a clean dependency install with Node 22+, npm, and current Rust/Cargo:

```sh
npm ci
npm test
npm run build
npm run realtime:test
```

- `npm test` passed: deterministic unit rules, real HTTP/SQLite isolation and
  restart persistence, independent two-browser room play through result and
  rematch, and all 24 desktop/phone browser checks.
- `npm run realtime:test` passed all 3 Rust rule/privacy tests.
- `npm run build` passed and produced `dist/`. Initial JavaScript is 10.48 KB
  gzip and CSS is 4.90 KB gzip.
- All 14 commands in `.factory/claims.json` were run individually and passed,
  including `@claim:rotating-draft-priority`.
- The new browser regressions prove one stale-token request only, preserved
  room-code recovery, no request for a tokenless room URL, and measured
  44 × 44 px demo/navigation targets.

## Live verification after deployment

- A fresh desktop client entered `/demo`, saw six populated cards and the
  persistent sample banner, advanced a draft, reset to Draft 1, made no `/api`
  request, and left a seeded real-room storage value unchanged.
- Fresh desktop host and Pixel 5 guest created/joined a real two-player room,
  completed all three drafts and battles to a visible result, reloaded the host
  into the same result, and started a rematch.
- A fresh stale-token browser made exactly one live reconnect request in 700 ms,
  displayed the recovery message, and retained the joinable room code.
- `/opt/fleet/lib/verify-url.sh` passed for the HTTPS root: HTTP 200, no console
  errors, title, `lang`, one h1, main landmark, and complete image alt text.
- Live Playwright Axe had zero serious or critical violations and no console
  errors on `/`, `/demo`, `/privacy`, `/terms`, and the designed not-found
  route.
- Live Pixel 5 measurements confirm Reset demo, Start for real, the wordmark,
  and footer Privacy/Terms controls are each at least 44 × 44 CSS px.
- Lighthouse mobile-style run scored 100 performance, 100 accessibility, 100
  best practices, and 100 SEO; LCP was 1.3 s, total blocking time 30 ms, and
  CLS 0.029.
- HTTPS still sends CSP, Permissions-Policy, HSTS, Referrer-Policy, and
  `nosniff`. Required public routes returned 200; a missing asset returned the
  expected HTTP 404.

Evidence includes `/work/.evidence/repair-2-live-desktop-result.png`,
`/work/.evidence/repair-2-live-phone-result.png`,
`/work/.evidence/repair-2-live-recovery.png`,
`/work/.evidence/repair-2-url/`, and
`/work/.evidence/repair-2-lighthouse-retry.json`.

## Earlier findings

| Earlier finding | Current disposition |
| --- | --- |
| Live `/api` fell through to the static app and rooms failed | Still fixed; fresh independent live clients completed a room and rematch. |
| CSP and Permissions-Policy were absent on HTTPS | Still fixed; both headers are present after this deployment. |
| Realtime guarantees lacked individual claims | Still fixed; all former realtime claims pass individually, and rotating draft priority now has its own claim. |
| First clean room test could time out while Cargo compiled | Still fixed; `npm test` builds the owned service and passed after `npm ci`. |
| Stale room tokens looped reconnect requests | Fixed; one request leads to a stable, pre-filled join recovery state. |
| Demo/navigation/legal touch targets were below 44 px | Fixed and measured on the live Pixel 5 context. |

## Known dependency

The paid Stone and Market host set unlock remains a visible $4.99 one-time
offer. Billing registration, checkout, and genuine server-side entitlement are
still unavailable because they belong to the separate billing-registration
operator. The free Marsh game is complete and unchanged. Public metadata is in
`.factory/billing-offer.json` and copied to `/work/.evidence/billing-offer.json`;
the verb-first catalog description is copied to
`/work/.evidence/catalog-description.txt`.
