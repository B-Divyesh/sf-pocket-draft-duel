# Demo sandbox

Open `https://pocket-draft-duel.sociobot.in/demo` or choose **Try it with sample
data** from the first screen. It opens a realistic four-seat practice table:
You draft against Moss, Brick, and Thimble, then complete three battles.

The sample is a deterministic local practice game. It uses the `demo:pocket-
draft-duel:*` localStorage namespace only. It never reads room tokens or writes
to a real room. The persistent banner says **Demo — sample data, nothing is
saved** and provides **Reset demo**, which removes only the demo run.

**Start for real** discards the demo context by leaving `/demo`; it does not
carry a practice card, score, or player name into a real room. The live room
path is separate and requires the product-owned room service described in
`realtime/README.md`.
