(function (root) {
  'use strict';
  const LG = root.LyricGalaga = root.LyricGalaga || {};
  const defaults = {
    joystickRadius: 42,
    tiltDeadZone: 3,
    tiltFullAngle: 20,
    tiltSmoothing: 0.12,
    calibrationDuration: 0.5,
    calibrationTimeout: 1.6,
    sensorTimeout: 0.5
  };
  const controlledKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ', 'KeyX', 'KeyP', 'Escape']);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function normalized(x, y) {
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x: x, y: y };
  }
  function orientationAngle(environment) {
    const orientation = environment.screen && environment.screen.orientation;
    if (orientation && Number.isFinite(orientation.angle)) return orientation.angle;
    return Number.isFinite(environment.orientation) ? environment.orientation : 0;
  }
  // Device angles describe the phone, so rotate its projected gravity into screen
  // coordinates. Heading (alpha) is intentionally irrelevant to steering.
  function screenTilt(beta, gamma, angle) {
    const radians = Math.PI / 180;
    const b = beta * radians, g = gamma * radians, a = angle * radians;
    const gx = Math.sin(g) * Math.cos(b), gy = Math.sin(b), gz = Math.cos(g) * Math.cos(b);
    const x = gx * Math.cos(a) + gy * Math.sin(a);
    const y = gy * Math.cos(a) - gx * Math.sin(a);
    return {
      x: Math.atan2(x, Math.hypot(y, gz)) / radians,
      y: Math.atan2(y, Math.hypot(x, gz)) / radians
    };
  }
  function editable(element) {
    return !!element && (element.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName));
  }
  function excludedTarget(element) {
    if (!element) return false;
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'DIALOG'].includes(element.tagName)) return true;
    return typeof element.closest === 'function' && !!element.closest('button, input, select, textarea, a, dialog, [data-no-fire]');
  }

  class KeyboardInput {
    constructor(owner) {
      this.owner = owner;
      this.keys = new Set();
      owner.listen(owner.document, 'keydown', event => this.down(event));
      owner.listen(owner.document, 'keyup', event => this.up(event));
    }
    down(event) {
      const owner = this.owner, document = owner.document;
      if (owner.destroyed || event.altKey || event.ctrlKey || event.metaKey || !controlledKeys.has(event.code)) return;
      if (document && typeof document.querySelector === 'function' && document.querySelector('dialog[open]')) return;
      const focused = document && document.activeElement;
      if (editable(event.target) || editable(focused)) return;
      if (event.code === 'Space' && ((focused && focused.tagName === 'BUTTON') || (event.target && event.target.tagName === 'BUTTON'))) return;
      if (event.code === 'KeyP' || event.code === 'Escape') {
        if (!event.repeat && owner.callbacks.onPause() !== false) event.preventDefault();
        return;
      }
      if (!owner.isPlaying()) return;
      event.preventDefault();
      if (event.code === 'KeyZ') { if (!event.repeat) owner.queueAction('cycle'); }
      else if (event.code === 'KeyX') { if (!event.repeat) owner.queueAction('detonate'); }
      else this.keys.add(event.code);
    }
    up(event) {
      this.keys.delete(event.code);
      const document = this.owner.document, focused = document && document.activeElement;
      if (editable(event.target) || editable(focused)) return;
      if (event.code === 'Space' && focused && focused.tagName === 'BUTTON') return;
      if (this.owner.isPlaying() && controlledKeys.has(event.code) && !(document && document.querySelector && document.querySelector('dialog[open]'))) event.preventDefault();
    }
    clear() { this.keys.clear(); }
    sample() {
      return {
        left: this.keys.has('ArrowLeft'), right: this.keys.has('ArrowRight'),
        up: this.keys.has('ArrowUp'), down: this.keys.has('ArrowDown'),
        fire: this.keys.has('Space')
      };
    }
  }

  class PointerInput {
    constructor(owner, options) {
      this.owner = owner;
      this.surface = options.surface;
      this.joystick = options.joystick;
      this.stick = options.stick;
      this.contacts = new Map();
      this.axis = { x: 0, y: 0 };
      this.joystickId = null;
      this.fireGroupSampled = false;
      owner.listen(this.surface, 'pointerdown', event => this.down(event, 'fire', this.surface));
      owner.listen(this.joystick, 'pointerdown', event => this.down(event, 'joystick', this.joystick));
      [['cycle', options.cycleButton], ['detonate', options.activateButton]].forEach(([kind, element]) => {
        owner.listen(element, 'pointerdown', event => this.down(event, kind, element));
        // Keyboard/assistive-technology clicks have no pointerdown. Pointer clicks
        // already acted on press and must not cycle twice.
        owner.listen(element, 'click', event => {
          if (event.detail === 0 && owner.isPlaying() && !element.disabled) owner.queueAction(kind);
        });
      });
      owner.listen(owner.environment, 'pointermove', event => this.move(event));
      owner.listen(owner.environment, 'pointerup', event => this.end(event, false));
      owner.listen(owner.environment, 'pointercancel', event => this.end(event, true));
      owner.listen(owner.environment, 'lostpointercapture', event => this.end(event, true));
    }
    fireCount() {
      let count = 0;
      this.contacts.forEach(contact => { if (contact.kind === 'fire') count++; });
      return count;
    }
    down(event, kind, element) {
      if (this.owner.destroyed || !this.owner.isPlaying() || (event.button != null && event.button !== 0) || !element || element.disabled) return;
      if (kind === 'fire' && excludedTarget(event.target)) return;
      if (kind === 'joystick' && (this.owner.mode !== 'joystick' || this.joystickId !== null)) return;
      if (this.contacts.has(event.pointerId)) return;
      event.preventDefault();
      if (kind !== 'fire' && typeof event.stopPropagation === 'function') event.stopPropagation();
      if (kind === 'fire' && this.fireCount() === 0) this.fireGroupSampled = false;
      const contact = { kind: kind, element: element };
      this.contacts.set(event.pointerId, contact);
      if (typeof element.setPointerCapture === 'function') {
        try { element.setPointerCapture(event.pointerId); } catch (_) { /* Detached or already-cancelled contact. */ }
      }
      if (kind === 'joystick') {
        this.joystickId = event.pointerId;
        this.move(event);
      } else if (kind !== 'fire') {
        this.owner.queueAction(kind);
        if (element.classList) element.classList.add('pressed');
      }
    }
    move(event) {
      const contact = this.contacts.get(event.pointerId);
      if (!contact) return;
      event.preventDefault();
      if (contact.kind !== 'joystick') return;
      const rect = this.joystick.getBoundingClientRect();
      const radius = Math.max(1, this.owner.config.joystickRadius);
      this.axis = normalized((event.clientX - rect.left - rect.width / 2) / radius, (event.clientY - rect.top - rect.height / 2) / radius);
      this.drawStick();
    }
    end(event, cancelled) {
      const contact = this.contacts.get(event.pointerId);
      if (!contact) return;
      event.preventDefault();
      this.contacts.delete(event.pointerId);
      if (contact.kind === 'joystick') {
        this.joystickId = null;
        this.axis = { x: 0, y: 0 };
        this.drawStick();
      } else if (contact.kind === 'fire') {
        if (cancelled) {
          this.owner.fireTap = false;
          this.owner.callbacks.onCancel();
        } else if (this.fireCount() === 0 && !this.fireGroupSampled) this.owner.fireTap = true;
      }
      const stillPressed = Array.from(this.contacts.values()).some(other => other.element === contact.element);
      if (!stillPressed && contact.element.classList) contact.element.classList.remove('pressed');
      if (typeof contact.element.releasePointerCapture === 'function') {
        try { contact.element.releasePointerCapture(event.pointerId); } catch (_) { /* Capture may already have ended. */ }
      }
    }
    drawStick() {
      if (!this.stick || !this.stick.style) return;
      const radius = this.owner.config.joystickRadius;
      this.stick.style.setProperty('--stick-x', (this.axis.x * radius).toFixed(2) + 'px');
      this.stick.style.setProperty('--stick-y', (this.axis.y * radius).toFixed(2) + 'px');
    }
    sample() {
      const fire = this.fireCount() > 0;
      if (fire) this.fireGroupSampled = true;
      return { fire: fire, x: this.axis.x, y: this.axis.y };
    }
    clear() {
      const contacts = Array.from(this.contacts.entries());
      this.contacts.clear();
      contacts.forEach(([id, contact]) => {
        if (contact.element.classList) contact.element.classList.remove('pressed');
        if (typeof contact.element.releasePointerCapture === 'function') {
          try { contact.element.releasePointerCapture(id); } catch (_) { /* No capture to release. */ }
        }
      });
      this.joystickId = null;
      this.axis = { x: 0, y: 0 };
      this.fireGroupSampled = false;
      this.drawStick();
    }
  }

  class MotionInput {
    constructor(owner) {
      this.owner = owner;
      this.listening = false;
      this.latest = null;
      this.neutral = null;
      this.axis = { x: 0, y: 0 };
      this.calibration = null;
      this.angle = orientationAngle(owner.environment);
      this.onReading = event => this.read(event);
      owner.listen(owner.environment, 'orientationchange', () => this.rotated());
      const orientation = owner.environment.screen && owner.environment.screen.orientation;
      owner.listen(orientation, 'change', () => this.rotated());
    }
    rotated() {
      const angle = orientationAngle(this.owner.environment);
      if (angle === this.angle) return;
      this.angle = angle;
      this.latest = null;
      this.owner.invalidateCalibration();
      this.owner.callbacks.onOrientationChange(angle);
    }
    read(event) {
      if (this.owner.destroyed || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      this.rotated();
      const value = screenTilt(event.beta, event.gamma, this.angle);
      this.latest = { x: value.x, y: value.y, at: this.owner.now() };
      if (this.calibration) {
        this.calibration.samples.push(this.latest);
        if (this.calibration.samples.length > 180) this.calibration.samples.shift();
      }
    }
    start() {
      if (this.listening) return;
      this.owner.listen(this.owner.environment, 'deviceorientation', this.onReading);
      this.listening = true;
    }
    cancelCalibration() {
      const calibration = this.calibration;
      if (!calibration) return;
      this.calibration = null;
      this.owner.cancelTimer(calibration.timer);
      calibration.resolve(false);
    }
    calibrate() {
      this.cancelCalibration();
      const owner = this.owner, config = owner.config;
      this.neutral = null;
      this.axis = { x: 0, y: 0 };
      owner.needsCalibration = true;
      owner.tiltStatus = 'calibrating';
      owner.changed();
      return new Promise(resolve => {
        const started = owner.now();
        const calibration = { resolve: resolve, timer: null, samples: [] };
        if (this.latest && started - this.latest.at <= config.sensorTimeout * 1000) calibration.samples.push(this.latest);
        this.calibration = calibration;
        const check = () => {
          if (this.calibration !== calibration || owner.destroyed) return;
          const elapsed = (owner.now() - started) / 1000;
          const fresh = this.latest && owner.now() - this.latest.at <= config.sensorTimeout * 1000;
          if (elapsed >= config.calibrationDuration && fresh && calibration.samples.length) {
            const values = calibration.samples;
            this.neutral = values.reduce((sum, value) => ({ x: sum.x + value.x / values.length, y: sum.y + value.y / values.length }), { x: 0, y: 0 });
            this.calibration = null;
            owner.needsCalibration = false;
            owner.tiltStatus = 'ready';
            owner.changed();
            resolve(true);
          } else if (elapsed >= config.calibrationTimeout) {
            this.calibration = null;
            owner.unavailable('Tilt readings are unavailable. Use the joystick.');
            resolve(false);
          } else calibration.timer = owner.schedule(check, 40);
        };
        calibration.timer = owner.schedule(check, 40);
      });
    }
    sample(dt) {
      const owner = this.owner, config = owner.config;
      if (owner.mode !== 'tilt' || owner.needsCalibration || !this.neutral || !this.latest) return { x: 0, y: 0 };
      if (owner.isPlaying() && owner.now() - this.latest.at > config.sensorTimeout * 1000) {
        owner.callbacks.onPause('Flight paused because tilt readings stopped.');
        owner.unavailable('Tilt readings stopped. Joystick controls are available.');
        return { x: 0, y: 0 };
      }
      const axis = delta => Math.sign(delta) * clamp((Math.abs(delta) - config.tiltDeadZone) / Math.max(1, config.tiltFullAngle - config.tiltDeadZone), 0, 1);
      const target = normalized(axis(this.latest.x - this.neutral.x), axis(this.latest.y - this.neutral.y));
      const smoothing = config.tiltSmoothing;
      const amount = smoothing > 0 ? 1 - Math.exp(-Math.max(0, dt || 0) / smoothing) : 1;
      this.axis.x += (target.x - this.axis.x) * amount;
      this.axis.y += (target.y - this.axis.y) * amount;
      return this.axis;
    }
    clear() { this.axis = { x: 0, y: 0 }; }
  }

  class Controls {
    constructor(options) {
      options = options || {};
      this.environment = options.environment || root;
      this.document = options.document || this.environment.document;
      this.now = options.now || (() => this.environment.performance && this.environment.performance.now ? this.environment.performance.now() : Date.now());
      this.config = Object.assign({}, defaults, LG.Config && LG.Config.controls, options.config);
      this.callbacks = {};
      ['onPause', 'onCancel', 'onChange', 'onUnavailable', 'onOrientationChange'].forEach(name => { this.callbacks[name] = typeof options[name] === 'function' ? options[name] : () => {}; });
      this.isPlaying = typeof options.isPlaying === 'function' ? options.isPlaying : () => false;
      this.listeners = [];
      this.timers = new Set();
      this.destroyed = false;
      this.tiltRequest = 0;
      this.cycle = false;
      this.detonate = false;
      this.fireTap = false;
      this.needsCalibration = true;
      this.tiltStatus = 'inactive';
      const coarse = this.environment.matchMedia && this.environment.matchMedia('(any-pointer: coarse)').matches;
      this.mode = options.mode || (coarse || this.environment.navigator && this.environment.navigator.maxTouchPoints > 0 ? 'joystick' : 'keyboard');
      this.keyboard = new KeyboardInput(this);
      this.pointer = new PointerInput(this, options);
      this.motion = new MotionInput(this);
      this.changed();
    }
    listen(target, name, callback) {
      if (!target || typeof target.addEventListener !== 'function') return;
      const options = { passive: false };
      target.addEventListener(name, callback, options);
      this.listeners.push(() => target.removeEventListener(name, callback, options));
    }
    schedule(callback, milliseconds) {
      let timer;
      timer = this.environment.setTimeout(() => { this.timers.delete(timer); callback(); }, milliseconds);
      this.timers.add(timer);
      return timer;
    }
    cancelTimer(timer) {
      if (timer == null) return;
      this.environment.clearTimeout(timer);
      this.timers.delete(timer);
    }
    changed() { this.callbacks.onChange(this.mode, this.tiltStatus); }
    queueAction(action) {
      if (this.destroyed || !this.isPlaying()) return;
      if (action === 'cycle') this.cycle = true;
      else if (action === 'detonate') this.detonate = true;
    }
    setMode(mode) {
      if (!['keyboard', 'joystick', 'tilt'].includes(mode)) throw new Error('Unknown control mode: ' + mode);
      if (this.destroyed) return;
      // An explicit control choice also cancels a permission request, even
      // when the selected mode is already active while that request is open.
      ++this.tiltRequest;
      const cancelledRequest = this.tiltStatus === 'requesting';
      if (cancelledRequest) this.tiltStatus = 'inactive';
      if (this.mode === mode) {
        if (cancelledRequest) this.changed();
        return;
      }
      this.clear(true);
      this.mode = mode;
      if (mode !== 'tilt') this.motion.cancelCalibration();
      this.changed();
    }
    unavailable(message) {
      this.invalidateCalibration();
      this.tiltStatus = 'unavailable';
      this.setMode('joystick');
      this.changed();
      this.callbacks.onUnavailable(message);
    }
    async enableTilt() {
      if (this.destroyed) return false;
      const request = ++this.tiltRequest;
      const current = () => !this.destroyed && request === this.tiltRequest;
      const environment = this.environment, sensor = environment.DeviceOrientationEvent;
      if (environment.isSecureContext === false || !sensor) {
        this.unavailable('Tilt requires supported motion sensors and a secure connection. Use the joystick.');
        return false;
      }
      this.tiltStatus = 'requesting';
      this.changed();
      let permission = 'granted';
      try {
        // This invocation occurs synchronously inside the enabling tap, before
        // the first await, as required by iOS permission handling.
        if (typeof sensor.requestPermission === 'function') permission = await sensor.requestPermission();
      } catch (_) {
        if (!current()) return false;
        this.unavailable('Tilt permission could not be enabled. Use the joystick.');
        return false;
      }
      if (!current()) return false;
      if (permission !== 'granted') {
        this.unavailable('Tilt permission was not granted. Use the joystick.');
        return false;
      }
      this.motion.start();
      this.setMode('tilt');
      return this.calibrate();
    }
    calibrate() {
      if (this.destroyed || !this.motion.listening) return Promise.resolve(false);
      this.clear(true);
      return this.motion.calibrate();
    }
    invalidateCalibration() {
      ++this.tiltRequest;
      this.motion.cancelCalibration();
      this.motion.neutral = null;
      this.needsCalibration = true;
      if (this.tiltStatus === 'requesting') this.tiltStatus = 'inactive';
      if (this.tiltStatus === 'ready' || this.tiltStatus === 'calibrating') this.tiltStatus = 'calibration-needed';
      this.clear(true);
      this.changed();
    }
    sample(dt) {
      // A stale sensor can pause and clear input, so inspect it before reading
      // keyboard/pointer contacts for this frame.
      const tilt = this.motion.sample(dt), keyboard = this.keyboard.sample(), pointer = this.pointer.sample();
      const axis = this.mode === 'tilt' ? tilt : this.mode === 'joystick' ? pointer : { x: 0, y: 0 };
      const result = {
        left: keyboard.left, right: keyboard.right, up: keyboard.up, down: keyboard.down,
        moveX: axis.x, moveY: axis.y,
        fire: keyboard.fire || pointer.fire,
        fireTap: this.fireTap && !keyboard.fire && !pointer.fire,
        cycle: this.cycle ? 1 : false, detonate: this.detonate
      };
      this.fireTap = false;
      this.cycle = false;
      this.detonate = false;
      return result;
    }
    clear(cancelCharge) {
      this.keyboard.clear();
      this.pointer.clear();
      this.motion.clear();
      this.fireTap = false;
      this.cycle = false;
      this.detonate = false;
      if (cancelCharge !== false) this.callbacks.onCancel();
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.clear(true);
      this.motion.cancelCalibration();
      this.listeners.splice(0).forEach(remove => remove());
      this.timers.forEach(timer => this.environment.clearTimeout(timer));
      this.timers.clear();
    }
  }
  Controls.defaults = defaults;
  Controls.screenTilt = screenTilt;
  LG.Controls = Controls;
})(typeof globalThis !== 'undefined' ? globalThis : window);
