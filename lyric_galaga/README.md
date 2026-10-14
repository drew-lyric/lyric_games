# Lyric Antigen Assault

A solo antibody arcade campaign: five authored levels and a color-shifting antigen boss. Open `index.html` directly in Chrome or Edge, or select this game from the root Lyric Games launcher. All runtime assets and code are local; no build step or dependencies are required.

## Controls and rules

Move with all four arrow keys. The ship accelerates gently and briefly coasts to a stop when released. Up/down movement covers a band about 20% of the arena height near the bottom, giving room to dodge vertically. Hold Space to fire paired antibodies. Press Z to cycle unlocked colors. Match the target's color to destroy it; mismatched hits produce feedback without damage. Antigens have distinct silhouettes as well as colors. Green starts unlocked, with blue, purple, and gold introduced in levels 2, 3, and 4. Level 5 combines the full palette.

Start with three lives. Hostile shots and antigen collisions cost a life and grant two seconds of invulnerability. Antigens that escape loop back into play, so each stage finishes only after all its scheduled waves and surviving enemies are cleared. Wave counts and times are editable in `js/config.js`. Pause and intermissions do not advance those schedules.

The side-panel **Antigen response** toggle starts enabled. Turn it off to stop shots from antigens and the boss. Waves and boss summons then arrive 50% faster: a wave scheduled at 18 seconds arrives at 12 seconds when response stays off. Finite wave counts, flight patterns, movement speed, collisions, and color matching stay the same.

Runs start with zero opsonins. Shoot a white pickup using any antibody to add one to stock. The first appears after about 15 seconds of active play; later appearances are randomized between 30 and 45 seconds. Select white with Z, hold Space to cycle the vertical power bar, then release to spend one opsonin and launch it upward. More power means greater travel before it comes to rest. The orb passes through enemies without damaging them and has no landing preview.

**IVIG** is a much rarer glowing rainbow antibody that crosses horizontally through the arena in about five seconds. Shoot it with any antibody to collect it. The first appears around 75 seconds of active play, with later appearances randomized between 90 and 135 seconds. For 30 seconds of active combat, the ship glows and antibody firing produces a spray of eight shots per volley: two each of green, blue, purple, and gold, including colors not yet unlocked for ordinary weapon selection. Color matching still applies. Pause and intermissions freeze the effect timer; it carries across stages and collecting another IVIG refreshes its duration. White opsonin mode retains charge-and-release firing. If IVIG is collected while white is selected, the ship returns to its last selected antibody and cancels any unfinished charge without spending stock.

Press X to consume all resting orbs. A macrophage appears underneath each, winds up for 0.5 seconds, then clears antigens inside its circle. Each circle has 22% of the logical arena's area; its radius is `sqrt(0.22 * width * height / PI)`. Flying orbs are not activated. Inventory carries between stages, while deployed orbs clear at each new stage. Changing weapons, pausing, or losing focus cancels a charge without spending stock. Empty stock removes white from the cycle and returns the weapon to the last selected antibody.

Press P or Escape to pause or resume. The game automatically pauses when it loses focus. Restart resets the entire campaign, including lives, inventory, and score. Use All games in the shared launcher to return to the library.

### Mobile browser controls

The phone layout targets iPhone Safari on iOS 16.4 or later, in landscape. The logical arena stays 960 by 720 with its 4:3 aspect ratio; safe-area spacing keeps controls clear of the notch and home indicator. Portrait shows a rotate prompt and pauses play rather than attempting to force browser orientation. Physical iPhone testing is still pending; see [MOBILE_TESTING.md](MOBILE_TESTING.md).

