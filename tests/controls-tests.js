'use strict';
const assert = require('node:assert/strict');
require('../lyric_galaga/js/controls.js');
const Controls = globalThis.LyricGalaga.Controls;
const tests = [];
function test(name, run) { tests.push({ name, run }); }

class Target {
  constructor(tag) {
    this.tagName = tag || '';
    this.listeners = new Map();
    this.captured = new Set();
    this.classes = new Set();
    this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) };
    this.styles = new Map();
    this.style = { setProperty: (name, value) => this.styles.set(name, value) };
    this.rect = { left: 0, top: 0, width: 84, height: 84 };
  }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { if (this.listeners.has(name)) this.listeners.get(name).delete(callback); }
  emit(name, values) {
    const event = Object.assign({ type: name, target: this, detail: 0,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }
    }, values || {});
    Array.from(this.listeners.get(name) || []).forEach(callback => callback(event));
    return event;
  }
  closest() {
    let element = this;
    while (element) {
      if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'DIALOG'].includes(element.tagName) || element.noFire) return element;
      element = element.parent;
    }
    return null;
  }
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  getBoundingClientRect() { return this.rect; }
}
class Clock {
  constructor() { this.now = 0; this.next = 0; this.timers = new Map(); }
  schedule(callback, wait) { const id = ++this.next; this.timers.set(id, { at: this.now + wait, callback }); return id; }
  cancel(id) { this.timers.delete(id); }
  tick(milliseconds) {
    const target = this.now + milliseconds;
    for (;;) {
      const pending = Array.from(this.timers.entries()).filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!pending) break;
      this.now = pending[1].at;
      this.timers.delete(pending[0]);
      pending[1].callback();
    }
    this.now = target;
  }
}
function fixture(options) {
  options = options || {};
  const clock = new Clock(), environment = new Target(), document = new Target();
  const surface = new Target('DIV'), joystick = new Target('DIV'), stick = new Target('SPAN');
  const cycleButton = new Target('BUTTON'), activateButton = new Target('BUTTON');
  let playing = options.playing !== false, cancellations = 0;
  const changes = [], unavailable = [], pauses = [], rotations = [];
  document.activeElement = surface;
  document.querySelector = () => document.dialogOpen ? {} : null;
  environment.document = document;
  environment.screen = { orientation: new Target() };
  environment.screen.orientation.angle = options.angle == null ? 90 : options.angle;
  if (options.useOrientationFallback) {
    delete environment.screen.orientation.angle;
    environment.orientation = options.angle == null ? -90 : options.angle;
  }
  environment.performance = { now: () => clock.now };
  environment.setTimeout = (callback, wait) => clock.schedule(callback, wait);
  environment.clearTimeout = id => clock.cancel(id);
  environment.matchMedia = () => ({ matches: !!options.mobile });
  environment.navigator = { maxTouchPoints: options.mobile ? 5 : 0 };
  environment.isSecureContext = options.secure !== false;
  environment.DeviceOrientationEvent = Object.prototype.hasOwnProperty.call(options, 'sensor') ? options.sensor : { requestPermission: () => Promise.resolve('granted') };
  const controls = new Controls({ environment, document, surface, joystick, stick, cycleButton, activateButton,
    isPlaying: () => playing,
    onPause: reason => { pauses.push(reason); if (options.pauseReturnsFalse) return false; playing = false; return true; },
    onCancel: () => cancellations++, onChange: (...values) => changes.push(values),
    onUnavailable: reason => unavailable.push(reason), onOrientationChange: angle => rotations.push(angle),
    config: Object.assign({ calibrationDuration: 0.02, calibrationTimeout: 0.16, sensorTimeout: 0.05 }, options.config || {})
  });
  return { controls, clock, environment, document, surface, joystick, stick, cycleButton, activateButton,
    changes, unavailable, pauses, rotations, cancellations: () => cancellations,
    setPlaying: value => { playing = value; },
    key: (code, extra) => document.emit('keydown', Object.assign({ code, repeat: false }, extra)),
    up: code => document.emit('keyup', { code }),
    down: (element, id, extra) => element.emit('pointerdown', Object.assign({ pointerId: id, button: 0, clientX: 42, clientY: 42 }, extra)),
    release: id => environment.emit('pointerup', { pointerId: id }),
    cancel: id => environment.emit('pointercancel', { pointerId: id }),
    reading: (beta, gamma) => environment.emit('deviceorientation', { beta, gamma })
  };
}
async function readyTilt(f, beta, gamma) {
  const pending = f.controls.enableTilt();
  await Promise.resolve();
  await Promise.resolve();
  f.reading(beta || 0, gamma || 0);
  f.clock.tick(40);
  assert.equal(await pending, true);
}

