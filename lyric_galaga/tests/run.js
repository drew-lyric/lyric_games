'use strict';
const assert = require('node:assert/strict');
require('../js/config.js');
require('../js/patterns.js');
require('../js/simulation.js');
const LG = globalThis.LyricGalaga;
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function fixture(config) {
  const game = new LG.Game({ seed: 8675309, config: config || {}, levels: [{ title: 'Fixture', speed: 1, waves: [{ at: 9999, count: 1, colors: ['green'], patterns: ['straight'] }] }] });
  game.start(); game.state.player.invulnerable = 9999;
  game._requireFireRelease = false;
  game.drainEvents();
  return game;
}
function advance(game, seconds, input) {
  for (let i = 0; i < Math.round(seconds / game.config.step); i += 1) game.step(game.config.step, input || {});
}
function tick(game, input) { game.step(game.config.step, input || {}); }
function enemy(game, color, x, y) {
  const item = game._spawnAntigen(color || 'green', 'straight', { x: x || 300, y: y || 300, homeX: x || 300, homeY: y || 300 });
  item.entry = false; item.age = 2.2; item.hold = 9999; item.shotTimer = 9999;
  return item;
}
function shot(game, color, x, y, speed) {
  const item = { id: ++game._entityId, x: x, y: y, previousX: x, previousY: y, color: color, radius: 5, speed: speed === undefined ? 760 : speed, damage: 1 };
  game.state.shots.push(item); return item;
}
function settled(game, x, y) {
  const orb = { id: ++game._entityId, x: x, y: y, radius: 10, color: 'white', status: 'settled', speed: 0 };
  game.state.orbs.push(orb); return orb;
}
function charge(game, duration) {
  game.state.opsonins = Math.max(1, game.state.opsonins);
  game.state.weapon = 'white'; game._previousFire = false; game._requireFireRelease = false;
  advance(game, duration, { fire: true }); tick(game, {});
  return game.state.orbs.at(-1);
}
function bossFixture(config) {
  const game = fixture(config); game._enterLevel(2); game.state.player.invulnerable = 9999;
  game.state.boss.shotTimer = 9999; game.state.boss.summonTimer = 9999;
  game._requireFireRelease = false; game.drainEvents(); return game;
}
function ivigPickup(game, x, y, extra) {
  const pickup = Object.assign({ id: ++game._entityId, kind: 'ivig', x: x, y: y,
    radius: game.config.ivig.pickupRadius, color: 'rainbow', age: 0, phase: 0,
    vx: 0, lifetime: game.config.ivig.pickupTravelTime }, extra || {});
  game.state.pickups.push(pickup); return pickup;
}

test('a fresh run starts with three lives, green, and no opsonins', function () {
  const game = new LG.Game({ seed: 1 });
  assert.equal(game.state.status, 'ready'); game.start();
  assert.equal(game.state.status, 'playing'); assert.equal(game.state.lives, 3);
  assert.equal(game.state.weapon, 'green'); assert.equal(game.state.opsonins, 0);
  assert.deepEqual(game.state.unlocked, ['green']);
});
test('movement uses logical bounds and opposite arrows cancel', function () {
  const game = fixture(), center = game.state.player.x;
  tick(game, { left: true, right: true }); assert.equal(game.state.player.x, center);
  advance(game, 3, { left: true }); assert.equal(game.state.player.x, 30);
  advance(game, 4, { right: true }); assert.equal(game.state.player.x, 930);
});
test('holding Space emits repeated paired antibody shots', function () {
  const game = fixture(); advance(game, 0.5, { fire: true });
  assert.equal(game.state.shots.length, 6);
  assert.equal(game.state.shots[0].x, game.state.player.x - 19);
  assert.equal(game.state.shots[1].x, game.state.player.x + 19);
});
test('matching antibody binding destroys an antigen and awards its score', function () {
  const game = fixture(), target = enemy(game, 'green', 300, 300);
  shot(game, 'green', target.x, 325); advance(game, 0.1);
  assert.equal(game.state.antigens.length, 0); assert.equal(game.state.score, 100);
  assert.ok(game.drainEvents().some(function (event) { return event.type === 'bind'; }));
});
test('wrong antibody is absorbed with harmless mismatch feedback', function () {
  const game = fixture(), target = enemy(game, 'blue', 300, 300);
  shot(game, 'green', target.x, 325); advance(game, 0.1);
  assert.equal(target.health, 1); assert.equal(game.state.score, 0); assert.equal(game.state.shots.length, 0);
  assert.ok(game.drainEvents().some(function (event) { return event.type === 'mismatch'; }));
});
test('swept shots cannot tunnel through an antigen', function () {
  const game = fixture(); enemy(game, 'green', 300, 300);
  shot(game, 'green', 300, 500, 30000); tick(game);
  assert.equal(game.state.antigens.length, 0);
});
test('swept collision selects the first target along a shot', function () {
  const game = fixture(); const upper = enemy(game, 'green', 300, 200), lower = enemy(game, 'blue', 300, 400);
  shot(game, 'green', 300, 500, 30000); tick(game);
  assert.equal(upper.dead, undefined); assert.equal(lower.dead, undefined); assert.equal(game.state.shots.length, 0);
});
test('color unlocks follow the five-level catalog', function () {
  const game = new LG.Game(); game.start();
  [1, 2, 3, 4, 5].forEach(function (level) {
    game._enterLevel(level); assert.equal(game.state.unlocked.length, Math.min(4, level));
  });
});
test('forward cycling includes only unlocked colors and stocked white mode', function () {
  const game = fixture(); game.state.unlocked = ['green', 'blue'];
  tick(game, { cycle: true }); assert.equal(game.state.weapon, 'blue');
  tick(game, { cycle: true }); assert.equal(game.state.weapon, 'green');
  game.state.opsonins = 1;
  tick(game, { cycle: true }); tick(game, { cycle: true }); assert.equal(game.state.weapon, 'white');
});

test('vertical arrows move within a twenty-percent band with room above and below spawn', function () {
  const game = fixture(), startY = game.state.player.y;
  const maxY = game.config.height - game.config.player.bottom, minY = maxY - game.config.height * 0.2;
  assert.equal(startY, (minY + maxY) / 2);
  advance(game, 1, { up: true }); assert.equal(game.state.player.y, minY);
  advance(game, 1, { down: true }); assert.equal(game.state.player.y, maxY);
  tick(game, { up: true, down: true }); assert.equal(game.state.player.y, maxY);
  assert.equal(game.state.weapon, 'green');
});