- **Tilt:** tap **Enable tilt** on the welcome screen or in Pause. The permission request runs from that tap. Allow motion, hold the phone still for about half a second, then start or resume. Tilt controls horizontal movement and the existing vertical band. Weapon sits at the bottom left and Activate above it.
- **Joystick:** choose touch controls, or use the fallback when permission is denied, sensors are absent, or readings stop. Drag the left joystick to steer. Weapon and Activate form a stack on the right, leaving the left thumb only the joystick to operate.
- **Fire:** tap or hold the arena outside controls and menus. Ordinary antibodies fire repeatedly while held; a brief tap fires a volley. White mode requires a hold to charge, followed by release to launch. A cancelled touch, control change, pause, or orientation change discards the charge without spending stock. Multiple touches allow steering, firing, and weapon actions together.
- **Pause:** opens Antigen response, control selection and tilt recalibration, instructions, restart, and All games. Turning portrait or backgrounding the browser clears movement and charging. Returning requires explicit resume; tilt recalibrates before flight continues. Returning from browser history also restores a paused game rather than advancing missed time.

Tilt requires a supported sensor API and a secure context, normally HTTPS. Local files and ordinary HTTP hosts can use joystick controls when tilt is unavailable. Tilt sensitivity defaults to a 3-degree dead zone, full movement at 20 degrees from the calibrated position, and a 120 ms smoothing time. Readings missing for 0.5 seconds during play pause the game and offer joystick controls. Both landscape directions are mapped to screen coordinates; compass heading is unused.

## Boss behavior

The final boss's active core color controls vulnerability, movement, shot pattern, and summoned antigen color. Color changes are announced before they happen. Three health phases increase the attack and movement pressure while preserving deployed opsonins.

| Color | Movement | Attack | Summons |
|---|---|---|---|
| Green | Slow lateral drift | Aimed singles | Sine formations |
| Blue | Broad sweeps | Three-shot fans | Arcing divers |
| Purple | Figure-eight motion | Staggered spreads | Zigzags |
| Gold | Faster loops | Alternating lanes | Flankers |

Macrophages clear minions regardless of color. If any circle intersects the boss, one X activation deals 10% of its maximum health, even when multiple circles overlap it. Defeating the boss immediately completes the campaign; remaining minions do not delay victory.

## Structure and extension points

- `js/config.js`: logical arena, player and weapon balance, antigen-response spawn cadence, opsonin and IVIG pickup timing, IVIG duration and spray, charge physics, macrophage timing and radius, colors, antigen catalog, finite authored levels, and boss mode data.
- `js/patterns.js`: pure flight-pattern, boss-movement, and boss-attack registries.
- `js/simulation.js`: seeded game state, fixed-step movement, projectile collisions, wave scheduling, pickups, charging, macrophage activations, lives, boss phases, and endings.
- `js/assets.js`: sprite manifest, asynchronous image loading, sprite-sheet frames, and procedural fallback artwork.
- `js/render.js`: canvas presentation and visual effects; rendering does not change combat state.
- `js/controls.js`: keyboard, multi-touch pointers, joystick, motion permission and calibration, and normalized input sampling.
- `js/ui.js`: desktop/mobile overlays, HUD, pause, restart, orientation/background handling, and launcher lifecycle.

Scripts use the independent `globalThis.LyricGalaga` namespace and deferred classic script tags so they also work under `file://`. The simulation uses a 60 Hz logical step in a 960×720 arena; rendering runs through `requestAnimationFrame` and the canvas scales with the layout.

### Balance and levels

Change `LyricGalaga.Config` in `js/config.js`. Distances are logical pixels and durations are seconds. The initial campaign is tuned toward an approachable 6–8-minute successful run, with harder pressure toward the finale.

Tune the ship's vertical movement band with `Config.player.verticalRangeFraction` (default `0.2`, or 20% of the arena height). The band stays near the bottom of the arena.

Player speed remains 425 logical pixels per second. `Config.player.accelerationTime` is `0.15` seconds to reach full speed, and `decelerationTime` is `0.2` seconds to stop from full speed. Keyboard and analog steering share this fixed-step movement, diagonal speed is capped, and contact with an arena limit clears velocity into that limit. Pause, stage changes, and restart clear momentum.

`LyricGalaga.Controls.defaults` holds joystick radius, tilt dead zone/full angle, smoothing, calibration duration/timeout, and sensor timeout. Override these through `Config.controls` or a Controls instance's `config` option. `Controls.sample(dt)` returns keyboard directions, normalized `moveX` / `moveY`, held `fire`, short-tap `fireTap`, and one-shot `cycle` / `detonate` actions. `Game.step(dt, input)` accepts the same fields; active arrow-key directions take precedence over analog axes. `fireTap` preserves a complete tap received between simulation ticks. `Game.resetMovement()` clears velocity and movement input; cancelling a charge remains a separate action. Keep permission and sensor handling outside the seeded simulation so recorded analog inputs remain deterministic.