test('keyboard keeps held arrows and Space, while Z and X are one-shot actions', () => {
  const f = fixture(); f.key('ArrowLeft'); f.key('ArrowUp'); f.key('Space'); f.key('KeyZ'); f.key('KeyX');
  const first = f.controls.sample(1 / 60);
  assert.equal(first.left, true); assert.equal(first.up, true); assert.equal(first.fire, true);
  assert.equal(first.cycle, 1); assert.equal(first.detonate, true);
  const held = f.controls.sample(1 / 60); assert.equal(held.left, true); assert.equal(held.fire, true);
  assert.equal(held.cycle, false); assert.equal(held.detonate, false);
  f.up('ArrowLeft'); f.up('ArrowUp'); f.up('Space'); assert.equal(f.controls.sample(1 / 60).fire, false);
});
test('repeated Z/X and modified keys do not queue gameplay actions', () => {
  const f = fixture(); f.key('KeyZ', { repeat: true }); f.key('KeyX', { repeat: true }); f.key('Space', { ctrlKey: true });
  const sample = f.controls.sample(1 / 60); assert.equal(sample.cycle, false); assert.equal(sample.detonate, false); assert.equal(sample.fire, false);
});
test('text inputs, open dialogs, and Space on buttons retain native keyboard behavior', () => {
  const f = fixture(); f.document.activeElement = new Target('INPUT');
  assert.equal(!!f.key('Space').prevented, false); assert.equal(f.controls.sample(1 / 60).fire, false);
  f.document.activeElement = f.cycleButton; assert.equal(!!f.key('Space').prevented, false);
  f.document.activeElement = f.surface; f.document.dialogOpen = true;
  assert.equal(!!f.key('Escape').prevented, false); assert.equal(f.pauses.length, 0);
  f.key('ArrowRight'); assert.equal(f.controls.sample(1 / 60).right, false);
});
test('pause keyboard actions work outside gameplay but repeated Escape is ignored', () => {
  const f = fixture({ playing: false }); assert.equal(f.key('KeyP').prevented, true);
  f.key('Escape', { repeat: true }); assert.equal(f.pauses.length, 1);
  f.key('Space'); assert.equal(f.controls.sample(1 / 60).fire, false);
  const native = fixture({ pauseReturnsFalse: true }); assert.equal(!!native.key('Escape').prevented, false);
});
test('Space keyup preserves the native checkbox toggle', () => {
  const f = fixture(); const checkbox = new Target('INPUT'); checkbox.type = 'checkbox';
  f.document.activeElement = checkbox;
  assert.equal(!!f.key('Space', { target: checkbox }).prevented, false);
  assert.equal(!!f.document.emit('keyup', { code: 'Space', target: checkbox }).prevented, false);
  assert.equal(f.controls.sample(1 / 60).fire, false);
});
test('a short surface tap is preserved exactly once between simulation samples', () => {
  const f = fixture({ mobile: true }); f.down(f.surface, 1); f.release(1);
  const sample = f.controls.sample(1 / 60); assert.equal(sample.fire, false); assert.equal(sample.fireTap, true);
  assert.equal(f.controls.sample(1 / 60).fireTap, false); assert.equal(f.surface.captured.size, 0);
});
test('held surface contacts repeatedly fire without an extra shot on release', () => {
  const f = fixture(); f.down(f.surface, 1);
  assert.equal(f.controls.sample(1 / 60).fire, true); assert.equal(f.controls.sample(1 / 60).fire, true);
  f.release(1); const sample = f.controls.sample(1 / 60); assert.equal(sample.fire, false); assert.equal(sample.fireTap, false);
});
test('multiple firing fingers form one hold, without short-tap duplicates', () => {
  const f = fixture(); f.down(f.surface, 1); f.controls.sample(1 / 60); f.down(f.surface, 2); f.release(2);
  assert.equal(f.controls.sample(1 / 60).fireTap, false); assert.equal(f.controls.sample(1 / 60).fire, true);
  f.release(1); assert.equal(f.controls.sample(1 / 60).fireTap, false);
});
test('pointer cancellation cancels charging but keeps another held firing contact', () => {
  const f = fixture(); f.down(f.surface, 1); f.down(f.surface, 2); f.controls.sample(1 / 60); f.cancel(1);
  assert.equal(f.cancellations(), 1); assert.equal(f.controls.sample(1 / 60).fire, true);
  f.cancel(2); const sample = f.controls.sample(1 / 60); assert.equal(sample.fire, false); assert.equal(sample.fireTap, false);
});
test('cancelled quick taps and lost captures do not launch an opsonin', () => {
  const f = fixture(); f.down(f.surface, 1); f.environment.emit('lostpointercapture', { pointerId: 1 });
  assert.equal(f.controls.sample(1 / 60).fireTap, false); assert.equal(f.cancellations(), 1);
  f.release(1); assert.equal(f.cancellations(), 1);
});
test('cycle and activation buttons coexist with a held firing contact', () => {
  const f = fixture(); f.down(f.surface, 1); f.down(f.cycleButton, 2); f.down(f.activateButton, 3);
  const sample = f.controls.sample(1 / 60); assert.equal(sample.fire, true); assert.equal(sample.cycle, 1); assert.equal(sample.detonate, true);
  assert.equal(f.cycleButton.classes.has('pressed'), true); f.release(2); assert.equal(f.cycleButton.classes.has('pressed'), false);
  f.release(3); f.release(1); assert.equal(f.controls.sample(1 / 60).fireTap, false);
});
test('button pointer clicks do not repeat actions, but accessible keyboard clicks work', () => {
  const f = fixture(); f.down(f.cycleButton, 1); assert.equal(f.controls.sample(1 / 60).cycle, 1); f.release(1);
  f.cycleButton.emit('click', { detail: 1 }); assert.equal(f.controls.sample(1 / 60).cycle, false);
  f.cycleButton.emit('click', { detail: 0 }); f.activateButton.emit('click', { detail: 0 });
  const sample = f.controls.sample(1 / 60); assert.equal(sample.cycle, 1); assert.equal(sample.detonate, true);
});
test('menus, links, and no-fire descendants are excluded from the fire surface', () => {
  const f = fixture(); const icon = new Target('SPAN'); icon.parent = f.cycleButton;
  f.down(f.surface, 1, { target: icon }); assert.equal(f.controls.sample(1 / 60).fire, false);
  const menu = new Target('DIV'); menu.noFire = true; f.down(f.surface, 2, { target: menu });
  assert.equal(f.controls.sample(1 / 60).fire, false); assert.equal(f.surface.captured.size, 0);
});
test('joystick coordinates are normalized, circularly capped, and reflected in stick CSS', () => {
  const f = fixture({ mobile: true }); f.down(f.joystick, 1, { clientX: 84, clientY: 84 });
  const sample = f.controls.sample(1 / 60); assert.ok(Math.abs(sample.moveX - Math.SQRT1_2) < 1e-8);
  assert.ok(Math.abs(sample.moveY - Math.SQRT1_2) < 1e-8); assert.equal(sample.fire, false);
  assert.equal(f.stick.styles.get('--stick-x'), '29.70px');
  f.environment.emit('pointermove', { pointerId: 1, clientX: 0, clientY: 42 }); assert.equal(f.controls.sample(1 / 60).moveX, -1);
  f.release(1); assert.equal(f.controls.sample(1 / 60).moveX, 0); assert.equal(f.stick.styles.get('--stick-x'), '0.00px');
});
test('joystick supports only one steering contact and is inactive in tilt/keyboard modes', () => {
  const f = fixture({ mobile: true }); f.down(f.joystick, 1, { clientX: 84 }); f.down(f.joystick, 2, { clientX: 0 });
  assert.equal(f.controls.sample(1 / 60).moveX, 1); assert.equal(f.joystick.captured.size, 1);
  f.controls.setMode('keyboard'); f.down(f.joystick, 3, { clientX: 84 }); assert.equal(f.controls.sample(1 / 60).moveX, 0);
});
test('inactive gameplay ignores touch firing, joystick, and thumb actions', () => {
  const f = fixture({ mobile: true, playing: false }); f.down(f.surface, 1); f.down(f.joystick, 2); f.down(f.cycleButton, 3);
  f.cycleButton.emit('click', { detail: 0 }); const sample = f.controls.sample(1 / 60);
  assert.equal(sample.fire, false); assert.equal(sample.cycle, false); assert.equal(f.surface.captured.size, 0);
});
test('clear and mode switches release contacts and discard pending actions', () => {
  const f = fixture({ mobile: true }); f.key('ArrowRight'); f.down(f.surface, 1); f.down(f.joystick, 2, { clientX: 84 }); f.controls.queueAction('cycle');
  f.controls.setMode('tilt'); const sample = f.controls.sample(1 / 60);
  assert.equal(sample.right, false); assert.equal(sample.fire, false); assert.equal(sample.cycle, false); assert.equal(sample.moveX, 0);
  assert.equal(f.cancellations(), 1); assert.equal(f.surface.captured.size, 0); assert.equal(f.joystick.captured.size, 0);
  f.controls.clear(false); assert.equal(f.cancellations(), 1);
});
test('destroy removes event listeners and is safe to call repeatedly', () => {
  const f = fixture(); f.down(f.surface, 1); f.controls.destroy(); f.controls.destroy();
  assert.equal(f.surface.captured.size, 0); f.key('Space'); f.down(f.surface, 2); f.controls.queueAction('cycle');
  const sample = f.controls.sample(1 / 60); assert.equal(sample.fire, false); assert.equal(sample.cycle, false); assert.equal(f.cancellations(), 1);
});
test('tilt permission is invoked synchronously from the enabling gesture', async () => {
  let requested = false; const f = fixture({ sensor: { requestPermission: () => { requested = true; return Promise.resolve('granted'); } } });
  const pending = f.controls.enableTilt(); assert.equal(requested, true);
  await Promise.resolve(); await Promise.resolve(); f.reading(0, 0); f.clock.tick(40);
  assert.equal(await pending, true); assert.equal(f.controls.mode, 'tilt'); assert.equal(f.controls.needsCalibration, false);
});
test('denied or rejected motion permission falls back to joystick', async () => {
  for (const requestPermission of [() => Promise.resolve('denied'), () => Promise.reject(new Error('blocked'))]) {
    const f = fixture({ sensor: { requestPermission } }); assert.equal(await f.controls.enableTilt(), false);
    assert.equal(f.controls.mode, 'joystick'); assert.equal(f.unavailable.length, 1); assert.equal(f.controls.tiltStatus, 'unavailable');
  }
});
test('missing sensors and insecure contexts leave keyboard and joystick usable', async () => {
  for (const options of [{ sensor: null }, { secure: false }]) {
    const f = fixture(options); assert.equal(await f.controls.enableTilt(), false); assert.equal(f.controls.mode, 'joystick');
    f.key('ArrowRight'); assert.equal(f.controls.sample(1 / 60).right, true);
  }
});
test('finite orientation readings are required and missing readings time out without an initial pause', async () => {
  const f = fixture(); const pending = f.controls.enableTilt(); await Promise.resolve(); await Promise.resolve();
  f.reading(null, 0); f.reading(NaN, 0); f.controls.sample(1 / 60); assert.equal(f.pauses.length, 0);
  f.clock.tick(200); assert.equal(await pending, false); assert.equal(f.controls.mode, 'joystick'); assert.equal(f.pauses.length, 0);
});
test('screen-relative tilt supports both landscape directions and the iOS orientation fallback', async () => {
  const right = fixture({ angle: 90, config: { tiltSmoothing: 0 } }); await readyTilt(right);
  right.reading(20, 0); assert.ok(right.controls.sample(1 / 60).moveX > 0.999);
  right.reading(0, 20); assert.ok(right.controls.sample(1 / 60).moveY < -0.999);
  const left = fixture({ angle: 270, config: { tiltSmoothing: 0 } }); await readyTilt(left);
  left.reading(20, 0); assert.ok(left.controls.sample(1 / 60).moveX < -0.999);
  left.reading(0, 20); assert.ok(left.controls.sample(1 / 60).moveY > 0.999);
  const fallback = fixture({ angle: -90, useOrientationFallback: true, config: { tiltSmoothing: 0 } });
  await readyTilt(fallback); fallback.reading(20, 0); assert.ok(fallback.controls.sample(1 / 60).moveX < -0.999);
});
test('calibration uses the neutral holding angle and the three-degree dead zone', async () => {
  const f = fixture({ config: { tiltSmoothing: 0 } }); await readyTilt(f, 25, 0);
  f.reading(27, 0); assert.equal(f.controls.sample(1 / 60).moveX, 0);
  f.reading(45, 0); assert.ok(f.controls.sample(1 / 60).moveX > 0.999);
});
test('tilt smoothing limits abrupt changes and caps diagonal steering magnitude', async () => {
  const f = fixture(); await readyTilt(f); f.reading(20, 20);
  const first = f.controls.sample(1 / 60); assert.ok(first.moveX > 0 && first.moveX < 0.2);
  assert.ok(Math.hypot(first.moveX, first.moveY) <= 1);
  f.clock.tick(20); f.reading(20, 20); const later = f.controls.sample(0.12); assert.ok(later.moveX > first.moveX);
});
test('stale active tilt readings pause and fall back, clearing held firing input', async () => {
  const f = fixture(); await readyTilt(f); f.key('Space'); f.down(f.surface, 1);
  f.clock.tick(60); const sample = f.controls.sample(1 / 60);
  assert.equal(f.pauses.length, 1); assert.equal(f.controls.mode, 'joystick'); assert.equal(sample.fire, false); assert.equal(sample.moveX, 0);
  f.controls.sample(1 / 60); assert.equal(f.pauses.length, 1);
});
test('calibration invalidation preserves tilt mode and requires fresh recalibration', async () => {
  const f = fixture({ playing: false, config: { tiltSmoothing: 0 } }); await readyTilt(f); f.reading(20, 0); f.controls.invalidateCalibration();
  assert.equal(f.controls.mode, 'tilt'); assert.equal(f.controls.needsCalibration, true); assert.equal(f.controls.sample(1 / 60).moveX, 0);
  const pending = f.controls.calibrate(); f.reading(20, 0); f.clock.tick(40); assert.equal(await pending, true);
  f.reading(20, 0); assert.equal(f.controls.sample(1 / 60).moveX, 0); f.reading(40, 0); assert.ok(f.controls.sample(1 / 60).moveX > 0.999);
});
test('landscape rotation invalidates calibration exactly once and clears steering contacts', async () => {
  const f = fixture({ playing: false }); await readyTilt(f); f.environment.screen.orientation.angle = 270;
  f.environment.screen.orientation.emit('change'); f.environment.emit('orientationchange');
  assert.deepEqual(f.rotations, [270]); assert.equal(f.controls.mode, 'tilt'); assert.equal(f.controls.needsCalibration, true);
});
test('destroy resolves a pending calibration and removes its timers', async () => {
  const f = fixture(); const pending = f.controls.enableTilt(); await Promise.resolve(); await Promise.resolve();
  assert.ok(f.clock.timers.size > 0); f.controls.destroy(); assert.equal(await pending, false); assert.equal(f.clock.timers.size, 0);
});
test('a permission result arriving after disposal cannot start a sensor listener', async () => {
  let grant; const f = fixture({ sensor: { requestPermission: () => new Promise(resolve => { grant = resolve; }) } });
  const pending = f.controls.enableTilt(); f.controls.destroy(); grant('granted'); assert.equal(await pending, false);
  assert.equal(f.environment.listeners.get('deviceorientation'), undefined);
});
test('choosing the current joystick mode cancels a pending tilt permission grant', async () => {
  let grant; const f = fixture({ mobile: true, sensor: { requestPermission: () => new Promise(resolve => { grant = resolve; }) } });
  const pending = f.controls.enableTilt();
  f.controls.setMode('joystick');
  const changes = f.changes.length;
  grant('granted');
  assert.equal(await pending, false); assert.equal(f.controls.mode, 'joystick');
  assert.equal(f.controls.tiltStatus, 'inactive'); assert.equal(f.changes.length, changes);
  assert.equal(f.environment.listeners.get('deviceorientation'), undefined); assert.equal(f.clock.timers.size, 0);
});
test('late denied or rejected permission does not replace a newer control choice or message', async () => {
  for (const rejected of [false, true]) {
    let finish; const f = fixture({ sensor: { requestPermission: () => new Promise((resolve, reject) => { finish = rejected ? reject : resolve; }) } });
    const pending = f.controls.enableTilt(); f.controls.setMode('joystick');
    const changes = f.changes.length;
    finish(rejected ? new Error('cancelled permission') : 'denied');
    assert.equal(await pending, false); assert.equal(f.controls.mode, 'joystick');
    assert.equal(f.controls.tiltStatus, 'inactive'); assert.equal(f.unavailable.length, 0); assert.equal(f.changes.length, changes);
  }
});
test('a superseded permission denial cannot interrupt a newer successful tilt calibration', async () => {
  const requests = []; const f = fixture({ sensor: { requestPermission: () => new Promise(resolve => requests.push(resolve)) } });
  const first = f.controls.enableTilt(), second = f.controls.enableTilt();
  requests[1]('granted'); await Promise.resolve(); await Promise.resolve();
  f.reading(0, 0); f.clock.tick(40); assert.equal(await second, true);
  requests[0]('denied'); assert.equal(await first, false);
  assert.equal(f.controls.mode, 'tilt'); assert.equal(f.controls.tiltStatus, 'ready'); assert.equal(f.unavailable.length, 0);
});
test('orientation invalidation cancels pending permission before sensor setup', async () => {
  let grant; const f = fixture({ sensor: { requestPermission: () => new Promise(resolve => { grant = resolve; }) } });
  const pending = f.controls.enableTilt(); f.controls.invalidateCalibration(); grant('granted');
  assert.equal(await pending, false); assert.equal(f.controls.mode, 'keyboard');
  assert.equal(f.controls.tiltStatus, 'inactive'); assert.equal(f.environment.listeners.get('deviceorientation'), undefined);
});

(async function () {
  let passed = 0;
  for (const entry of tests) {
    try { await entry.run(); passed++; console.log('PASS ' + entry.name); }
    catch (error) { console.error('FAIL ' + entry.name); console.error(error); process.exitCode = 1; }
  }
  console.log(passed + '/' + tests.length + ' controls checks passed.');
})();