test('diagonal movement retains the same speed and vertical range is configurable', function () {
  const game = fixture({ player: { verticalRangeFraction: 0.1 } }), p = game.state.player, x = p.x, y = p.y;
  tick(game, { right: true, up: true });
  const firstSpeed = game.config.player.speed * game.config.step / game.config.player.accelerationTime;
  assert.ok(Math.abs(Math.hypot(p.x - x, p.y - y) - firstSpeed * game.config.step) < 1e-8);
  assert.ok(p.x > x && p.y < y);
  advance(game, 1, { up: true }); assert.equal(p.y, game.config.height - game.config.player.bottom - game.config.height * 0.1);
});

test('antibodies and placed opsonins launch from the current vertical ship position', function () {
  const game = fixture(); advance(game, 0.1, { up: true });
  tick(game, { fire: true });
  assert.ok(Math.abs(game.state.shots[0].y - (game.state.player.y - 26 - game.config.antibody.speed * game.config.step)) < 1e-8);
  game.state.shots = []; game.state.opsonins = 1; game.state.weapon = 'white';
  tick(game, {}); tick(game, { fire: true }); tick(game, {});
  const launch = game.drainEvents().find(function (event) { return event.type === 'orb-launch'; });
  assert.equal(launch.x, game.state.player.x); assert.equal(launch.y, game.state.player.y - 25);
  assert.ok(game.state.orbs[0].y < launch.y && game.state.orbs[0].y > launch.y - 5);
});

test('pause freezes vertical movement and stage changes and restart recenter the ship', function () {
  const game = fixture(), centerY = game.state.player.y;
  advance(game, 0.1, { up: true }); const movedY = game.state.player.y;
  game.pause(); advance(game, 1, { down: true }); assert.equal(game.state.player.y, movedY);
  game.resume(); game._enterLevel(2); assert.equal(game.state.player.y, centerY);
  advance(game, 0.1, { down: true }); assert.ok(game.state.player.y > centerY);
  game.restart(); assert.equal(game.state.player.y, centerY);
});

test('movement accelerates over 150 milliseconds and coasts to a stop over 200 milliseconds', function () {
  const game = fixture(), p = game.state.player;
  tick(game, { right: true });
  assert.ok(p.vx > 0 && p.vx < game.config.player.speed); assert.equal(p.vy, 0);
  advance(game, game.config.player.accelerationTime - game.config.step, { right: true });
  assert.ok(Math.abs(p.vx - game.config.player.speed) < 1e-8);
  const releasingX = p.x; tick(game);
  assert.ok(p.x > releasingX); assert.ok(p.vx > 0 && p.vx < game.config.player.speed);
  advance(game, game.config.player.decelerationTime - game.config.step);
  assert.ok(Math.abs(p.vx) < 1e-8); const stoppedX = p.x;
  advance(game, 0.25); assert.equal(p.x, stoppedX);
});

test('reversing direction changes velocity gradually without exceeding maximum speed', function () {
  const game = fixture(), p = game.state.player;
  advance(game, 0.15, { right: true }); const x = p.x;
  tick(game, { left: true }); assert.ok(p.vx > 0); assert.ok(p.x > x);
  advance(game, 0.3, { left: true });
  assert.ok(Math.abs(p.vx + game.config.player.speed) < 1e-8);
  assert.ok(Math.hypot(p.vx, p.vy) <= game.config.player.speed + 1e-8);
});

test('normalized analog input preserves strength, caps diagonals and sanitizes invalid axes', function () {
  const game = fixture(), p = game.state.player;
  advance(game, 0.15, { moveX: 0.5 }); assert.equal(p.vx, game.config.player.speed * 0.5);
  game.resetMovement(); tick(game, { moveX: NaN, moveY: Infinity });
  assert.equal(p.vx, 0); assert.equal(p.vy, 0);
  advance(game, 0.15, { moveX: 99, moveY: -99 });
  assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - game.config.player.speed) < 1e-8);
  assert.ok(p.vx > 0 && p.vy < 0);
});

test('keyboard movement takes precedence over analog including cancelling opposite arrows', function () {
  const game = fixture(), p = game.state.player;
  tick(game, { left: true, moveX: 1, moveY: 1 }); assert.ok(p.vx < 0); assert.equal(p.vy, 0);
  game.resetMovement(); tick(game, { left: true, right: true, moveX: 1 });
  assert.equal(p.vx, 0); assert.equal(p.vy, 0);
  tick(game, { moveY: -1 }); assert.equal(p.vx, 0); assert.ok(p.vy < 0);
});

test('boundaries stop outward momentum without overshoot and allow immediate inward acceleration', function () {
  const game = fixture(), p = game.state.player;
  advance(game, 3, { moveX: -1, moveY: -1 });
  assert.equal(p.x, 30); assert.equal(p.y, 511); assert.equal(p.vx, 0); assert.equal(p.vy, 0);
  tick(game, { moveX: 1, moveY: 1 }); assert.ok(p.x > 30); assert.ok(p.y > 511);
  advance(game, 4, { moveX: 1, moveY: 1 });
  assert.equal(p.x, 930); assert.equal(p.y, 655); assert.equal(p.vx, 0); assert.equal(p.vy, 0);
});

test('pause, stage changes, intermission and restart discard movement inertia', function () {
  const game = fixture(), p = game.state.player;
  tick(game, { right: true, down: true }); assert.ok(p.vx && p.vy);
  game.pause(); assert.equal(p.vx, 0); assert.equal(p.vy, 0); game.resume();
  tick(game); const x = p.x; tick(game); assert.equal(p.x, x);
  tick(game, { right: true }); game._enterLevel(1); assert.equal(p.vx, 0); assert.equal(p.vy, 0);
  game.state.wave = 1; tick(game, { right: true }); assert.equal(game.state.status, 'intermission');
  assert.equal(p.vx, 0); assert.equal(p.vy, 0);
  game.restart(); assert.equal(game.state.player.vx, 0); assert.equal(game.state.player.vy, 0);
});

