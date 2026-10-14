# Antigen Assault mobile verification

**Physical iPhone status: PENDING.** This checklist defines device acceptance; unchecked items are not passing results. Automated checks use simulated sensors and desktop browser touch emulation, so they cannot establish real permission, WebKit, browser-chrome, or sustained-performance behavior.

## Automated results — October 14, 2026

The implemented browser version passed the following checks on Windows:

| Suite | Result |
|---|---|
| Antigen Assault simulation | 90/90 |
| Keyboard, pointer, and motion adapters | 34/34 |
| Shared static hosting restrictions | 10/10 |
| Biodefenses simulation | 65/65 |
| Biodefenses LAN | 19/19 |
| Sterile Solver simulation | 56 passed |
| Shared desktop Chrome and Edge browser checks | Passed |
| Mobile Chrome and Edge emulation | 297 checks passed |

Mobile emulation covered 667×375, 844×390, and 932×430 through direct and launcher URLs, using local files and HTTP under a project subdirectory. It checked simultaneous touch input, quick taps, opsonin charging/cancellation, menus, rotation, viewport-height changes, suspension/recovery, explicit exit, denied/missing/stale motion, delayed permission cancellation, and synthetic tilt in both landscape directions. Screenshots are generated in the root `tests/artifacts/` folder. These results leave every physical-device checkbox below pending.

## Setup and record

Use an HTTPS deployment with the complete relative asset tree. Test both the root launcher and `lyric_galaga/index.html` directly on iPhone Safari, targeting iOS 16.4 or later. Record the build/commit, URL, test date, device, iOS version, Safari version, available viewport, landscape direction, control mode, and permission result. Keep desktop Chrome/Edge verification as a separate baseline.

| Device/viewport case | Left landscape | Right landscape | Browser bars expanded/collapsed | Status |
|---|---|---|---|---|
| Small phone, nominal 667 by 375 CSS pixels | Pending | Pending | Pending | PENDING |
| Notched phone, nominal 844 by 390 CSS pixels | Pending | Pending | Pending | PENDING |
| Large phone, nominal 932 by 430 CSS pixels | Pending | Pending | Pending | PENDING |

These dimensions are layout cases, not guarantees of usable Safari height. Measure the actual viewport with browser bars visible and hidden. Where physical models are unavailable, record emulation separately and leave the device result pending.

## Layout and navigation

- [ ] Launcher selection, PLAY, INSTRUCTIONS, and All games work with touch; opening and returning repeatedly does not leave an active child game behind.
- [ ] The shooter welcome screen and Start button fit in both landscape directions, including the smallest available viewport.
- [ ] The entire 4:3 arena stays visible without stretching, clipping, page scrolling, or overlapping the compact HUD. Notch and home-indicator safe areas leave every control reachable.
- [ ] Lives, score, weapon, opsonin stock/placed count, IVIG time, and Pause remain readable with Safari bars expanded and collapsed.
- [ ] In tilt mode, Weapon is at the bottom left and Activate above it. In joystick mode, the left side contains only steering; the right side holds both action buttons.
- [ ] Pause settings, instructions, restart, control choices, and All games fit and remain operable. Controls and dialogs never trigger an accidental shot.
- [ ] Rotating portrait pauses and shows the rotate prompt. Returning landscape leaves play paused until explicit resume; movement and a pending charge do not continue.

## Tilt permission and steering

