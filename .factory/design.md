# Pocket Draft Duel design direction

## Direction

Pocket Draft Duel looks like a folded tabletop tournament sheet, not a game
lobby. A cream graph-paper surface holds large card marks, score strips, ruled
lines, and slightly offset ink shadows. It suits a fast social game: the table
shows the shared state before anyone has to learn a menu. Brick red signals a
locked choice, forest green is the tabletop and strong action color, and mustard
marks card values and paper annotations.

## Tokens and type

| Token | Value | Use |
| --- | --- | --- |
| Cream | `#f6efd9` | page paper |
| Paper | `#fffaf0` | cards and panels |
| Forest | `#183d2c` | table, main action, headings |
| Forest deep | `#0d281c` | high-contrast text |
| Brick | `#a33a2b` | locked state and urgency |
| Mustard | `#d69d28` | value marker and paper shadow |
| Ink | `#1d211d` | body copy |

Headlines use locally bundled DM Serif Display. Body and controls use locally
bundled Source Sans 3. Both are OFL font packages bundled by Vite and served
from the same origin. The scale uses 18px body text and a 4–8px spacing rhythm;
card labels use tabular number treatment where scores are shown.

## Interaction and motion

The page opens on a visible game sheet. Each phase has one clear verb: choose,
lock, or start a rematch. Selected cards gain a brick-and-mustard offset rather
than an animation that might obscure the choice. The only movement is a short
button offset on hover and smooth anchor scrolling. Both are removed for system
reduced motion or the in-game reduced-motion setting. There is no looping art,
flash, timer animation, or sound.

Phone layout keeps the three-card choice readable, collapses player seats to
two columns, and gives every action a 44 × 44 CSS px target. This includes the
demo exits, wordmark, navigation, and legal links as well as game controls. The wide layout lets the
table feel like a sheet spread across a table without using a generic hero card.

## Card art provenance

The 18 symbols (Anchor, Anvil, Arrow, Bell, Crown, Compass, Fox, Gate, Hammer,
Horn, Key, Lantern, Leaf, Owl, Shield, Star, Tower, Wave) are hand-authored SVG
paths in `src/cards.ts`. They use simple geometric ink strokes and no copied
icon file, generated image, stock image, brand, or external asset. The social
card and favicon are also hand-authored SVG compositions derived from those
symbols. No image-generation model was used for this release.

## Rules presentation

Every card has visible Advance, Brace, and Feint values. Players lock one
shared draft choice at a time; collisions resolve by a rotating server order.
Each player then spends one drafted card in each of three battles. The chosen
tactic selects the matching visible card value. Scores and the rotating final
initiative produce one deterministic result, so the rules can be explained from
the sheet itself.
