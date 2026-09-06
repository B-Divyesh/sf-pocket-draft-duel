# Pocket Draft Duel handoff

## Release candidate

- Product: Pocket Draft Duel (`browser-game`)
- Job: let two to four friends draft shared cards, fight three tactical battles,
  and get a real result by room code.
- Audience: friends who want a short fresh game without an account, collection,
  deck building, chat, or ranked play.
- First action: **Try it with sample data** opens the full local practice draft.
- Implementation SHA: `f36ec0c5016f4ee396fe28d8cf22b9ea94d86768`
- Documentation candidate SHA: `c2afc0b165ef5d6710f3bb6065ad120a87850123`
  (the implementation and its latest documentation revision differ).

## What is built

- Vite + TypeScript static game in `dist/` with `/`, `/demo`, `/privacy`,
  `/terms`, and a designed 404 route.
- A complete one-click four-player practice game: three shared draft choices,
  three card-and-tactic battles, a deterministic winner, reset, and another
  practice run. It stores only under `demo:pocket-draft-duel:*` and has a
  persistent sample banner.
- Keyboard-operable cards and tactics, touch-sized controls, skip link, focus
  styling, self-hosted DM Serif Display and Source Sans 3, reduced motion,
  titles, landmarks, legal pages, sitemap, robots, CSP, social card, and local
  original SVG card art.
- Product-owned Axum + SQLite room service in `realtime/`: host/join room codes,
  two to four seats, server-authoritative hidden picks, rotating draft priority,
  deterministic three-battle resolution, reconnect tokens, persistence,
  rematch, health endpoint, and per-client `429` / `Retry-After: 60` limits.
- The free Marsh set is complete. Stone and Market balanced sets are present and
  remain locked behind the $4.99 one-time host set unlock. There is no checkout,
  license validation, or fake activation while billing registration is absent.

## Verification performed

From a clean Node install (`npm ci`):

```sh
npm test
npm run build
npm run realtime:test
npm run test:claims
```

All passed. `npm test` includes a real two-client HTTP/SQLite game with a
restart/reconnect and a `429` check, plus a separate two-browser game through a
visible result and host reload. Browser coverage runs desktop and Pixel 5
contexts, completes the sample from draft to result, checks reset isolation,
keyboard selection, persisted settings, route titles, console errors, and axe
serious/critical violations. Every command in `.factory/claims.json` was also
run individually.

Local production preview verification passed with `/opt/fleet/lib/verify-url.sh`:
HTTP 200, no console errors, title/lang/one h1/main present, no missing image
alt text, and no unlabeled buttons. The Playwright axe integration passed.
Lighthouse mobile on `/demo`: Performance 100, Accessibility 100, Best
Practices 100, SEO 100. Built JavaScript is 10.14 KB gzip and CSS is 4.89 KB
gzip; the browser requests only the required local Latin font subsets.

## Deployment and known gaps

- The static product build is ready in `dist/`. Keep
  `staticwebapp.config.json` in the deployment.
- The live product origin could not be resolved from this worker at handoff
  time (`Could not resolve host`), so a live HTTPS cold check is not claimed.
- A real room service must still be deployed as the product-owned
  `sf-pocket-draft-duel-realtime` service (or equivalent product-owned service)
  with the supplied Dockerfile, exactly one replica, a durable `/data` mount,
  `GET /health` probe, and `/api` proxy. Until then the deployed static page
  correctly reports that live-room creation is unavailable; practice remains
  complete and isolated.
- Billing registration is a separate operator dependency. Public offer metadata
  is at `/work/.evidence/billing-offer.json`; catalog copy is at
  `/work/.evidence/catalog-description.txt`. Checkout or entitlement activation
  is not claimed to work.

## Next operator actions

1. Deploy the static `dist/` image and the product-owned room service together
   with the durable SQLite volume and one-replica bound.
2. Point the static `/api` path to the room service, then repeat the two-client
   browser run against HTTPS.
3. Register the $4.99 one-time offer using the evidence metadata and implement
   genuine server-side license validation before enabling Stone or Market.
4. Verify the live product URL on fresh desktop and phone browsers after DNS is
   available.

## Independent verification 1 (2026-09-06 UTC)

**Verdict: FAIL.** The live hostname now resolves and serves the same candidate
assets verified locally. Fresh desktop and phone checks completed the labelled
practice draft, its three battles, result, keyboard pick, and reset safely.
All eight declared claim commands passed separately; the local owned SQLite
room service also passed its two-client/reconnect/rate-limit run.

The product still cannot complete its real job at the public URL: the live
`/api` path is the static HTML fallback, and creating a room returns HTTP 405.
No live independent-player, persistence, or rematch run is therefore possible.
The live response is also missing the CSP and Permissions-Policy declared in
`staticwebapp.config.json`. The report records four findings and four unlisted
public realtime-claim groups, including an initial clean `npm test` timeout
while Rust compiled. See `.factory/verification-1.md` for evidence and next
steps.
