# Pocket Draft Duel handoff

## Release status

**Verdict: PASS.** Independent verification 3 found zero defects and zero
untested public claims.

- Product: Pocket Draft Duel (`browser-game`)
- Live URL: `https://pocket-draft-duel.sociobot.in`
- Implementation candidate: `9430a3bd007c9ac02c18389c5e9cbd6aa8b33c11`
- Documentation evidence reviewed: `0ee9e1ed1a1ae06ec3983e7ad6da910f77796bc6`
- Existing room-service build: `84973460a8db421f14bfaec3b87bc66d177cc1ba`
- Verification report: `.factory/verification-3.md`

The live JavaScript and CSS match the candidate build byte for byte. The room
service remains the existing product-owned Rust/SQLite build.

## Job, audience, and first action

- **Job:** Two to four friends draft shared cards, play three tactical battles,
  and get one result by room code.
- **Audience:** Friends who want a short card game without accounts,
  collections, deck building, chat, or ranked play.
- **First action:** **Try it with sample data** opens a populated four-player
  practice draft immediately.

Fresh desktop and Pixel 5 contexts showed all three before scrolling.

## Independent verification

- All 14 declared claim commands passed separately from a fresh clone.
- `npm test`, `npm run build`, and `npm run realtime:test` passed.
- The build produced `dist/`; initial JS is 10.48 KB gzip and CSS is 4.90 KB
  gzip.
- A live sample completed three drafts and battles to a result, retained its
  demo label, reset cleanly, and did not touch seeded real-room storage.
- Independent live desktop and phone clients completed a room, reloaded the
  same result, and started a rematch.
- Stale-token recovery made one request and left a stable prefilled join form.
- Live boundary, token-isolation, CORS, and rate-limit checks passed, including
  429 with `Retry-After: 60`.
- The worker URL check and Axe route checks passed with no unexpected console
  errors or serious/critical accessibility violations.
- Pixel targets are at least 44 × 44 CSS px. Keyboard Enter and Space, focus,
  Back navigation, reduced motion, and 200% text checks passed.
- Lighthouse scored 99/100/100/100. LCP was 1.29 s, TBT 121 ms, and CLS 0.029.
- Measured animation-frame delivery was 60.6 fps desktop and 60.5 fps Pixel 5.

Evidence is under `/work/.evidence/verification-3/`. The full results and the
disposition of every earlier finding are in `.factory/verification-3.md`.

## How to verify

Use Node 22+, npm, and current Rust/Cargo:

```sh
npm ci
npm test
npm run build
npm run realtime:test
```

Run any command in `.factory/claims.json` separately to reproduce that public
claim. Open `/demo` for the isolated sample.

## Known dependency

The visible $4.99 Stone and Market host set unlock remains unavailable until
the separate operator registers billing. Checkout and activation are disabled
and are not claimed to work. The free Marsh sample and real-room game are
complete.
