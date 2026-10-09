# Lyric Games

Three browser games, one launcher: **Lyric Biodefenses**, **Lyric Antigen Assault**, and **Lyric Sterile Solver**. The games use HTML, CSS, and plain JavaScript. Solo play requires no installation, build step, account, or network connection.

## Play

Open the root **index.html** in Chrome or Edge. Select a game, choose **INSTRUCTIONS** for its rules, or choose **PLAY** to open its welcome screen. **All games** returns to the library and stops the current game. When leaving a Biodefenses LAN room, that control also leaves the room.

The launcher loads one game at a time. Each game also has its own entrypoint in its folder, so it can be played and developed independently.

## Host the collection

Copy this folder to a static web host with its relative directory structure intact. All three solo games work from the same root URL. Biodefenses LAN play uses the bundled Node host instead of a static server.

For LAN play, install Node.js 22 or newer and double-click **start-lan.bat** in this root folder, or run:

```text
node server.js
```

Open the printed localhost address on the host computer and the printed LAN address on a second computer on the same network. Choose Biodefenses, then create or join a room using its existing lobby. Keep the host terminal open; stop it with Ctrl+C. Use `node server.js --port 3001` to choose another port.

The original Biodefenses host still works independently. Antigen Assault and Sterile Solver are solo games and need only the static files, even when accessed through the LAN host.

## Sterile Solver

Prepare and sterilize equipment, connect flow paths, and press GO to process the reactors' required media mixtures. Five editable levels introduce perfusion, simultaneous mixing, unequal splits, live sink switching, and recycled media. A developer sandbox provides independent equipment, media, ethanol, and reactor controls. Select the new third preview in the launcher or open `lyric_sterilesolve/index.html` directly.

See [the Sterile Solver guide](lyric_sterilesolve/README.md) for controls, conserved-flow rules, passage history, level authoring, and replaceable artwork.

## Antigen Assault

- **Arrow keys:** move the ship left/right and up/down. Vertical travel covers a band about 20% of the arena height near the bottom.
- **Space:** hold to fire paired antibodies. In white opsonin mode, hold to cycle the power bar and release to launch one orb. Stronger launches stop farther up the arena.
- **Z:** cycle through unlocked antibodies and opsonins when stocked.
- **X:** consume every settled orb. After a 0.5-second macrophage windup, clear antigens inside each circle. Flying orbs are not activated.
- **P / Escape:** pause or resume. The game also pauses when it loses focus.

Match antibody and antigen colors. Green starts unlocked; blue, purple, and gold arrive in levels 2, 3, and 4. Level 5 mixes all four, followed by a boss whose current core color controls its vulnerability, movement, shots, and summons. Three lives protect the ship against collisions and hostile shots; escaped antigens return to play.

**Antigen response** in the side panel starts enabled. Turn it off to stop enemy and boss shots and make incoming waves and boss summons arrive 50% faster. Flight patterns, collisions, and the finite number of enemies in each wave stay the same.

Runs start with zero opsonins. Shoot rare white pickups using any antibody to collect them. Inventory carries between stages; deployed orbs clear at each new stage. Switching weapons or pausing cancels an unfinished charge without spending stock. The final boss takes limited macrophage damage once per activation, even if several circles overlap it.

Shoot the rarer glowing rainbow **IVIG** antibody as it crosses the arena. It stays onscreen for about five seconds. Collecting it makes the ship glow and gives each antibody volley eight shots: two each of green, blue, purple, and gold. Matching still applies. The effect lasts 30 seconds of active combat, carries between stages, and refreshes when collected again. White mode still charges and places opsonins; collecting IVIG while in white mode selects your last antibody so the spray is ready.

## Develop and customize

The launcher keeps each game's styles, scripts, input, and simulation in its own document. The root host reuses the existing Biodefenses LAN server and exposes only approved browser files. Gameplay input stays inside the active game.

- See [the shooter guide](lyric_galaga/README.md) for balance, authored levels, flight patterns, boss modes, and replaceable sprites.
- See [the Biodefenses guide](lyric_biodefenses/README.md) for its culture simulation, artwork, trivia, and LAN implementation.

## Verification

Run the dependency-free checks from this root folder:

```text
node lyric_galaga/tests/run.js
node lyric_sterilesolve/tests/run.js
node lyric_biodefenses/tests/run.js
node lyric_biodefenses/tests/lan-tests.js
node tests/hosting-tests.js
node scripts/browser-smoke.js
node lyric_sterilesolve/scripts/browser-smoke.js
```

The shared browser smoke test uses installed Chrome and Edge, including real keyboard input, launcher dialogs and lifecycle, direct-file and HTTP play, sprite replacement/fallback, LAN refresh and exit, and responsive layouts. Screenshots are written to `tests/artifacts/`. The original Biodefenses browser checks remain available:

```text
node lyric_biodefenses/scripts/browser-smoke.js
node lyric_biodefenses/scripts/lan-browser-smoke.js
```
