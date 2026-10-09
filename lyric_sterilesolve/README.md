# Lyric Sterile Solver

A single-player flow-engineering puzzle with five authored levels and a developer sandbox. Open **index.html** in Chrome or Edge, or choose Sterile Solver in the root Lyric Games launcher. All code and assets are local; there is no installation, build step, CDN, or runtime download. The collection's `start-lan.bat` also serves this game to browsers on your LAN.

## Play

1. Drag equipment from the stacked **supply rack** into **STAGING**. Identical pumps and same-capacity flasks share a stack. Tubing and blue scissors clamps have unlimited supply.
2. Drag a flask onto a media vat. Enter its **Fill Amount** in the popup; repeat with another vat to premix media. Each level shows its necessary media, labeled with remaining mL. Flask capacity and available media remain finite.
3. Click the white ethanol bottle with the red trigger. It sprays the entire staging area and sterilizes all dirty staged equipment, tubes, and clamps, using 2% per dirty item. The bottle displays its remaining percentage.
4. Drag sterile parts into the **INCUBATOR**. Dirty items may enter staging safely, but entering the incubator dirty immediately fails the attempt. Returning a previously sterile item to staging makes it require spraying again. There is no pre-entry warning.
5. Drag the two ends of a sterile tube onto output and input ports. Either end can be attached first. Drop a sterile scissors clamp onto tubing; it starts closed. Click the installed clamp to reopen or close it. Crossings show bridges and never join or mix streams.
6. Select a pump and set its rate in the equipment inspector; press Enter or leave the field to apply it. Press **GO**. All placed pumps run continuously; rates lock, while equipment movement, tubing ends, clamps, and selectors remain interactive.

The hand is open when the mouse is released and closes while held. Click an item to inspect it, drag to move it, click a selector to switch outlets, or drag a connected tube end away to detach it. Flowing open tubing spills until reattached or clamped.

Returning a tube end to staging dirties the whole tube and its installed clamp. Return both ends to staging before spraying the assembly again. Detach a component's tubing before moving the component back to staging.

The main screen has only the current level, elapsed time, **Reset**, and **GO** above the workspace. The incubator occupies most of the board, with staging underneath and a compact rack/inspector beside it. **Escape** first cancels a drag, then clears selection, then opens level selection. Leaving a running attempt resets it. Reset restores the level-entry design and resources. Welcome and result screens provide campaign, practice, sandbox, retry, and collection navigation.

## Reactor and flow rules

Each reactor specifies **total flow**, **processed-volume goal**, and **recipe**. Physical ports only determine possible connections. A 200 mL reactor requiring 10 mL/s and 50% red / 50% blue completes after 20 seconds of correct flow, whether it receives one premixed stream or several separate feeds.

Reactors are instantaneous, conserving mixers. Every outlet has the same media composition; their flow rates sum to incoming flow. Open passive outlets divide incoming flow equally, except where downstream pumps impose different rates. Thus a 10 mL/s stream normally splits 5/5, but two outlet pumps can force 6/4. Reactor target labels validate actual flow and never generate flow themselves.

Flow uses lower-bound feasible circulation and ordered local equal-sharing decisions. Upstream sharing is committed before residual source draws. A downstream branch's preferences cannot silently change an upstream split. Remaining demand is pulled equally through unconstrained passive inlets. Pump-free networks carry zero flow; incompatible pumps in series cause a rate-conflict warning. Recirculating loops require a flask. Tubing has no resistance or transport delay in this version.

Flasks mix their contents and store finite volume. They are independent input/output buffers, so volume changes by inflow minus outflow. Reactors' listed volume is throughput rather than a chamber capacity.

### Reuse and passage history

Contents are maps of **media ID + passage count → mL**, for example:

```js
{ 'red:0': 50, 'blue:1': 50 }
```

Every reactor passage increments each constituent's count. Fresh count 0 may pass through two reactors; count 1 may pass through one more; count 2 or above is spent. Mixing with fresh media retains separate cohorts. Every reactor outlet carries the same cohort proportions. Colors blend and desaturate with passage count; the inspector also displays numerical history. Completed reactors still mix and age media when flow passes through them.

An unfinished reactor may wait until its first inflow. Once started, incorrect or interrupted flow has two seconds to recover. Wrong recipes, spent feed, blockages, starvation, open-tube spills, and flask overflow also have two-second warnings. The affected component shakes and highlights its fault. Progress stops when a reactor's feed is invalid. Changing between fault types does not reset the timer; restoring valid conditions does. A fault reaching its deadline fails before a simultaneous victory.

There is no manual RUN pause. Hiding the browser tab suspends the network; returning requires **Resume pumps**. All pumps stop automatically when every reactor is complete.

## Campaign, retries, and sandbox

The five levels are First Perfusion, Simultaneous Blend, Unequal Branches, Live Diversion, and Mixed Reuse. The last level processes 600 mL across three reactors using 400 mL of fresh media. Level 4 teaches switching two 60 mL sinks while processing 100 mL: switch between seconds 8 and 12 to avoid overflow.

Ethanol begins at 100%. Batch spraying costs 2% per dirty staged item, editable in Config. Moving a sterile item inside retains sterility. Ethanol carries across campaign wins and refreshes every three levels, including before level 4. **Retry setup** restores the pre-GO layout, media, and ethanol. **Reset** restores level-entry supplies and ethanol. Campaign selection also allows restarting the current three-level ethanol batch with a full bottle.

