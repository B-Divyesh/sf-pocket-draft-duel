# Pocket Draft Duel handoff

## Current live release

- Product: Pocket Draft Duel (`browser-game`)
- Live URL: `https://pocket-draft-duel.sociobot.in`
- Job: Two to four friends draft shared cards, play three tactical battles, and
  get one result by room code.
- Audience: Friends who want a short fresh card game without accounts,
  collections, deck building, chat, or ranked play.
- First action: **Try it with sample data** opens a populated four-player
  practice draft immediately.
- Actual deployed implementation SHA:
  `84973460a8db421f14bfaec3b87bc66d177cc1ba`
- Static deployment: `a77a6ba4-e474-431a-94e5-b35852e6aa54`.
- Realtime image:
  `sociobotregistry.azurecr.io/sf-pocket-draft-duel-realtime@sha256:9c9cc334815df9df33a6886b086fe84c82a21b1b28c963daa73f67f4f9846308`.

The product has a product-owned linked room service,
`sf-pocket-draft-duel-realtime`. It is healthy as one active revision and one
replica, with a durable `/data` mount. `GET /api/health` currently returns the
implementation SHA above. The public static app is the only public path to the
linked backend; this is intentional.

## What was repaired

| Earlier finding | Current disposition |
| --- | --- |
| `/api` served the static fallback and `POST /api/rooms` returned 405 | Fixed. The built `dist/` now contains the Static Web App configuration, its fallback excludes `/api/*`, and the product-owned container app is linked as the backend. The backend accepts both local root routes and production `/api` routes. A public `POST /api/rooms` returned 201, and two fresh browsers completed a live room. |
| CSP and Permissions-Policy were absent from HTTPS | Fixed. The live root sends `Permissions-Policy: camera=(), microphone=(), geolocation=()` and the configured self-only CSP, including `frame-ancestors 'none'`. |
| Public realtime guarantees had no independent claim commands | Fixed. Five public realtime claims now have individually runnable `@claim:` checks: room codes/rematch, hidden simultaneous picks, restart/reconnect, deterministic resolution, and 429/Retry-After. |
| First clean `npm test` could time out compiling Rust | Fixed. Rust/Cargo is documented as a prerequisite, `test:realtime` builds the binary before browser checks, and the browser readiness wait allows a cold compile. A clean Rust target then completed `npm test`. |

The integration run now also proves room isolation: a reconnect token from one
room receives 401 when reading another room. This product has no account or
shared-tenant model; room code plus its random token is its access boundary.

## Product behaviour

- The free Marsh set offers a complete game: three simultaneous draft picks,
  three finite card-and-tactic battles, a deterministic result, and host
  rematch.
- The one-click `/demo` sample is separate from real rooms. It keeps only
  `demo:pocket-draft-duel:*` browser data, shows the persistent **Demo — sample
  data, nothing is saved** banner, has **Reset demo**, and does not call `/api`.
- Live rooms persist their room state and reconnect tokens in product SQLite.
  Service responses never expose another player's hand or pending pick.
- The service has a health endpoint, 60 room requests per minute per forwarded
  client address, and `429` with `Retry-After: 60` after the allowance.
- Stone and Market balanced draft sets remain a $4.99 one-time host unlock. No
  checkout, license validation, invented activation, or paid random packs are
  present while billing registration is unavailable.

## Verification

From the documented setup after `npm ci` (Node 22+ and current Rust/Cargo), the
following final checks passed:

```sh
npm test
npm run build
npm run test:realtime
```

`npm test` passed all rule, real HTTP/SQLite, two-browser realtime, and
Playwright checks (18 browser tests). The real service test verifies room token
isolation, a two-client game, service-restart persistence/reconnect, health,
and 429 with `Retry-After`. The two-browser test reaches a visible result,
reloads the host, and starts a rematch.

Every command in `.factory/claims.json` was run individually and passed. This
includes the five new room-service commands, not only the broad test suite.
The production build writes `dist/`; initial JavaScript is 10.14 KB gzip and
CSS is 4.89 KB gzip.

Live checks passed on the cold HTTPS product:

- Fresh desktop and Pixel 5 contexts showed the job, audience, and sample
  first action before scrolling, with no page or console errors.
- A fresh live sample opened six realistic draft cards, retained its persistent
  sample label after a pick, reset to Draft 1, left a real-room localStorage
  marker unchanged, and made no `/api` request.
- Fresh desktop host and Pixel 5 guest completed a real two-player room from
  lobby through three drafts and three battles to the result. The host reloaded
  into the same room and started a rematch. Evidence screenshots are
  `/work/.evidence/live-room-result.png` and
  `/work/.evidence/live-room-phone-result.png`.
- `/opt/fleet/lib/verify-url.sh https://pocket-draft-duel.sociobot.in/`
  returned 200 with no console errors and verified title, `lang`, one h1,
  `<main>`, image alt text, and labelled buttons. Its desktop and phone output
  is in `/work/.evidence/final-live/`.
- Playwright Axe found no serious or critical issues on `/`, `/demo`,
  `/privacy`, `/terms`, and the designed not-found route. This is the supported
  Axe route in this worker; the standalone CLI could not start its separate
  Chrome session in the worker image.
- `GET /api/health` returned 200 with the deployed implementation SHA, and the
  live root returned CSP, Permissions-Policy, `nosniff`, and Referrer-Policy.

## Deployment details and constraints

- The static deployment must retain `dist/staticwebapp.config.json`; the build
  copies it there deliberately. It provides SPA routing, the designed 404,
  security headers, and the `/api/*` fallback exclusion.
- The room service must remain one active revision and one replica. Its durable
  Azure Files SQLite database uses SQLite's `nolock` URI and memory journal to
  avoid unsupported SMB rollback-journal locks. That configuration is safe only
  with the enforced single-process bound; the database file itself remains on
  the durable product mount.
- The container runs as the mount-owning runtime user because the fleet Azure
  Files mount did not grant the image's non-root user write access. This is a
  deployment constraint, not an application permission model; it should be
  revisited if the fleet mount ownership changes.
- A deployment wrapper stopped during custom-domain certificate polling after
  the successful app deployment. The active revision, linked `/api` path,
  durable volume, probes, and public HTTPS checks above confirm the product
  deployment itself succeeded.

## Known dependency

Billing registration is owned by the separate operator. The actual advertised
$4.99 one-time host set unlock remains unavailable until that operator registers
the offer and the product gets genuine server-side license validation. Public
offer metadata is at `/work/.evidence/billing-offer.json`; the free game and
live room-code path work without it.

The catalog description is verb-first and under 120 characters in
`.factory/catalog-description.txt`, copied to
`/work/.evidence/catalog-description.txt`.