test('resetMovement preserves position and resets swept movement history and queued commands', function () {
  const game = fixture(), p = game.state.player;
  tick(game, { right: true, up: true }); const x = p.x, y = p.y;
  game.resetMovement(); assert.equal(p.x, x); assert.equal(p.y, y);
  assert.equal(p.previousX, x); assert.equal(p.previousY, y);
  assert.equal(p.vx, 0); assert.equal(p.vy, 0);
  assert.equal(game._input.right, false); assert.equal(game._input.up, false);
  tick(game); assert.equal(p.x, x); assert.equal(p.y, y);
});

test('movement timing overrides are isolated and may disable the ramp for custom controls', function () {
  const game = fixture({ player: { speed: 100, accelerationTime: 0, decelerationTime: 0 } });
  tick(game, { moveX: 1 }); assert.equal(game.state.player.vx, 100);
  tick(game); assert.equal(game.state.player.vx, 0);
  assert.equal(LG.Config.player.accelerationTime, 0.15); assert.equal(LG.Config.player.decelerationTime, 0.2);
});

test('quick fire taps are latched across substep frames and emit only one paired volley', function () {
  const game = fixture(); game.step(game.config.step / 2, { fireTap: true });
  assert.equal(game.state.shots.length, 0); game.step(game.config.step / 2, {});
  assert.equal(game.state.shots.length, 2); advance(game, 0.3);
  assert.equal(game.drainEvents().filter(function (event) { return event.type === 'fire'; }).length, 1);
});

test('a physical fire press and release between fixed ticks emits one paired volley', function () {
  const game = fixture(); game.step(game.config.step / 2, { fire: true });
  assert.equal(game.state.shots.length, 0); game.step(game.config.step / 2, { fire: false });
  assert.equal(game.state.shots.length, 2); advance(game, 0.3);
  assert.equal(game.drainEvents().filter(function (event) { return event.type === 'fire'; }).length, 1);
});

test('a physical short white press releases exactly one orb on the next fixed tick', function () {
  const game = fixture(); game.state.weapon = 'white'; game.state.opsonins = 2;
  game.step(game.config.step / 2, { fire: true }); game.step(game.config.step / 2, { fire: false });
  assert.ok(game.state.charge); assert.equal(game.state.opsonins, 2);
  tick(game); assert.equal(game.state.charge, null); assert.equal(game.state.opsonins, 1);
  assert.equal(game.state.orbs.length, 1); advance(game, 0.3); assert.equal(game.state.orbs.length, 1);
});

test('cancelling an unprocessed physical fire edge prevents delayed fire and white stock consumption', function () {
  ['green', 'white'].forEach(function (weapon) {
    const game = fixture(); game.state.weapon = weapon; game.state.opsonins = 1;
    game.step(game.config.step / 2, { fire: true }); game.cancelCharge();
    game.step(game.config.step / 2, { fire: false }); tick(game);
    assert.equal(game.state.shots.length, 0); assert.equal(game.state.charge, null);
    assert.equal(game.state.orbs.length, 0); assert.equal(game.state.opsonins, 1);
  });
});

test('held fire with a matching tap edge retains one volley and the original repeat cadence', function () {
  const game = fixture(); game.step(game.config.step / 2, { fire: true, fireTap: true });
  game.step(game.config.step / 2, { fire: true }); assert.equal(game.state.shots.length, 2);
  advance(game, 0.5 - game.config.step, { fire: true }); assert.equal(game.state.shots.length, 6);
});

test('a quick white tap releases one low-power opsonin on the following fixed tick', function () {
  const game = fixture(); game.state.weapon = 'white'; game.state.opsonins = 2;
  tick(game, { fireTap: true }); assert.ok(game.state.charge); assert.equal(game.state.opsonins, 2);
  tick(game); assert.equal(game.state.charge, null); assert.equal(game.state.opsonins, 1);
  assert.equal(game.state.orbs.length, 1); assert.ok(game.state.orbs[0].power < 0.03);
  advance(game, 0.2); assert.equal(game.state.orbs.length, 1);
});

test('touch cancellation clears an unprocessed quick tap without firing or spending stock', function () {
  const game = fixture(); game.state.weapon = 'white'; game.state.opsonins = 1;
  game.step(game.config.step / 2, { fireTap: true }); game.cancelCharge();
  game.step(game.config.step / 2, {}); tick(game);
  assert.equal(game.state.charge, null); assert.equal(game.state.orbs.length, 0); assert.equal(game.state.opsonins, 1);
  game.state.weapon = 'green'; game.step(game.config.step / 2, { fireTap: true }); game.cancelCharge();
  game.step(game.config.step / 2, {}); assert.equal(game.state.shots.length, 0);
});

test('cycling to white while a synthetic tap fires still requires a fresh press', function () {
  const game = fixture(); game.state.opsonins = 1;
  tick(game, { fireTap: true, cycle: 1 }); assert.equal(game.state.weapon, 'white');
  assert.equal(game.state.charge, null); tick(game); tick(game, { fireTap: true });
  assert.ok(game.state.charge); tick(game); assert.equal(game.state.opsonins, 0);
});

