# Changelog

Generated from `js/changelog.js` by `tools/changelog.js` — edit the notes
there and run the generator, or open `tools/changelog.html` and use that.
The same notes open in-game from the version marker in the menu's bottom
corner.

## Unreleased

- Picks stack now. A second flash or ping no longer wipes out the first — they pile up, and each one fades on its own clock.
- A Flash round opens by showing you where you are. The walls and you light up together, then fade.
- The ghost house is as dark as everything else. Ghosts waiting inside it no longer glow through the black in any mode.
- Torch Hard lost its cone. It is the pool of light you stand in and nothing more, widened a little to make up for the beam.
- Torch Easy pings follow. A contact waddles along with the ghost it found instead of marking the spot that ghost has already left.
- The board edge lights up. White while a power pellet runs, blinking faster as it runs out, closing on one yellow pulse — and red when a ghost gets you.
- READY waits for you. The round holds until you move, with the maze up dimly the whole time, and the panel cut back to the mode and the level.

## 1.5.0 — 2026-08-06

- Updated to have 3 game modes: Stare, Torch and Flash. Each one now has an Easy, a Normal and a Hard mode. For those keeping track, that’s 9 total game modes!
- Torch now shines the way forward. So it’s more "torch" in the British "flashlight" sense than medieval "flame stick" variety. This should help see ghosts before they run up on you, giving you time to react.
- Improved Torch light to fill around corners so you can’t see through walls anymore.
- Added a small nudge to people who haven’t hit the number keys to change layers or send a ping. Helpful for anyone who hops in without reading anything (although who knows if they’ll read the prompt).
- Toned down the constant siren a bit, and added in a audio cue when your ghost vulnerability is ending.

## 1.4.0 — 2026-08-06

- New mode: Torch. A light travels with you, and you send out a sonar ping to see the world beyond your flame.
- Improved main menu with a small demo to get you used to how the game plays before you start.

## 1.3.0 — 2026-08-06

- All four ghosts start in the house now.

## 1.2.0 — 2026-08-06

- Added better cues for when the round start so you see the ghosts and dots and maze. Gives a quick chance to study and understand the map, and less of a surprise when ghosts suddenly show up!

## 1.1.0 — 2026-08-06

- Closed dead-end pockets in mazes that could trap the player and force them to turn around (possibly into a ghost!).
- Some UI changes to make the badges on the right also clickable.

## 1.0.0 — 2026-08-06

- Welcome to BLINKMAN! This is the first version with some randomly shuffled mazes to explore, and 4 difficulties.
