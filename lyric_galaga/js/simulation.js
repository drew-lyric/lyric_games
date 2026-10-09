(function (root) {
  'use strict';
  const LG = root.LyricGalaga = root.LyricGalaga || {};
  const EPS = 1e-8;
  const clamp = LG.clamp;
  function playerBand(config) {
    const maxY = clamp(config.height - config.player.bottom, config.player.radius + 12, config.height - config.player.radius - 12);
    const minY = Math.max(config.player.radius + 12, maxY - config.height * clamp(config.player.verticalRangeFraction, 0, 1));
    return { minY: minY, maxY: maxY, startY: (minY + maxY) / 2 };
  }
  function merge(base, extra) {
    const result = {};
    Object.keys(base).forEach(function (key) {
      const value = base[key];
      result[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(value, extra && extra[key]) : Array.isArray(value) ? value.slice() : value;
    });
    Object.keys(extra || {}).forEach(function (key) {
      if (!base[key] || typeof base[key] !== 'object' || Array.isArray(base[key])) result[key] = extra[key];
    });
    return result;
  }
  function hit(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius; }
  // Earliest intersection of a swept projectile and a moving circle. Relative
  // motion avoids tunneling even when both objects cross between frames.
  function sweep(shot, target, radius) {
    const x = shot.previousX - (target.previousX === undefined ? target.x : target.previousX);
    const y = shot.previousY - (target.previousY === undefined ? target.y : target.previousY);
    const dx = shot.x - target.x - x, dy = shot.y - target.y - y;
    const r = shot.radius + radius, c = x * x + y * y - r * r;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy;
    if (a < EPS) return null;
    const b = 2 * (x * dx + y * dy), discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }
  LG.Game = function (options) {
    this.options = options || {};
    this.config = merge(LG.Config, this.options.config);
    this.levels = this.options.levels || LG.Levels;
    this.seed = this.options.seed === undefined ? 1 : this.options.seed;
    this._antigenResponse = this.options.antigenResponse === undefined ? !!this.config.antigenResponse : !!this.options.antigenResponse;
    this._reset();
  };
  LG.Game.prototype._reset = function () {
    const c = this.config;
    this.random = LG.makeRandom(this.seed);
    this.state = {
      status: 'ready', time: 0, level: 1, wave: 0, stageTime: 0, spawnTime: 0, intermission: 0,
      title: this.levels[0].title, unlocked: ['green'], weapon: 'green', opsonins: 0,
      antigenResponse: this._antigenResponse, ivigRemaining: 0,
      score: 0, lives: c.lives,
      player: { x: c.width / 2, y: playerBand(c).startY, radius: c.player.radius, invulnerable: 0, cooldown: 0 },
      charge: null, antigens: [], shots: [], enemyShots: [], pickups: [], orbs: [], macrophages: [], boss: null
    };
    this._events = [];
    this._entityId = 0;
    this._eventId = 0;
    this._activationId = 0;
    this._accumulator = 0;
    this._input = { left: false, right: false, up: false, down: false, fire: false, cycle: false, detonate: false };
    this._previousFire = false;
    this._requireFireRelease = false;
    this._lastAntibody = 'green';
    this._activeTime = 0;
    this._nextPickup = c.opsonin.firstPickup;
    this._nextIVIG = c.ivig.firstPickup;
    this._pendingLevel = null;
  };
  LG.Game.prototype._event = function (type, data) {
    const event = Object.assign({ type: type, id: ++this._eventId, time: this.state.time }, data || {});
    this._events.push(event);
    if (this._events.length > this.config.eventLimit) this._events.splice(0, this._events.length - this.config.eventLimit);
    return event;
  };
  LG.Game.prototype.drainEvents = function () { return this._events.splice(0); };
  LG.Game.prototype.start = function () {
    if (this.state.status !== 'ready') return false;
    this.state.status = 'playing';
    this._enterLevel(1);
    return true;
  };
  LG.Game.prototype.restart = function (seed) {
    if (seed !== undefined) this.seed = seed;
    this._reset();
    this.start();
    return this;
  };
  LG.Game.prototype.setAntigenResponse = function (enabled) {
    this._antigenResponse = !!enabled;
    this.state.antigenResponse = this._antigenResponse;
    if (!this._antigenResponse) this.state.enemyShots = [];
    return this._antigenResponse;
  };
  LG.Game.prototype._spawnRate = function () {
    return this.state.antigenResponse ? 1 : this.config.passiveSpawnRate;
  };
  LG.Game.prototype.pause = function () {
    if (this.state.status !== 'playing' && this.state.status !== 'intermission') return false;
    this._pausedStatus = this.state.status;
    this.state.status = 'paused';
    this.cancelCharge();
    this._accumulator = 0;
    this._event('pause');
    return true;
  };
  LG.Game.prototype.resume = function () {
    if (this.state.status !== 'paused') return false;
    this.state.status = this._pausedStatus || 'playing';
    this._input.cycle = this._input.detonate = false;
    this._event('resume');
    return true;
  };
  LG.Game.prototype.cancelCharge = function () {
    this.state.charge = null;
    this._requireFireRelease = true;
  };
  LG.Game.prototype.cycleWeapon = function (direction) {
    if (this.state.status !== 'playing') return;
    const choices = this.state.unlocked.slice();
    if (this.state.opsonins > 0) choices.push('white');
    const current = choices.indexOf(this.state.weapon);
    this.cancelCharge();
    const offset = direction < 0 ? -1 : 1;
    this.state.weapon = choices[(current + offset + choices.length) % choices.length];
    if (this.state.weapon !== 'white') this._lastAntibody = this.state.weapon;
    this._event('weapon', { weapon: this.state.weapon, color: this.state.weapon });
  };
  LG.Game.prototype.activateOps = function () {
    if (this.state.status !== 'playing') return 0;
    const settled = this.state.orbs.filter(function (orb) { return orb.status === 'settled'; });
    if (!settled.length) return 0;
    const c = this.config, activation = ++this._activationId;
    const radius = Math.sqrt(c.opsonin.areaFraction * c.width * c.height / Math.PI);
    settled.forEach(function (orb) {
      const macrophage = { id: ++this._entityId, x: orb.x, y: orb.y, radius: radius, color: 'white', remaining: c.opsonin.windup, phase: 'windup', activationId: activation };
      this.state.macrophages.push(macrophage);
      this._event('macrophage', { x: orb.x, y: orb.y, radius: radius, color: 'white', activationId: activation });
    }, this);
    this.state.orbs = this.state.orbs.filter(function (orb) { return orb.status !== 'settled'; });
    return settled.length;
  };
  LG.Game.prototype.step = function (dt, input) {
    if (!Number.isFinite(dt) || dt <= 0 || !['playing', 'intermission'].includes(this.state.status)) return;
    input = input || {};
    this._input.left = !!input.left;
    this._input.right = !!input.right;
    this._input.up = !!input.up;
    this._input.down = !!input.down;
    this._input.fire = !!input.fire;
    if (input.cycle) this._input.cycle = input.cycle < 0 ? -1 : 1;
    this._input.detonate = this._input.detonate || !!input.detonate;
    this._accumulator += Math.min(dt, this.config.maxFrame);
    while (this._accumulator + EPS >= this.config.step && ['playing', 'intermission'].includes(this.state.status)) {
      this._accumulator -= this.config.step;
      this._fixedStep(this.config.step, this._input);
      this._input.cycle = this._input.detonate = false;
    }
  };
  LG.Game.prototype._clearTransients = function () {
    const s = this.state;
    s.antigens = []; s.shots = []; s.enemyShots = []; s.pickups = []; s.orbs = []; s.macrophages = [];
    s.boss = null;
    this.cancelCharge();
    s.player.cooldown = 0;
  };
  LG.Game.prototype._enterLevel = function (number) {
    const s = this.state, c = this.config;
    this._clearTransients();
    s.level = number; s.wave = 0; s.stageTime = 0; s.spawnTime = 0; s.intermission = 0;
    s.status = 'playing';
    s.unlocked = LG.Colors.filter(function (color) { return color.unlock <= number; }).map(function (color) { return color.id; });
    s.player.x = c.width / 2; s.player.y = playerBand(c).startY;
    s.player.invulnerable = Math.max(s.player.invulnerable, 1);
    if (number > this.levels.length) {
      s.title = 'Final Round';
      s.boss = {
        id: ++this._entityId, x: c.width / 2, y: c.boss.y, radius: c.boss.radius, coreRadius: c.boss.coreRadius,
        health: c.boss.health, maxHealth: c.boss.health, color: c.boss.colorOrder[0], nextColor: null,
        telegraph: 0, phase: 1, age: 0, colorAge: 0, shotTimer: 1.5,
        summonTimer: c.boss.summonInterval, attackCount: 0
      };
      this._event('boss', { x: s.boss.x, y: s.boss.y, color: s.boss.color });
    } else s.title = this.levels[number - 1].title;
    this._event('level', { level: number, title: s.title, unlocked: s.unlocked.slice() });
  };
  LG.Game.prototype._fixedStep = function (dt, input) {
    const s = this.state;
    s.time += dt;
    if (s.status === 'intermission') {
      this.cancelCharge();
      this._previousFire = input.fire;
      if (!input.fire) this._requireFireRelease = false;
      s.intermission -= dt;
      if (s.intermission <= EPS) this._enterLevel(this._pendingLevel);
      return;
    }
    s.stageTime += dt;
    s.spawnTime += dt * this._spawnRate();
    s.ivigRemaining = Math.max(0, s.ivigRemaining - dt);
    if (s.ivigRemaining <= EPS) s.ivigRemaining = 0;
    this._activeTime += dt;
    this._updatePlayer(dt, input);
    if (input.cycle) this.cycleWeapon(input.cycle);
    if (input.detonate) this.activateOps();
    this._updateFiring(dt, input.fire);
    this._spawnWaves();
    this._updateAntigens(dt);
    this._updateBoss(dt);
    // Move pickups before testing relative sweeps against the current shot tick.
    this._updatePickups(dt);
    this._updateShots(dt);
    if (s.status !== 'playing') return;
    this._updateOrbs(dt);
    this._updateMacrophages(dt);
    if (s.status !== 'playing') return;
    this._updateEnemyShots(dt);
    this._checkPlayerCollisions();
    s.antigens = s.antigens.filter(function (enemy) { return !enemy.dead; });
    s.shots = s.shots.filter(function (shot) { return !shot.dead && shot.y > -30 && shot.x > -30 && shot.x < this.config.width + 30; }, this);
    s.enemyShots = s.enemyShots.filter(function (shot) { return !shot.dead && shot.y < this.config.height + 35 && shot.y > -40 && shot.x > -40 && shot.x < this.config.width + 40; }, this);
    s.pickups = s.pickups.filter(function (pickup) {
      return !pickup.dead && (pickup.kind === 'ivig' ? pickup.age + EPS < pickup.lifetime && pickup.x > -40 && pickup.x < this.config.width + 40 : pickup.y < this.config.height + 30);
    }, this);
    this._checkLevelCompletion();
  };
  LG.Game.prototype._updatePlayer = function (dt, input) {
    const p = this.state.player, c = this.config;
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0), dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const distance = c.player.speed * dt / (Math.hypot(dx, dy) || 1), band = playerBand(c);
    p.previousX = p.x; p.previousY = p.y;
    p.x = clamp(p.x + dx * distance, p.radius + 12, c.width - p.radius - 12);
    p.y = clamp(p.y + dy * distance, band.minY, band.maxY);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
  };
  LG.Game.prototype._updateFiring = function (dt, fire) {
    const s = this.state, c = this.config, p = s.player;
    if (!fire) this._requireFireRelease = false;
    if (s.weapon === 'white' && s.opsonins <= 0) {
      s.weapon = this._lastAntibody;
      this.cancelCharge();
    }
    if (s.weapon === 'white') {
      if (fire && !this._previousFire && !this._requireFireRelease && s.opsonins > 0) s.charge = { time: 0, power: 0 };
      if (s.charge && fire) {
        s.charge.time += dt;
        const cycle = (s.charge.time % c.opsonin.chargePeriod) / c.opsonin.chargePeriod;
        s.charge.power = cycle < 0.5 ? cycle * 2 : 2 - cycle * 2;
      }
      if (s.charge && !fire && this._previousFire) {
        const power = s.charge.power, speed = c.opsonin.minSpeed + power * (c.opsonin.maxSpeed - c.opsonin.minSpeed);
        const orb = { id: ++this._entityId, x: p.x, y: p.y - 25, radius: c.opsonin.radius, color: 'white', status: 'flying', speed: speed, power: power };
        s.orbs.push(orb); s.opsonins -= 1; s.charge = null;
        this._event('orb-launch', { x: orb.x, y: orb.y, color: 'white', power: power });
        if (s.opsonins === 0) {
          s.weapon = this._lastAntibody;
          this._event('weapon', { weapon: s.weapon, color: s.weapon });
        }
      }
    } else if (fire && p.cooldown <= EPS) {
      const boosted = s.ivigRemaining > EPS;
      const colors = boosted ? LG.Colors.map(function (color) { return color.id; }) : [s.weapon];
      [-1, 1].forEach(function (side) {
        colors.forEach(function (color, index) {
          const projectile = { id: ++this._entityId, x: p.x + side * c.player.muzzle, y: p.y - 26, previousX: p.x + side * c.player.muzzle, previousY: p.y - 26, radius: c.antibody.radius, color: color, speed: c.antibody.speed, damage: c.antibody.damage };
          if (boosted) {
            const angle = side * (c.ivig.sprayAngles[index] || 0);
            projectile.vx = Math.sin(angle) * c.antibody.speed;
            projectile.vy = -Math.cos(angle) * c.antibody.speed;
          }
          s.shots.push(projectile);
        }, this);
      }, this);
      p.cooldown = c.player.fireInterval;
      this._event('fire', { x: p.x, y: p.y - 26, color: boosted ? 'rainbow' : s.weapon, ivig: boosted });
    }
    this._previousFire = fire;
  };
  LG.Game.prototype._spawnWaves = function () {
    const s = this.state, level = this.levels[s.level - 1];
    if (!level) return;
    while (s.wave < level.waves.length && s.spawnTime + EPS >= level.waves[s.wave].at) {
      const wave = level.waves[s.wave];
      this._spawnWave(wave, level.speed || 1);
      s.wave += 1;
      this._event('wave', { wave: s.wave, level: s.level });
    }
  };
  LG.Game.prototype._spawnWave = function (wave, speed) {
    const columns = Math.min(wave.count, 8), spacing = Math.min(94, (this.config.width - 220) / Math.max(1, columns - 1));
    for (let i = 0; i < wave.count; i += 1) {
      const row = Math.floor(i / columns), column = i % columns;
      const homeX = this.config.width / 2 + (column - (columns - 1) / 2) * spacing;
      const homeY = 100 + row * 65 + (this.state.wave % 2) * 24;
      this._spawnAntigen(wave.colors[i % wave.colors.length], wave.patterns[i % wave.patterns.length], {
        homeX: homeX, homeY: homeY, x: homeX, y: -38 - row * 55 - column * 8,
        speed: speed, delay: column * 0.28 + row * 0.75, health: wave.health
      });
    }
  };
  LG.Game.prototype._spawnAntigen = function (color, pattern, options) {
    options = options || {};
    const def = LG.Antigens[color], c = this.config;
    if (!def || !LG.Patterns[pattern]) throw new Error('Unknown antigen color or flight pattern: ' + color + '/' + pattern);
    const enemy = {
      id: ++this._entityId, x: options.x === undefined ? c.width / 2 : options.x, y: options.y === undefined ? -30 : options.y,
      radius: def.radius, color: color, sprite: def.sprite, shape: def.shape,
      health: options.health || def.health, score: def.score, pattern: pattern,
      homeX: options.homeX === undefined ? c.width / 2 : options.homeX, homeY: options.homeY || 120,
      speed: options.speed || 1, age: 0, entry: true, diveAge: 0,
      phase: this.random() * Math.PI * 2, direction: this.random() < 0.5 ? -1 : 1,
      delay: options.delay || 0, hold: 3.5 + this.random() * 3,
      shotTimer: 2.5 + this.random() * c.enemy.shotJitter,
      loops: 0
    };
    enemy.entryY = enemy.y;
    this.state.antigens.push(enemy);
    return enemy;
  };
  LG.Game.prototype._updateAntigens = function (dt) {
    const c = this.config, s = this.state;
    s.antigens.forEach(function (enemy) {
      if (enemy.dead) return;
      enemy.previousX = enemy.x; enemy.previousY = enemy.y;
      enemy.age += dt * enemy.speed;
      if (enemy.age < enemy.delay) return;
      const age = enemy.age - enemy.delay;
      if (enemy.entry) {
        const progress = clamp(age / 2.1, 0, 1);
        enemy.x = enemy.homeX + Math.sin(progress * Math.PI) * 48 * enemy.direction;
        enemy.y = enemy.entryY + (enemy.homeY - enemy.entryY) * (1 - Math.pow(1 - progress, 2));
        if (progress >= 1) enemy.entry = false;
      } else if (age < 2.1 + enemy.hold) {
        enemy.x = enemy.homeX + Math.sin(s.time * 1.4 + enemy.phase) * 16;
        enemy.y = enemy.homeY + Math.cos(s.time * 1.8 + enemy.phase) * 6;
      } else {
        enemy.diveAge += dt * enemy.speed;
        const point = LG.Patterns[enemy.pattern](enemy, enemy.diveAge, c);
        enemy.x = clamp(point.x, 22, c.width - 22); enemy.y = point.y;
        if (enemy.y > c.height + 45) {
          enemy.y = -35; enemy.entryY = -35; enemy.age = 0; enemy.delay = 0;
          enemy.entry = true; enemy.diveAge = 0; enemy.loops += 1;
          enemy.previousX = enemy.x; enemy.previousY = enemy.y;
        }
      }
      enemy.shotTimer -= dt;
      if (enemy.shotTimer <= 0 && enemy.y > 30 && enemy.y < c.height - 130) {
        const dx = s.player.x - enemy.x, dy = s.player.y - enemy.y, length = Math.hypot(dx, dy) || 1;
        const speed = c.enemy.shotSpeed + (s.level - 1) * 10;
        this._enemyShot(enemy.x, enemy.y, dx / length * speed, dy / length * speed, enemy.color);
        enemy.shotTimer = Math.max(3.2, c.enemy.shotInterval - (s.level - 1) * 0.38) + this.random() * c.enemy.shotJitter;
      }
    }, this);
  };
  LG.Game.prototype._enemyShot = function (x, y, vx, vy, color) {
    if (!this.state.antigenResponse) return;
    this.state.enemyShots.push({ id: ++this._entityId, x: x, y: y, previousX: x, previousY: y, vx: vx, vy: vy, radius: this.config.enemy.shotRadius, color: color });
  };
  LG.Game.prototype._updateBoss = function (dt) {
    const boss = this.state.boss, c = this.config;
    if (!boss) return;
    boss.previousX = boss.x; boss.previousY = boss.y;
    boss.age += dt; boss.colorAge += dt;
    const factor = c.boss.phaseSpeed[boss.phase - 1] || 1;
    const mode = LG.BossModes[boss.color];
    const point = LG.BossMovements[mode.movement](boss.age * factor, c);
    boss.x += (point.x - boss.x) * Math.min(1, dt * 5);
    boss.y += (point.y - boss.y) * Math.min(1, dt * 5);
    if (!boss.nextColor && boss.colorAge >= c.boss.colorDuration - c.boss.telegraph) {
      const index = c.boss.colorOrder.indexOf(boss.color);
      boss.nextColor = c.boss.colorOrder[(index + 1) % c.boss.colorOrder.length];
      this._event('boss-warning', { nextColor: boss.nextColor, x: boss.x, y: boss.y });
    }
    boss.telegraph = boss.nextColor ? Math.max(0, c.boss.colorDuration - boss.colorAge) : 0;
    if (boss.colorAge >= c.boss.colorDuration) {
      boss.color = boss.nextColor || c.boss.colorOrder[0]; boss.colorAge = 0; boss.nextColor = null; boss.telegraph = 0;
      boss.shotTimer = Math.max(boss.shotTimer, 0.4);
      this._event('boss-color', { x: boss.x, y: boss.y, color: boss.color });
    }
    const currentMode = LG.BossModes[boss.color];
    boss.shotTimer -= dt;
    if (boss.shotTimer <= 0) {
      LG.BossAttacks[currentMode.attack](boss, this.state.player, c).forEach(function (shot) {
        this._enemyShot(shot.x, shot.y, shot.dx * currentMode.shotSpeed * factor, shot.dy * currentMode.shotSpeed * factor, boss.color);
      }, this);
      boss.attackCount += 1;
      boss.shotTimer = currentMode.interval / factor;
    }
    boss.summonTimer -= dt * this._spawnRate();
    if (boss.summonTimer <= EPS) {
      this._spawnWave({ count: c.boss.summonCount + boss.phase - 1, colors: [boss.color], patterns: [currentMode.summon] }, factor);
      boss.summonTimer = c.boss.summonInterval / factor;
      this._event('boss-summon', { color: boss.color, x: boss.x, y: boss.y });
    }
  };
  LG.Game.prototype._updateBossPhase = function () {
    const boss = this.state.boss, thresholds = this.config.boss.phases;
    if (!boss) return;
    let phase = 1;
    for (let i = 1; i < thresholds.length; i += 1) if (boss.health / boss.maxHealth <= thresholds[i]) phase = i + 1;
    if (phase !== boss.phase) {
      boss.phase = phase;
      this._event('boss-phase', { x: boss.x, y: boss.y, color: boss.color, phase: phase });
    }
  };
  LG.Game.prototype._damageBoss = function (damage) {
    const boss = this.state.boss;
    if (!boss || this.state.status !== 'playing') return;
    boss.health = Math.max(0, boss.health - damage);
    this._event('boss-hit', { x: boss.x, y: boss.y, color: boss.color, damage: damage });
    if (boss.health <= 0) {
      this.state.score += this.config.boss.score;
      this.state.status = 'victory'; this.cancelCharge();
      this._event('destroy', { x: boss.x, y: boss.y, radius: boss.radius, color: boss.color, source: 'boss' });
      this._event('victory', { score: this.state.score });
      this.state.antigens = []; this.state.enemyShots = []; this.state.shots = []; this.state.orbs = []; this.state.macrophages = [];
    } else this._updateBossPhase();
  };
  LG.Game.prototype._destroyAntigen = function (enemy, source) {
    if (enemy.dead) return;
    enemy.dead = true;
    this.state.score += enemy.score;
    this._event('bind', { x: enemy.x, y: enemy.y, radius: enemy.radius, color: enemy.color, source: source });
    this._event('destroy', { x: enemy.x, y: enemy.y, radius: enemy.radius, color: enemy.color, source: source });
  };
  LG.Game.prototype._updateShots = function (dt) {
    const s = this.state;
    for (const shot of s.shots) {
      if (shot.dead) continue;
      shot.previousX = shot.x; shot.previousY = shot.y;
      shot.x += (shot.vx || 0) * dt;
      shot.y += (shot.vy === undefined ? -shot.speed : shot.vy) * dt;
      let target = null, first = Infinity, kind = '';
      s.antigens.forEach(function (enemy) {
        if (enemy.dead) return;
        const t = sweep(shot, enemy, enemy.radius);
        if (t !== null && t < first) { first = t; target = enemy; kind = 'antigen'; }
      });
      s.pickups.forEach(function (pickup) {
        if (pickup.dead) return;
        const t = sweep(shot, pickup, pickup.radius);
        if (t !== null && t < first) { first = t; target = pickup; kind = 'pickup'; }
      });
      if (s.boss) {
        const t = sweep(shot, s.boss, s.boss.coreRadius);
        if (t !== null && t < first) { first = t; target = s.boss; kind = 'boss'; }
      }
      if (!target) continue;
      shot.dead = true;
      if (kind === 'pickup') {
        target.dead = true;
        if (target.kind === 'ivig') {
          s.ivigRemaining = this.config.ivig.duration;
          if (s.weapon === 'white') {
            this.cancelCharge(); s.weapon = this._lastAntibody;
            this._event('weapon', { weapon: s.weapon, color: s.weapon });
          }
          this._event('ivig', { x: target.x, y: target.y, color: 'rainbow', duration: s.ivigRemaining });
        } else {
          s.opsonins += 1;
          this._event('pickup', { x: target.x, y: target.y, color: 'white', stock: s.opsonins });
        }
      } else if (shot.color !== target.color) {
        this._event('mismatch', { x: target.x, y: target.y, color: shot.color, targetColor: target.color });
      } else if (kind === 'boss') {
        this._damageBoss(shot.damage);
        if (s.status === 'victory') return;
      } else {
        target.health -= shot.damage;
        if (target.health <= 0) this._destroyAntigen(target, 'antibody');
      }
    }
  };
  LG.Game.prototype._updateOrbs = function (dt) {
    const c = this.config;
    this.state.orbs.forEach(function (orb) {
      if (orb.status !== 'flying') return;
      const nextSpeed = Math.max(0, orb.speed - c.opsonin.deceleration * dt);
      orb.y -= (orb.speed + nextSpeed) / 2 * dt;
      orb.speed = nextSpeed;
      if (orb.speed <= c.opsonin.stopSpeed || orb.y <= orb.radius + 12) {
        orb.y = Math.max(orb.radius + 12, orb.y); orb.speed = 0; orb.status = 'settled';
        this._event('orb-settle', { x: orb.x, y: orb.y, color: 'white' });
      }
    }, this);
  };
  LG.Game.prototype._updateMacrophages = function (dt) {
    const s = this.state, c = this.config, due = [];
    s.macrophages.forEach(function (cell) {
      cell.remaining -= dt;
      if (cell.phase === 'windup' && cell.remaining <= EPS) due.push(cell);
    });
    const activations = new Map();
    due.forEach(function (cell) {
      const group = activations.get(cell.activationId) || [];
      group.push(cell); activations.set(cell.activationId, group);
      cell.phase = 'engulf'; cell.remaining = c.opsonin.aftermath;
      this._event('engulf', { x: cell.x, y: cell.y, radius: cell.radius, color: 'white', activationId: cell.activationId });
    }, this);
    for (const group of activations.values()) {
      s.antigens.forEach(function (enemy) {
        if (!enemy.dead && group.some(function (cell) { return Math.hypot(enemy.x - cell.x, enemy.y - cell.y) <= cell.radius; })) this._destroyAntigen(enemy, 'macrophage');
      }, this);
      if (s.boss && group.some(function (cell) { return Math.hypot(s.boss.x - cell.x, s.boss.y - cell.y) <= cell.radius + s.boss.radius; })) {
        this._damageBoss(s.boss.maxHealth * c.boss.macrophageDamageFraction);
        if (s.status === 'victory') return;
      }
    }
    s.macrophages = s.macrophages.filter(function (cell) { return cell.remaining > EPS; });
  };
  LG.Game.prototype._updatePickups = function (dt) {
    const s = this.state, c = this.config;
    if (this._activeTime + EPS >= this._nextPickup) {
      s.pickups.push({ id: ++this._entityId, kind: 'opsonin', x: 100 + this.random() * (c.width - 200), y: -20, radius: c.opsonin.pickupRadius, color: 'white', phase: this.random() * Math.PI * 2, age: 0 });
      this._nextPickup = this._activeTime + c.opsonin.pickupIntervalMin + this.random() * (c.opsonin.pickupIntervalMax - c.opsonin.pickupIntervalMin);
      this._event('pickup-spawn');
    }
    if (this._activeTime + EPS >= this._nextIVIG) {
      const direction = this.random() < 0.5 ? 1 : -1, margin = c.ivig.pickupRadius + 10;
      s.pickups.push({ id: ++this._entityId, kind: 'ivig', x: direction > 0 ? -margin : c.width + margin,
        y: 110 + this.random() * (c.height * 0.4), radius: c.ivig.pickupRadius, color: 'rainbow',
        phase: this.random() * Math.PI * 2, age: 0, direction: direction,
        vx: direction * (c.width + margin * 2) / c.ivig.pickupTravelTime, lifetime: c.ivig.pickupTravelTime });
      this._nextIVIG = this._activeTime + c.ivig.pickupIntervalMin + this.random() * (c.ivig.pickupIntervalMax - c.ivig.pickupIntervalMin);
      this._event('ivig-spawn');
    }
    s.pickups.forEach(function (pickup) {
      pickup.previousX = pickup.x; pickup.previousY = pickup.y;
      pickup.age += dt;
      if (pickup.kind === 'ivig') {
        pickup.x += pickup.vx * dt;
      } else {
        pickup.y += c.opsonin.pickupSpeed * dt;
        pickup.x += Math.sin(pickup.age * 1.8 + pickup.phase) * dt * 18;
      }
    });
  };
  LG.Game.prototype._updateEnemyShots = function (dt) {
    this.state.enemyShots.forEach(function (shot) {
      shot.previousX = shot.x; shot.previousY = shot.y; shot.x += shot.vx * dt; shot.y += shot.vy * dt;
    });
  };
  LG.Game.prototype._hurt = function () {
    const s = this.state;
    if (s.player.invulnerable > EPS || s.status !== 'playing') return false;
    s.lives -= 1; s.player.invulnerable = this.config.invulnerability;
    this.cancelCharge();
    this._event('hurt', { x: s.player.x, y: s.player.y, color: s.weapon, lives: s.lives });
    if (s.lives <= 0) { s.status = 'gameover'; this._event('gameover', { score: s.score }); }
    return true;
  };
  LG.Game.prototype._checkPlayerCollisions = function () {
    const s = this.state;
    s.enemyShots.forEach(function (shot) {
      if (!shot.dead && sweep(shot, s.player, s.player.radius) !== null) { shot.dead = true; this._hurt(); }
    }, this);
    s.antigens.forEach(function (enemy) {
      if (!enemy.dead && hit(enemy, s.player)) {
        this._hurt();
        // The antigen survives contact and re-enters instead of camping on the ship.
        enemy.y = -35; enemy.entryY = -35; enemy.age = 0; enemy.delay = 0;
        enemy.entry = true; enemy.diveAge = 0; enemy.loops += 1;
        enemy.previousX = enemy.x; enemy.previousY = enemy.y;
      }
    }, this);
  };
  LG.Game.prototype._checkLevelCompletion = function () {
    const s = this.state, level = this.levels[s.level - 1];
    if (s.status !== 'playing' || !level || s.wave !== level.waves.length || s.antigens.length) return;
    s.status = 'intermission'; s.intermission = this.config.intermission;
    this._pendingLevel = s.level + 1;
    this._clearTransients();
    this._event('level-clear', { level: s.level, nextLevel: this._pendingLevel, score: s.score });
  };
  LG.sweptCircle = sweep;
})(typeof globalThis !== 'undefined' ? globalThis : window);