Campaign progress and best run statistics are saved in best-effort browser storage. Storage denial does not stop play. Practice and sandbox do not alter the campaign checkpoint. Results report run time, fresh media consumed, ethanol, tubing, spills, and manual interventions. Fresh consumption counts fresh constituents first processed or spilled; still-stored fresh media remains available.

Sandbox adds equipment and media, sets ethanol, fills flasks with aged cohorts, edits reactor requirements, and displays numerical flow. It uses the same validated commands and physics as campaign play.

## Add or edit levels

Edit **js/levels.js**, which exports `LyricSterileSolver.Levels`. Entries are ordinary JavaScript records, loaded using classic script tags so direct-file launch works. Add a record to the array; level selection and next-level navigation follow array order. Keep IDs stable and unique. The engine does not prescribe a solution.

Example sixth level:

```js
{
  id: 6,
  title: 'A New Blend',
  subtitle: 'Supply a 50:50 blend at 6 mL/s.',
  tutorial: ['Premix media, or use two simultaneous 3 mL/s feeds.'],
  media: { red: 60, blue: 60 },
  reactors: [{
    id: 'r1', type: 'reactor', x: 550, y: 320,
    requiredVolume: 120, requiredRate: 6,
    recipe: { red: 0.5, blue: 0.5 },
    ports: LyricSterileSolver.makePorts(2, 1)
  }],
  supplies: [
    { id: 'p1', type: 'pump', rate: 3 },
    { id: 'p2', type: 'pump', rate: 3 },
    { id: 'f1', type: 'flask', capacity: 150 },
    { id: 'f2', type: 'flask', capacity: 150 },
    { id: 'f3', type: 'flask', capacity: 150 }
  ]
}
```

The logical incubator is 960×640; a 160-pixel staging area extends the board to 960×800. Rendering fills the available screen width and height. Positions are component centers; port offsets are relative to those centers. `makePorts(inputs, outputs)` generates left inlet and right outlet anchors. Custom layouts can provide port records with unique `id`, `direction: 'in'|'out'`, and `x/y` offsets. Recipes must sum to 1. `validateLevel` reports invalid IDs, capacities, targets, recipes, media, and port definitions. Add a reference solution fixture alongside new levels to prove at least one complete run is possible.

## Engine and artwork extension points

Classic scripts share an isolated `globalThis.LyricSterileSolver` namespace. Config holds the 30 Hz step, board dimensions, grace period, tolerances, passage limit, ethanol cost, and batch length. `MediaTypes`, `ComponentCatalog`, and named `ComponentBehaviors` keep definitions separate from simulation behavior. A catalog entry specifies dimensions, ports, sprite key, and handler. A three-way splitter can reuse the junction handler with three outlet ports; new behavior can register its own named handler.

`createSimulation({ levelId, ethanol, sandbox })` returns `submit(command)`, `step(seconds)`, `getState()`, `preview()`, `subscribe(listener)`, and `dispose()`. Returned state snapshots are isolated. Human input, sandbox, and tests submit the same commands. Examples:

```js
sim.submit({ type: 'stage', id: 'p1', x: 300, y: 730 });
const tube = sim.submit({ type: 'createTube', x: 450, y: 770 });
sim.submit({ type: 'sprayStaging' });
sim.submit({ type: 'place', id: 'p1', x: 300, y: 320 });
sim.submit({ type: 'setPumpRate', id: 'p1', rate: 5 });
sim.submit({ type: 'connectOneEnd', tubeId: tube.id, endpoint: 'a',
  to: { componentId: 'p1', portId: 'out' }
});
sim.submit({ type: 'connectOneEnd', tubeId: tube.id, endpoint: 'b',
  to: { componentId: 'r1', portId: 'in1' }
});
```

Physical interaction commands include `createTube`, `createClamp`, `moveTubeEnd`, `connectOneEnd`, `installClamp`, `stage`, and `sprayStaging`. For example, `connectOneEnd` takes `{ tubeId, endpoint: 'a'|'b', to: { componentId, portId } }`. Legacy `prepareTube` and direct `connect` remain available for reference fixtures. Other commands handle fill, move, remove, reconnect, disconnect, clamp, selector switching, GO, retry, reset, suspension, and sandbox grants. `submit` returns `{ ok, error? }`; rejected actions leave the attempted change unapplied. Dirty entry deliberately produces a failed state. Rendering uses snapshots and never modifies rules.

Put local PNGs/sprite sheets in **assets/** and edit `AssetManifest` in **js/assets.js**. Entries use stable keys, `src`, frame dimensions, `fps`, named animation frame arrays, and a procedural fallback. Frames run left-to-right, then top-to-bottom. Missing images retain animated placeholder artwork. Artwork size and shape do not change port geometry or hitboxes.

```js
Object.assign(LyricSterileSolver.AssetManifest.pump, {
  src: 'assets/my-pump.png', frameWidth: 32, frameHeight: 32,
  fps: 8, animations: { idle: [0], running: [0, 1, 2, 3] }
});
```

The game carries its own copy of the supplied Lyric logo. The launcher uses the existing prepare-exit/exit-ready message protocol to stop animation and input when returning to the collection.

## Verify

From the collection root:

```text
node lyric_sterilesolve/tests/run.js
node lyric_sterilesolve/scripts/browser-smoke.js
node tests/hosting-tests.js
node scripts/browser-smoke.js
```

Simulation tests cover reference solutions, conservation and passage history, alternative layouts, flow defaults and conflicts, live faults, retries, and disposal. Browser checks use installed Chrome and Edge for direct-file and HTTP launch, pointer controls, suspension, sandbox, storage denial, artwork replacement, and launcher exit. Browser screenshots go to `tests/artifacts/`.