test('backward cycling wraps through stocked white and cancels charging without spending stock', function () {
  const game = fixture(); game.state.unlocked = ['green', 'blue']; game.state.opsonins = 2;
  tick(game, { cycle: -1 }); assert.equal(game.state.weapon, 'white');
  tick(game, { fire: true }); assert.ok(game.state.charge);
  tick(game, { fire: true, cycle: -1 }); assert.equal(game.state.weapon, 'blue');
  assert.equal(game.state.charge, null); assert.equal(game.state.opsonins, 2);
  tick(game, { cycle: -1 }); assert.equal(game.state.weapon, 'green');
  game.state.opsonins = 0;
  tick(game, { cycle: -1 }); assert.equal(game.state.weapon, 'blue');
  tick(game, { cycle: 1 }); assert.equal(game.state.weapon, 'green');
});
test('switching to white while Space is held requires a fresh press', function () {
  const game = fixture(); game.state.opsonins = 1;
  tick(game, { fire: true }); tick(game, { fire: true, cycle: true });
  assert.equal(game.state.weapon, 'white'); assert.equal(game.state.charge, null);
  tick(game, {}); tick(game, { fire: true }); assert.ok(game.state.charge);
});
test('the power meter rises and falls without spending stock', function () {
  const game = fixture(); game.state.weapon = 'white'; game.state.opsonins = 2;
  advance(game, 0.75, { fire: true }); assert.ok(game.state.charge.power > 0.98);
  advance(game, 0.75, { fire: true }); assert.ok(game.state.charge.power < 0.02);
  assert.equal(game.state.opsonins, 2); assert.equal(game.state.orbs.length, 0);
});
test('release launches exactly one orb and returns to the last antibody at zero', function () {
  const game = fixture(); game._lastAntibody = 'blue'; game.state.unlocked.push('blue');
  charge(game, 0.3); assert.equal(game.state.opsonins, 0); assert.equal(game.state.orbs.length, 1);
  assert.equal(game.state.weapon, 'blue'); advance(game, 0.5); assert.equal(game.state.orbs.length, 1);
});
test('full power settles farther up-screen than low power', function () {
  const low = fixture(), high = fixture(); const lowOrb = charge(low, 1 / 60), highOrb = charge(high, 0.75);
  advance(low, 2); advance(high, 2);
  assert.equal(lowOrb.status, 'settled'); assert.equal(highOrb.status, 'settled');
  assert.ok(highOrb.y < lowOrb.y - 400);
});
test('flying opsonins pass through antigens without damage', function () {
  const game = fixture(); const target = enemy(game, 'purple', 480, 400);
  game.state.orbs.push({ id: 999, x: 480, y: 430, speed: 620, radius: 10, color: 'white', status: 'flying' });
  advance(game, 0.3); assert.equal(target.health, 1);
});
test('switching weapons cancels a charge without spending', function () {
  const game = fixture(); game.state.opsonins = 2; game.state.weapon = 'white';
  advance(game, 0.25, { fire: true }); tick(game, { fire: true, cycle: true });
  assert.equal(game.state.charge, null); assert.equal(game.state.opsonins, 2); assert.equal(game.state.orbs.length, 0);
});
test('pause and focus cancellation discard charge and require a fresh Space press', function () {
  const game = fixture(); game.state.opsonins = 1; game.state.weapon = 'white';
  advance(game, 0.25, { fire: true }); game.pause(); assert.equal(game.state.charge, null);
  const time = game.state.time; advance(game, 1, { fire: true }); assert.equal(game.state.time, time);
  game.resume(); tick(game, { fire: true }); assert.equal(game.state.charge, null);
  tick(game, {}); tick(game, { fire: true }); assert.ok(game.state.charge);
  game.cancelCharge(); tick(game, {}); assert.equal(game.state.opsonins, 1); assert.equal(game.state.orbs.length, 0);
});
test('the first rare pickup appears after 15 active seconds', function () {
  const game = fixture(); advance(game, 14.9); assert.equal(game.state.pickups.length, 0);
  advance(game, 0.1); assert.equal(game.state.pickups.length, 1);
  assert.ok(game._nextPickup >= 45 && game._nextPickup <= 60);
});
test('any antibody color collects a white pickup', function () {
  LG.Colors.forEach(function (color) {
    const game = fixture(); game.state.pickups.push({ id: 999, x: 300, y: 300, radius: 15, color: 'white', age: 0, phase: 0 });
    shot(game, color.id, 300, 325); advance(game, 0.1);
    assert.equal(game.state.opsonins, 1); assert.equal(game.state.pickups.length, 0);
  });
});
test('X consumes settled orbs and leaves flying orbs', function () {
  const game = fixture(); settled(game, 300, 300); settled(game, 600, 300);
  game.state.orbs.push({ id: 999, x: 480, y: 400, radius: 10, color: 'white', status: 'flying', speed: 100 });
  tick(game, { detonate: true }); assert.equal(game.state.orbs.length, 1); assert.equal(game.state.orbs[0].status, 'flying');
  assert.equal(game.state.macrophages.length, 2);
});
test('macrophages wind up for half a second before clearing all colors', function () {
  const game = fixture(); LG.Colors.forEach(function (color, i) { enemy(game, color.id, 300 + i * 35, 300); });
  settled(game, 350, 300); game.activateOps(); advance(game, 0.45); assert.equal(game.state.antigens.length, 4);
  advance(game, 0.05); assert.equal(game.state.antigens.length, 0); assert.equal(game.state.score, 550);
});
test('area radius covers exactly the configured arena fraction', function () {
  const game = fixture(); settled(game, 300, 300); game.activateOps();
  const radius = game.state.macrophages[0].radius;
  assert.ok(Math.abs(Math.PI * radius * radius / (960 * 720) - 0.22) < 1e-10);
});
test('area attacks judge antigen position at the end of the windup', function () {
  const game = fixture(); const target = enemy(game, 'gold', 900, 300);
  settled(game, 300, 300); game.activateOps(); advance(game, 0.25);
  target.homeX = 300; advance(game, 0.25); assert.equal(game.state.antigens.length, 0);
});
test('overlapping area attacks destroy each antigen and award score once', function () {
  const game = fixture(); enemy(game, 'gold', 300, 300);
  settled(game, 300, 300); settled(game, 310, 300); game.activateOps(); advance(game, 0.5);
  assert.equal(game.state.score, 175);
});
test('area attacks leave antigens outside the circles alive', function () {
  const game = fixture(); const target = enemy(game, 'gold', 900, 300);
  settled(game, 100, 300); game.activateOps(); advance(game, 0.5); assert.equal(target.dead, undefined);
});
test('enemy shots cost a life and give two seconds of invulnerability', function () {
  const game = fixture(); game.state.player.invulnerable = 0;
  game._enemyShot(480, game.state.player.y - 5, 0, 0, 'green'); tick(game);
  assert.equal(game.state.lives, 2); assert.equal(game.state.player.invulnerable, 2);
  game._enemyShot(480, game.state.player.y, 0, 0, 'gold'); tick(game); assert.equal(game.state.lives, 2);
  advance(game, 2); game._enemyShot(480, game.state.player.y, 0, 0, 'gold'); tick(game); assert.equal(game.state.lives, 1);
});
test('running out of lives ends the run and freezes the simulation', function () {
  const game = fixture(); game.state.lives = 1; game.state.player.invulnerable = 0;
  game._enemyShot(480, game.state.player.y, 0, 0, 'green'); tick(game);
  assert.equal(game.state.status, 'gameover'); const time = game.state.time;
  advance(game, 2, { fire: true }); assert.equal(game.state.time, time);
});
test('contact damages the ship and sends a surviving antigen back into formation', function () {
  const game = fixture(); game.state.player.invulnerable = 0;
  const target = enemy(game, 'green', 480, game.state.player.y); tick(game);
  assert.equal(game.state.lives, 2); assert.equal(target.dead, undefined); assert.equal(target.loops, 1); assert.equal(target.y, -35);
});
test('escaped antigens loop back instead of disappearing', function () {
  const game = fixture(); const target = enemy(game, 'green', 300, 120);
  target.age = 100; target.hold = 0; target.diveAge = 10; tick(game);
  assert.equal(game.state.antigens.length, 1); assert.equal(target.loops, 1); assert.equal(target.y, -35);
});
test('looping antigen teleports cannot collide with antibodies across the arena', function () {
  const game = fixture(), target = enemy(game, 'green', 300, 120);
  target.age = 100; target.hold = 0; target.diveAge = 10;
  shot(game, 'green', 300, 500, 0); tick(game);
  assert.equal(target.dead, undefined); assert.equal(game.state.score, 0); assert.equal(game.state.shots.length, 1);
  assert.equal(target.previousY, target.y);
});
test('all configured patterns return finite positions and support loops', function () {
  Object.keys(LG.Patterns).forEach(function (name) {
    const game = fixture(), target = game._spawnAntigen('green', name, { homeX: 480, homeY: 120 });
    target.shotTimer = 9999; advance(game, 25); assert.ok(target.loops >= 1);
    assert.ok(Number.isFinite(target.x)); assert.ok(Number.isFinite(target.y));
  });
});
test('scheduled waves spawn only once at their authored times', function () {
  const game = new LG.Game({ seed: 1, levels: [{ title: 'Timing', speed: 1, waves: [
    { at: 0, count: 2, colors: ['green'], patterns: ['straight'] },
    { at: 2, count: 3, colors: ['green'], patterns: ['sine'] }
  ] }] }); game.start(); game.state.player.invulnerable = 9999;
  tick(game); assert.equal(game.state.wave, 1); assert.equal(game.state.antigens.length, 2);
  advance(game, 2); assert.equal(game.state.wave, 2); assert.equal(game.state.antigens.length, 5);
  advance(game, 1); assert.equal(game.state.antigens.length, 5);
});
test('clearing early waves waits for the remaining finite schedule', function () {
  const game = new LG.Game(); game.start(); tick(game); game.state.antigens = []; tick(game);
  assert.equal(game.state.status, 'playing'); assert.equal(game.state.wave, 1);
});
test('stage completion clears transients but preserves score, lives and stock', function () {
  const game = fixture(); game.state.wave = 1; game.state.opsonins = 4; game.state.score = 200; game.state.lives = 2;
  settled(game, 300, 300); game.state.weapon = 'white'; game.state.charge = { time: 0.2, power: 0.2 };
  game.state.pickups.push({ x: 100, y: 20, radius: 15, age: 0, phase: 0 });
  game.state.macrophages.push({ id: 999, x: 900, y: 300, radius: 10, remaining: 1, phase: 'windup', activationId: 999 });
  tick(game, { fire: true }); assert.equal(game.state.status, 'intermission');
  ['orbs', 'pickups', 'shots', 'enemyShots', 'macrophages'].forEach(function (key) { assert.equal(game.state[key].length, 0); });
  assert.equal(game.state.charge, null); assert.equal(game.state.score, 200); assert.equal(game.state.opsonins, 4); assert.equal(game.state.lives, 2);
  advance(game, 3); assert.equal(game.state.level, 2); assert.ok(game.state.boss);
});
test('boss entry unlocks all colors and exposes a colored core', function () {
  const game = bossFixture(); assert.deepEqual(game.state.unlocked, ['green', 'blue']);
  // The fixture has one ordinary level; the real campaign's boss is stage six.
  const campaign = new LG.Game(); campaign.start(); campaign._enterLevel(6);
  assert.equal(campaign.state.unlocked.length, 4); assert.equal(campaign.state.boss.color, 'green');
  assert.equal(campaign.state.boss.maxHealth, 300); assert.ok(campaign.state.boss.coreRadius < campaign.state.boss.radius);
});
test('boss core accepts only matching antibodies', function () {
  const game = bossFixture(), boss = game.state.boss;
  shot(game, 'blue', boss.x, boss.y + 20); tick(game); assert.equal(boss.health, boss.maxHealth);
  shot(game, 'green', boss.x, boss.y + 20); tick(game); assert.equal(boss.health, boss.maxHealth - 1);
});
test('boss body outside the core is not a vulnerable target', function () {
  const game = bossFixture(), boss = game.state.boss;
  shot(game, 'green', boss.x + 60, boss.y + 20); tick(game); assert.equal(boss.health, boss.maxHealth);
});
test('boss warning telegraphs the next color before switching', function () {
  const game = bossFixture({ boss: { colorDuration: 2, telegraph: 0.5 } });
  advance(game, 1.55); assert.equal(game.state.boss.color, 'green'); assert.equal(game.state.boss.nextColor, 'blue');
  assert.ok(game.drainEvents().some(function (event) { return event.type === 'boss-warning'; }));
  advance(game, 0.5); assert.equal(game.state.boss.color, 'blue'); assert.equal(game.state.boss.nextColor, null);
});
test('every boss color uses its configured movement, attack and summons', function () {
  LG.Colors.forEach(function (color) {
    const game = bossFixture(), boss = game.state.boss, mode = LG.BossModes[color.id];
    boss.color = color.id; boss.shotTimer = 0; boss.summonTimer = 0; tick(game);
    const expected = LG.BossAttacks[mode.attack](Object.assign({}, boss, { attackCount: 0 }), game.state.player, game.config).length;
    assert.equal(game.state.enemyShots.length, expected);
    assert.equal(game.state.antigens.length, 4);
    game.state.antigens.forEach(function (target) { assert.equal(target.color, color.id); assert.equal(target.pattern, mode.summon); });
    assert.ok(Number.isFinite(boss.x)); assert.ok(Number.isFinite(boss.y));
    assert.ok(LG.BossMovements[mode.movement]);
  });
});
test('boss health thresholds increase phase while preserving placements', function () {
  const game = bossFixture(); settled(game, 400, 400); game._damageBoss(130);
  assert.equal(game.state.boss.phase, 2); assert.equal(game.state.orbs.length, 1);
  game._damageBoss(120); assert.equal(game.state.boss.phase, 3); assert.equal(game.state.orbs.length, 1);
});
test('one X activation deals at most ten percent boss health despite overlap', function () {
  const game = bossFixture(), boss = game.state.boss;
  settled(game, 480, 140); settled(game, 490, 140); settled(game, 500, 140);
  game.activateOps(); advance(game, 0.5); assert.equal(boss.health, boss.maxHealth * 0.9);
  advance(game, 1); assert.equal(boss.health, boss.maxHealth * 0.9);
});
test('macrophage circles damage the boss when they overlap only its outer body', function () {
  const game = bossFixture(), boss = game.state.boss;
  const radius = Math.sqrt(game.config.opsonin.areaFraction * 960 * 720 / Math.PI);
  const orb = settled(game, boss.x + radius + boss.radius - 5, boss.y);
  game.activateOps(); const cell = game.state.macrophages[0];
  cell.remaining = game.config.step;
  // Isolate geometry at the current position so boss movement during windup
  // cannot accidentally turn the partial overlap into a center overlap.
  assert.ok(Math.hypot(boss.x - orb.x, boss.y - orb.y) > radius);
  game._updateMacrophages(game.config.step);
  assert.equal(boss.health, boss.maxHealth * 0.9);
});
test('separate activations may each deal boss damage and ignore active color', function () {
  const game = bossFixture(), boss = game.state.boss;
  boss.color = 'gold'; settled(game, boss.x, boss.y); game.activateOps(); advance(game, 0.5);
  settled(game, boss.x, boss.y); game.activateOps(); advance(game, 0.5);
  assert.equal(boss.health, boss.maxHealth * 0.8);
});
test('boss defeat immediately produces victory and clears danger', function () {
  const game = bossFixture(); game.state.boss.health = 1;
  game._spawnAntigen('green', 'sine'); game._enemyShot(480, 650, 0, 0, 'green');
  const boss = game.state.boss; shot(game, 'green', boss.x, boss.y + 20); tick(game);
  assert.equal(game.state.status, 'victory'); assert.equal(game.state.antigens.length, 0); assert.equal(game.state.enemyShots.length, 0);
  assert.equal(game.state.score, 5000); assert.ok(game.drainEvents().some(function (event) { return event.type === 'victory'; }));
});
test('restart resets inventory, lives, score, placements and the seeded run', function () {
  const game = fixture(); game.state.opsonins = 5; game.state.lives = 1; game.state.score = 500;
  settled(game, 300, 300); game.restart();
  assert.equal(game.state.opsonins, 0); assert.equal(game.state.lives, 3); assert.equal(game.state.score, 0);
  assert.equal(game.state.orbs.length, 0); assert.equal(game.state.level, 1); assert.equal(game.state.status, 'playing');
});
test('identical seeds and fixed inputs produce identical simulations', function () {
  const a = new LG.Game({ seed: 42 }), b = new LG.Game({ seed: 42 }); a.start(); b.start();
  for (let i = 0; i < 1000; i += 1) {
    const input = { left: i % 180 < 80, right: i % 180 > 100, fire: true, cycle: i % 300 === 0 };
    tick(a, input); tick(b, input);
  }
  assert.deepEqual(a.state, b.state); assert.deepEqual(a.drainEvents(), b.drainEvents());
});
test('fixed accumulation preserves action edges received before a full tick', function () {
  const game = fixture(); game.state.unlocked.push('blue');
  game.step(1 / 120, { cycle: true }); assert.equal(game.state.weapon, 'green');
  game.step(1 / 120, {}); assert.equal(game.state.weapon, 'blue');
});
test('event queue is bounded and draining is destructive', function () {
  const game = fixture({ eventLimit: 5 });
  for (let i = 0; i < 10; i += 1) game._event('test');
  assert.equal(game.drainEvents().length, 5); assert.equal(game.drainEvents().length, 0);
});
test('campaign catalogs contain five finite wave schedules and valid references', function () {
  assert.equal(LG.Levels.length, 5);
  LG.Levels.forEach(function (level, index) {
    assert.ok(level.waves.length > 0); assert.equal(level.id, index + 1);
    level.waves.forEach(function (wave, wi) {
      assert.ok(Number.isFinite(wave.at) && wave.at >= 0);
      if (wi > 0) assert.ok(wave.at >= level.waves[wi - 1].at);
      assert.ok(Number.isInteger(wave.count) && wave.count > 0);
      assert.ok(wave.colors.length > 0 && wave.patterns.length > 0);
      wave.colors.forEach(function (color) { assert.ok(LG.Antigens[color]); assert.ok(LG.ColorById[color].unlock <= level.id); });
      wave.patterns.forEach(function (name) { assert.equal(typeof LG.Patterns[name], 'function'); });
    });
  });
});
test('balance overrides are isolated between game instances', function () {
  const custom = fixture({ player: { speed: 100 }, boss: { health: 50 } }), normal = fixture();
  assert.equal(custom.config.player.speed, 100); assert.equal(normal.config.player.speed, 425);
  assert.equal(custom.config.player.radius, 18); assert.equal(LG.Config.boss.health, 300);
});