- [ ] On a fresh permission state, tapping Enable tilt triggers the permission flow; merely loading, starting, or resuming the page does not request permission unexpectedly.
- [ ] Granting permission and holding still for about 0.5 seconds establishes a usable neutral position before play starts.
- [ ] Left/right tilt follows the visible screen in both landscape directions. Fore/aft tilt moves within the existing 20% vertical band. Compass heading does not change steering.
- [ ] Neutral hand jitter stays within the 3-degree dead zone; larger tilt increases movement smoothly, reaching full steering around 20 degrees from neutral.
- [ ] Releasing tilt produces light deceleration rather than a hard stop. Arena limits prevent escape and clear momentum into the limit.
- [ ] Recalibrate from Pause, including after changing grip or turning to the opposite landscape direction. Explicit resume returns to a stable neutral position.
- [ ] Denying permission produces a clear joystick fallback and no unusable start screen. Repeat with sensor access unavailable or unsupported.
- [ ] Interrupt sensor delivery using a debugger/fault fixture where available: stale readings pause safely, clear movement and charging, and offer joystick controls. Record fault injection separately from normal physical motion testing.

## Touch, weapons, and power-ups

- [ ] A brief arena tap fires an ordinary volley; holding repeats at the same cadence as desktop Space. Moving a held finger does not scroll or select the page.
- [ ] Joystick steering and held fire work together with separate fingers. Diagonal movement does not exceed straight-line maximum speed.
- [ ] Weapon press cycles once, including stocked white mode; Activate press consumes settled orbs once and leaves flying orbs available.
- [ ] Weapon/Activate while another finger fires do not generate an extra fire press. Cycling into white during held fire requires a fresh press before charging.
- [ ] In white mode, holding displays the power bar and releasing launches exactly one opsonin. Higher charge settles farther up the arena, with no landing preview.
- [ ] Interrupted or cancelled touches, pause, rotation, and control-mode changes discard charging without spending stock. No stuck movement or firing remains after touches end outside the original target.
- [ ] Opsonin pickups, delayed macrophages, overlapping circles, and boss damage limits work with touch. The large OPSONIZED! effect remains readable.
- [ ] IVIG collection produces eight colored shots per volley and the 30-second active-play timer. White placement, pickup accuracy, and color matching remain usable at phone scale.
- [ ] Antigen response changes from Pause apply correctly; disabling it removes hostile shots and increases spawning cadence without changing antigen flight.

## Background, history, and session state

- [ ] Background Safari, switch tabs, lock/unlock, and return while playing. The game remains paused, without lost lives, advanced combat timers, resumed firing, or movement drift.
- [ ] Repeat while charging an opsonin: stock remains unchanged and a fresh press is required after resume.
- [ ] Resume tilt after returning; calibration uses the current grip before flight continues. Joystick mode resumes without a motion prompt.
- [ ] Navigate away and use Back/Forward to restore a cached page. The game is usable and paused rather than permanently stopped or catching up missed time.
- [ ] Restart clears score, lives, inventory, placed orbs, IVIG, and movement; the response preference follows the existing behavior. All games stops the active game even during calibration or a permission flow.

## Sustained performance

- [ ] Run a complete campaign or at least 10 minutes on the smallest/oldest target device. Record frame pacing, temperature, battery impact, and any memory warnings or WebKit reloads.
- [ ] Profile a dense late-stage wave with IVIG active, then several simultaneous macrophages and particle bursts. Aim for smooth 60 Hz presentation; record measured frame time and visible stutters instead of marking a pass from visual expectation alone.
- [ ] Confirm pausing/backgrounding stops repeated rendering work and does not keep generating effects. Resume without a time jump.
- [ ] Verify replacement sprites load and missing images use fallbacks. The Lyric wordmark resolves from its shared branding folder.

## Automated baseline and later native wrapper

Run from the repository root:

```text
node lyric_galaga/tests/run.js
node tests/controls-tests.js
node scripts/browser-smoke.js
node scripts/mobile-browser-smoke.js
```

Record actual command results separately from this physical checklist. No audio exists in the current shooter, so audio unlock and silent-mode behavior have no current acceptance step. No Capacitor project is included yet. Before native distribution, repeat the device matrix in the actual WKWebView wrapper, including native background/resume and orientation configuration, motion permissions, and bundled relative asset paths. A shooter-only package must retain or relocate the shared branding image dependency.