Each level has an ID, title/subtitle, speed multiplier, and a finite list of waves. Wave records contain `at`, `count`, `colors`, and `patterns`. Colors and patterns cycle over the wave's members. Add or edit records to change the campaign without changing rendering. Offscreen survivors retain their identity and remain part of the outstanding enemy count.

Set the default response toggle with `Config.antigenResponse`; tune its faster spawn cadence with `Config.passiveSpawnRate` (default `1.5`). Opsonin timings remain in `Config.opsonin`. In `Config.ivig`, edit `firstPickup`, `pickupIntervalMin` / `pickupIntervalMax`, `pickupTravelTime`, `pickupRadius`, `duration`, and `sprayAngles` to tune IVIG frequency, crossing time, hit difficulty, effect length, and spray width. Antigen response changes the wave-scheduling and boss-summoning cadence; it does not add enemies to finite waves or change their flight patterns. Keep those controls separate when tuning difficulty.

To add a flight pattern, register a function in `LyricGalaga.Patterns` that receives `(enemy, time, config)` and returns `{x, y}`. The engine handles looping and collision state. Add a corresponding pattern key to a wave's `patterns` array. The existing patterns use each enemy's home position, phase, and direction to differentiate otherwise identical enemies.

### Extend the finale

`LyricGalaga.BossModes` maps core colors to movement, attack, firing interval, shot speed, and summoned pattern. Register additional implementations in `BossMovements` or `BossAttacks` and reference them by key. Movements return positions; attacks return projectile origins and normalized directions. Boss health thresholds, speed multipliers, color order/duration, telegraph timing, summons, and macrophage damage are in `Config.boss`.

The current boss is a base for a more elaborate finale: its sprite, mode definitions, patterns, and health-phase tuning can be replaced independently.

### Replace sprites

Place local PNGs or sprite sheets in `assets/`. Edit `LyricGalaga.AssetManifest` in `js/assets.js`, retaining semantic keys such as `ship`, `antigen-green`, `antibody-blue`, `opsonin`, `ivig`, `macrophage`, and `boss`:

```js
Object.assign(LyricGalaga.AssetManifest['antigen-green'], {
  src: 'assets/my-green-antigen.png',
  frameWidth: 16,
  frameHeight: 16,
  fps: 8,
  animations: { idle: [0, 1, 2, 1] }
});
```

Frames count left-to-right and then top-to-bottom. Destination width and height are independent, supporting non-square ships and boss artwork. Missing or failed images retain procedural artwork and gameplay continues. Artwork changes do not change collision radii; tune those separately in the catalogs. The supplied Lyric wordmark is reused from Biodefenses; the ship's procedural silhouette draws from its blue ribbon.

## Verify

From this folder, run `node tests/run.js` for deterministic simulation checks and `node ../tests/controls-tests.js` for keyboard, pointer, and motion-adapter checks. From the root, run `node scripts/browser-smoke.js` for the existing desktop integration baseline and `node scripts/mobile-browser-smoke.js` for mobile viewport, touch, and lifecycle checks. The emulated browser checks do not substitute for physical iPhone Safari tests; record those separately in [MOBILE_TESTING.md](MOBILE_TESTING.md). See the root README for the complete cross-game commands.

### Eventual Capacitor packaging

There is no audio playback or native application project in this iteration. The browser code and local sprite fallbacks remain dependency-free. A future shooter-only package must include the shared branding image at `../lyric_biodefenses/assets/branding/lyric-logo.jpg` or update that reference when relocating it. Package scripts and replacement artwork with their relative paths intact. Test motion permission, safe areas, orientation, background/resume, and touch cancellation again in the actual WKWebView container; a Safari pass alone does not validate the native wrapper. Native lifecycle/orientation configuration and any future audio unlock belong to that packaging iteration.