test('antigen response defaults on and may be changed before starting or while paused', function () {
  const game = new LG.Game(); assert.equal(game.state.antigenResponse, true);
  game.setAntigenResponse(false); game.start(); assert.equal(game.state.antigenResponse, false);
  game.pause(); game.setAntigenResponse(true); assert.equal(game.state.status, 'paused');
  assert.equal(game.state.antigenResponse, true); game.resume();
  const passive = new LG.Game({ antigenResponse: false }); assert.equal(passive.state.antigenResponse, false);
});
test('turning response off clears hostile shots and suppresses new antigen fire until reenabled', function () {
  const game = fixture(), target = enemy(game, 'green', 300, 300);
  game._enemyShot(300, 310, 0, 100, 'green'); assert.equal(game.state.enemyShots.length, 1);
  game.setAntigenResponse(false); assert.equal(game.state.enemyShots.length, 0);
  target.shotTimer = 0; tick(game); assert.equal(game.state.enemyShots.length, 0);
  assert.ok(target.shotTimer > 0); game._enemyShot(300, 310, 0, 100, 'green');
  assert.equal(game.state.enemyShots.length, 0);
  game.setAntigenResponse(true); target.shotTimer = 0; tick(game);
  assert.equal(game.state.enemyShots.length, 1);
});
test('suppressed fire preserves ordinary antigen motion and seeded attack timing', function () {
  const active = fixture(), passive = fixture(); passive.setAntigenResponse(false);
  const a = enemy(active, 'purple', 300, 300), b = enemy(passive, 'purple', 300, 300);
  a.shotTimer = b.shotTimer = 0;
  advance(active, 12); advance(passive, 12);
  ['x', 'y', 'age', 'diveAge', 'phase', 'shotTimer', 'loops'].forEach(function (key) { assert.equal(a[key], b[key]); });
  assert.equal(active.random(), passive.random());
  assert.equal(passive.state.enemyShots.length, 0);
});
test('passive mode advances authored wave spawns fifty percent faster without adding members', function () {
  const levels = [{ title: 'Spawn rate', speed: 1, waves: [
    { at: 0, count: 2, colors: ['green'], patterns: ['straight'] },
    { at: 3, count: 3, colors: ['green'], patterns: ['sine'] },
    { at: 6, count: 4, colors: ['green'], patterns: ['arc'] }
  ] }];
  const active = new LG.Game({ levels: levels }), passive = new LG.Game({ levels: levels, antigenResponse: false });
  active.start(); passive.start(); active.state.player.invulnerable = passive.state.player.invulnerable = 9999;
  advance(active, 2); advance(passive, 2);
  assert.equal(active.state.wave, 1); assert.equal(passive.state.wave, 2);
  assert.equal(passive.state.antigens.length, 5);
  assert.ok(Math.abs(passive.state.stageTime - 2) < 1e-8);
  assert.ok(Math.abs(passive.state.spawnTime - 3) < 1e-8);
  advance(passive, 2); assert.equal(passive.state.wave, 3); assert.equal(passive.state.antigens.length, 9);
  advance(passive, 1); assert.equal(passive.state.antigens.length, 9);
});
test('changing response midstage preserves the accumulated spawn clock and antigen flight', function () {
  const game = fixture(), target = enemy(game, 'blue', 300, 300);
  advance(game, 1); game.setAntigenResponse(false); advance(game, 2);
  assert.ok(Math.abs(game.state.spawnTime - 4) < 1e-8);
  assert.ok(Math.abs(target.age - 5.2) < 1e-8);
  game.setAntigenResponse(true); advance(game, 1);
  assert.ok(Math.abs(game.state.spawnTime - 5) < 1e-8);
  assert.ok(Math.abs(game.state.stageTime - 4) < 1e-8);
});
test('all boss modes stop shooting while preserving movement, color clocks and attack cadence', function () {
  LG.Colors.forEach(function (color) {
    const active = bossFixture(), passive = bossFixture(); passive.setAntigenResponse(false);
    active.state.boss.color = passive.state.boss.color = color.id;
    active.state.boss.shotTimer = passive.state.boss.shotTimer = 0;
    advance(active, 2); advance(passive, 2);
    assert.ok(active.state.enemyShots.length > 0); assert.equal(passive.state.enemyShots.length, 0);
    ['x', 'y', 'age', 'colorAge', 'color', 'attackCount', 'shotTimer', 'phase'].forEach(function (key) {
      assert.equal(active.state.boss[key], passive.state.boss[key]);
    });
  });
});
test('passive boss summons run fifty percent faster without changing minion speed or count', function () {
  const active = bossFixture(), passive = bossFixture(); passive.setAntigenResponse(false);
  active.state.boss.summonTimer = passive.state.boss.summonTimer = 3;
  advance(active, 2); advance(passive, 2);
  assert.equal(active.state.antigens.length, 0); assert.equal(passive.state.antigens.length, 4);
  passive.state.antigens.forEach(function (target) { assert.equal(target.speed, 1); assert.equal(target.pattern, 'sine'); });
});
test('IVIG is rarer than opsonin and first appears at seventy-five active seconds', function () {
  const game = fixture();
  assert.ok(game.config.ivig.firstPickup > game.config.opsonin.firstPickup);
  assert.ok(game.config.ivig.pickupIntervalMin > game.config.opsonin.pickupIntervalMax);
  advance(game, 74.9); assert.equal(game.state.pickups.filter(function (pickup) { return pickup.kind === 'ivig'; }).length, 0);
  game.pause(); advance(game, 5); game.resume(); advance(game, 0.1);
  assert.equal(game.state.pickups.filter(function (pickup) { return pickup.kind === 'ivig'; }).length, 1);
  assert.ok(game._nextIVIG >= 165 && game._nextIVIG <= 210);
});
test('IVIG traverses horizontally and expires after five seconds without collecting itself', function () {
  const game = fixture({ ivig: { firstPickup: 0 } }); tick(game);
  const pickup = game.state.pickups.find(function (item) { return item.kind === 'ivig'; });
  assert.ok(pickup); assert.equal(pickup.radius, 11);
  const startX = pickup.x, startY = pickup.y; advance(game, 2.4);
  assert.equal(pickup.y, startY); assert.ok(Math.abs(pickup.x - startX) > 450);
  assert.ok(game.state.pickups.includes(pickup)); advance(game, 2.6);
  assert.ok(!game.state.pickups.includes(pickup)); assert.equal(game.state.ivigRemaining, 0);
  assert.ok(game.config.ivig.pickupTravelTime < (game.config.height + 50) / game.config.opsonin.pickupSpeed);
});
test('every antibody color can collect IVIG without changing opsonin stock', function () {
  LG.Colors.forEach(function (color) {
    const game = fixture(); game.state.opsonins = 2; ivigPickup(game, 300, 300);
    shot(game, color.id, 300, 325); advance(game, 0.1);
    assert.equal(game.state.pickups.length, 0); assert.equal(game.state.opsonins, 2);
    assert.ok(game.state.ivigRemaining > 29.8);
    assert.ok(game.drainEvents().some(function (event) { return event.type === 'ivig' && event.duration === 30; }));
  });
});
test('a fast horizontal IVIG pickup and antibody use relative swept collision', function () {
  const game = fixture(); ivigPickup(game, 200, 500, { vx: 12000 });
  shot(game, 'gold', 300, 700, 24000); tick(game);
  assert.equal(game.state.pickups.length, 0); assert.equal(game.state.ivigRemaining, 30);
  assert.equal(game.state.shots.length, 0);
});
test('IVIG fires eight antibodies including two of each color before those colors unlock', function () {
  const game = fixture(); game.state.ivigRemaining = 30; tick(game, { fire: true });
  assert.deepEqual(game.state.unlocked, ['green']); assert.equal(game.state.shots.length, 8);
  LG.Colors.forEach(function (color) { assert.equal(game.state.shots.filter(function (item) { return item.color === color.id; }).length, 2); });
  assert.ok(game.state.shots.every(function (item) { return item.damage === 1; }));
});
test('held Space keeps its original cadence while IVIG emits eight per volley', function () {
  const normal = fixture(), boosted = fixture(); boosted.state.ivigRemaining = 30;
  advance(normal, 0.5, { fire: true }); advance(boosted, 0.5, { fire: true });
  assert.equal(normal.state.shots.length, 6); assert.equal(boosted.state.shots.length, 24);
  assert.equal(normal.state.player.cooldown, boosted.state.player.cooldown);
});
test('IVIG pairs travel in a spread while retaining the configured antibody speed', function () {
  const game = fixture(); game.state.ivigRemaining = 30; tick(game, { fire: true });
  const green = game.state.shots.filter(function (item) { return item.color === 'green'; });
  const leftX = green[0].x, rightX = green[1].x; advance(game, 0.2);
  assert.ok(green[0].x < leftX - 20); assert.ok(green[1].x > rightX + 20);
  game.state.shots.forEach(function (item) { assert.ok(Math.abs(Math.hypot(item.vx, item.vy) - game.config.antibody.speed) < 1e-8); });
});
test('IVIG spray retains matching-color antigen and boss damage rules', function () {
  const game = fixture(); game.state.ivigRemaining = 30;
  const target = enemy(game, 'blue', 300, 300);
  shot(game, 'green', 300, 325); tick(game); assert.equal(target.health, 1);
  shot(game, 'blue', target.x, target.y + 25); tick(game); assert.equal(game.state.antigens.length, 0);
  const bossGame = bossFixture(); bossGame.state.ivigRemaining = 30;
  const boss = bossGame.state.boss; shot(bossGame, 'gold', boss.x, boss.y + 20); tick(bossGame);
  assert.equal(boss.health, boss.maxHealth); shot(bossGame, 'green', boss.x, boss.y + 20); tick(bossGame);
  assert.equal(boss.health, boss.maxHealth - 1);
});
test('IVIG freezes on pause and intermission and survives stage and boss entry', function () {
  const game = fixture(); game.state.ivigRemaining = 20; game.pause(); advance(game, 2);
  assert.equal(game.state.ivigRemaining, 20); game.resume();
  game.state.wave = 1; tick(game); assert.equal(game.state.status, 'intermission');
  const remaining = game.state.ivigRemaining; advance(game, 2);
  assert.equal(game.state.ivigRemaining, remaining); advance(game, 1);
  assert.equal(game.state.level, 2); assert.ok(game.state.boss);
  assert.equal(game.state.ivigRemaining, remaining);
});
test('IVIG lasts thirty combat seconds, refreshes on collection and then restores normal paired fire', function () {
  const game = fixture(); game.state.ivigRemaining = 5;
  ivigPickup(game, 300, 300); shot(game, 'green', 300, 325); tick(game);
  assert.equal(game.state.ivigRemaining, 30); advance(game, 29.9); assert.ok(game.state.ivigRemaining > 0);
  advance(game, 0.1); assert.ok(game.state.ivigRemaining < 1e-8);
  tick(game, { fire: true }); assert.equal(game.state.shots.length, 2);
  assert.ok(game.state.shots.every(function (item) { return item.color === 'green' && item.vx === undefined; }));
});
test('IVIG collection returns white mode to the last antibody and cancels charge without spending stock', function () {
  const game = fixture(); game.state.opsonins = 2; game.state.weapon = 'white';
  game._lastAntibody = 'blue'; game.state.unlocked.push('blue'); advance(game, 0.2, { fire: true });
  assert.ok(game.state.charge); ivigPickup(game, 300, 300); shot(game, 'gold', 300, 325);
  tick(game, { fire: true }); assert.equal(game.state.weapon, 'blue'); assert.equal(game.state.charge, null);
  assert.equal(game.state.opsonins, 2); assert.equal(game.state.orbs.length, 0);
  tick(game, { fire: true }); assert.equal(game.state.shots.length, 8);
});
test('white mode still charges and launches a single opsonin during an IVIG buff', function () {
  const game = fixture(); game.state.ivigRemaining = 30; game.state.opsonins = 2;
  charge(game, 0.3); assert.equal(game.state.orbs.length, 1); assert.equal(game.state.opsonins, 1);
  assert.equal(game.state.shots.length, 0); assert.equal(game.state.weapon, 'white');
  assert.ok(game.state.ivigRemaining < 30 && game.state.ivigRemaining > 29.6);
});
test('restart clears IVIG but retains the antigen response preference', function () {
  const game = fixture(); game.setAntigenResponse(false); game.state.ivigRemaining = 30;
  ivigPickup(game, 300, 300); game.restart();
  assert.equal(game.state.antigenResponse, false); assert.equal(game.state.ivigRemaining, 0);
  assert.equal(game.state.pickups.length, 0); assert.equal(game._nextIVIG, 75);
  assert.equal(game.state.spawnTime, 0);
});

let failed = 0;
for (const entry of tests) {
  try { entry.run(); process.stdout.write('PASS ' + entry.name + '\n'); }
  catch (error) { failed += 1; process.stderr.write('FAIL ' + entry.name + '\n' + error.stack + '\n'); }
}
process.stdout.write('\n' + (tests.length - failed) + '/' + tests.length + ' antigen shooter checks passed.\n');
if (failed) process.exitCode = 1;
