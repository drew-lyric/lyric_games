(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  const C = LD.Config;
  const EPSILON = 0.00001;
  function normalizeTrivia(value) {
    if (typeof LD.normalizeTriviaAnswer === 'function') return LD.normalizeTriviaAnswer(value);
    // Injected trivia fixtures can work before the optional provider is loaded.
    return String(value === undefined || value === null ? '' : value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  LD.affordable = function (wallet, cost) {
    return Object.keys(cost || {}).every(function (currency) { return (wallet[currency] || 0) >= cost[currency]; });
  };
  LD.hasPrerequisites = function (player, item) {
    return (item.prerequisites || []).every(function (id) { return !!player.owned[id]; });
  };
  LD.purchaseReason = function (player, item) {
    if (!item) return 'Unknown item.';
    if (!item.repeatable && player.owned[item.id]) return 'Already purchased.';
    if (!LD.hasPrerequisites(player, item)) return 'Purchase the prerequisite upgrade first.';
    if (!LD.affordable(player.wallet, item.cost)) return 'Not enough IgG.';
    return null;
  };
  LD.getPolymerCenters = function (player, x, y) {
    const shape = player && player.polymerImage || 'ring';
    if (typeof LD.polymerCenters === 'function') return LD.polymerCenters(shape, x, y);
    if (shape !== 'grid3x3') return [{ x: x, y: y }];
    const spacing = C.imageSpacing || 72;
    const centers = [];
    for (let row = -1; row <= 1; row += 1) {
      for (let column = -1; column <= 1; column += 1) centers.push({ x: x + column * spacing, y: y + row * spacing });
    }
    return centers;
  };

  LD.Effects = Object.assign(LD.Effects || {}, {
    producer: function (game, player, item) {
      const currency = 'igg' + item.tier;
      player.producers[currency] += 1;
      game._producers[player.id].push({ currency: currency, next: game.state.time + C.productionInterval });
    },
    sendEnemy: function (game, player, item) {
      const opponent = game.state.players.find(function (entry) { return entry.id !== player.id; });
      game._spawn(opponent, item.enemyType, 1);
      player.stats.sent += 1;
      game._event('send', player.id, { target: opponent.id, enemyType: item.enemyType });
    },
    coating: function (game, player, item) { player.coatingDps = item.dps; },
    polymerImage: function (game, player) { player.polymerImage = 'grid3x3'; },
    laserRecharge: function (game, player, item) {
      player.laserCooldownMax = item.cooldown;
      player.laserCooldown = Math.min(player.laserCooldown, item.cooldown);
    },
    skipRecharge: function (game, player, item) { player.skipRecharge = item.interval; },
    skipCharge: function (game, player) {
      player.skipCharges += 1;
      if (player.skipCharges >= C.skipCapacity) player.skipProgress = 0;
    },
    sterilize: function (game, player) {
      const count = player.enemies.length;
      player.enemies.length = 0;
      player.stats.neutralized += count;
      game._event('sterilize', player.id, { count: count });
    }
  });

  function Game(options) {
    options = options || {};
    const Provider = LD.TriviaProvider || LD.ClueProvider;
    this.clueProvider = options.clueProvider || (Provider ? new Provider() : null);
    if (!this.clueProvider || typeof this.clueProvider.next !== 'function') throw new Error('Game requires a clueProvider with next(tier).');
    this.opponentClueProvider = options.opponentClueProvider || this.clueProvider;
    if (typeof this.opponentClueProvider.next !== 'function') throw new Error('Opponent clueProvider requires next(tier).');
    this.seed = options.seed === undefined ? Date.now() : options.seed;
    this.mode = options.mode || 'bot';
    this.reset(this.mode);
  }
  Game.prototype._event = function (type, playerId, extra) {
    this._events.push(Object.assign({ type: type, playerId: playerId }, extra || {}));
  };
  Game.prototype.drainEvents = function () {
    const events = this._events;
    this._events = [];
    return events;
  };
  Game.prototype._tier = function () {
    const weights = C.difficultyWeights;
    let choice = this._random() * weights.reduce(function (sum, weight) { return sum + weight; }, 0);
    for (let i = 0; i < weights.length; i += 1) {
      choice -= weights[i];
      if (choice < 0) return i + 1;
    }
    return weights.length;
  };
  Game.prototype._clue = function (playerId) {
    const tier = this._tier();
    const provider = playerId === 'p2' ? this.opponentClueProvider : this.clueProvider;
    const record = provider.next(tier);
    if (!record || record.answer === undefined || record.answer === null || !String(record.answer).trim()) throw new Error('Clue provider returned an invalid record for tier ' + tier + '.');
    const trivia = record.kind === 'trivia';
    const answer = trivia ? String(record.answer) : LD.normalizeAnswer(record.answer);
    const clue = {
      id: record.id,
      text: record.text || record.clue,
      answer: answer,
      tier: tier,
      length: answer.length
    };
    if (trivia) {
      clue.kind = 'trivia';
      clue.acceptedAnswers = [answer].concat(Array.isArray(record.acceptedAnswers) ? record.acceptedAnswers.filter(function (alias) { return typeof alias === 'string' && alias.trim(); }) : []);
    }
    return clue;
  };
  Game.prototype.reset = function (mode) {
    this.mode = mode || this.mode || 'bot';
    this._random = LD.makeRandom(this.seed);
    this._events = [];
    this._counter = 0;
    this._producers = { p1: [], p2: [] };
    this._nav = {};
    this._navCaches = { p1: Object.create(null), p2: Object.create(null) };
    this._navDirty = { p1: false, p2: false };
    this._pausedPhase = null;
    this._naturalNext = C.firstNaturalSpawn;
    const self = this;
    const players = ['p1', 'p2'].map(function (id) {
      self._nav[id] = new LD.Navigation(Object.assign({}, C, { enemyRadius: LD.Enemies.basic.radius }));
      self._navCaches[id][LD.Enemies.basic.radius] = self._nav[id];
      return {
        id: id,
        wallet: { igg1: 0, igg2: 0, igg3: 0, igg4: 0, ivig: 0 },
        contamination: 0,
        clue: self._clue(id),
        skipCharges: C.skipCapacity,
        skipProgress: 0,
        owned: {},
        producers: { igg1: 0, igg2: 0, igg3: 0, igg4: 0 },
        laserCooldown: 0,
        laserCooldownMax: C.laserCooldown,
        skipRecharge: C.skipRecharge,
        coatingDps: 0,
        polymerImage: 'ring',
        enemies: [],
        walls: [],
        stats: { solved: 0, sent: 0, neutralized: 0 }
      };
    });
    this.state = {
      phase: 'countdown', countdown: C.countdown, time: 0, players: players, winner: null,
      naturalEnabled: true, botEnabled: this.mode === 'bot', sandbox: this.mode === 'sandbox'
    };
    return this.state;
  };
  Game.prototype.pause = function () {
    if (this.state.phase !== 'countdown' && this.state.phase !== 'playing') return false;
    this._pausedPhase = this.state.phase;
    this.state.phase = 'paused';
    this._event('pause');
    return true;
  };
  Game.prototype.resume = function () {
    if (this.state.phase !== 'paused') return false;
    this.state.phase = this._pausedPhase || 'playing';
    this._pausedPhase = null;
    this._event('resume');
    return true;
  };
  Game.prototype._spawn = function (player, type, speedMultiplier, y) {
    const definition = LD.Enemies[type];
    if (!definition) return null;
    const enemy = Object.assign({}, definition, {
      id: 'enemy-' + (++this._counter), type: type, x: definition.radius + 4,
      y: y === undefined ? 24 + this._random() * (C.height - 48) : y,
      health: definition.health, maxHealth: definition.health,
      speed: definition.speed * (speedMultiplier || 1)
    });
    player.enemies.push(enemy);
    this._event('spawn', player.id, { enemyId: enemy.id, enemyType: type });
    return enemy;
  };
  Game.prototype._solve = function (player) {
    const tier = player.clue.tier;
    player.wallet['igg' + tier] += 1;
    player.stats.solved += 1;
    player.clue = this._clue(player.id);
    this._event('answer', player.id, { correct: true, tier: tier });
    return { ok: true };
  };
  Game.prototype._endIfNeeded = function () {
    if (this.state.phase === 'ended') return;
    const lost = this.state.players.filter(function (player) { return player.contamination >= 100; });
    if (!lost.length) return;
    this.state.phase = 'ended';
    this.state.winner = lost.length === 2 ? 'draw' : this.state.players.find(function (player) { return player.id !== lost[0].id; }).id;
    this._event('end', this.state.winner, { winner: this.state.winner });
  };
  Game.prototype._debug = function (payload) {
    if (!this.state.sandbox) return { ok: false, reason: 'Developer controls are available in sandbox mode.' };
    const player = this.state.players.find(function (entry) { return entry.id === (payload.target || 'p1'); });
    if (!player) return { ok: false, reason: 'Unknown player.' };
    if (payload.action === 'grant') {
      const amount = payload.amount === undefined ? 10 : Number(payload.amount);
      if (!Number.isFinite(amount) || amount < 0 || amount > 10000) return { ok: false, reason: 'Invalid grant amount.' };
      C.currencies.forEach(function (currency) { player.wallet[currency] += Math.floor(amount); });
    } else if (payload.action === 'spawn') {
      if (!this._spawn(player, payload.enemyType || 'basic', 1)) return { ok: false, reason: 'Unknown enemy.' };
    } else if (payload.action === 'contamination') {
      const value = Number(payload.value);
      if (!Number.isFinite(value)) return { ok: false, reason: 'Invalid contamination value.' };
      player.contamination = Math.max(0, Math.min(100, value));
      this._endIfNeeded();
    } else if (payload.action === 'natural') {
      this.state.naturalEnabled = !!payload.enabled;
      if (payload.enabled) this._naturalNext = this.state.time + C.naturalInterval(this.state.time);
    } else if (payload.action === 'bot') {
      this.state.botEnabled = !!payload.enabled;
    } else if (payload.action === 'solve') {
      return this._solve(player);
    } else {
      return { ok: false, reason: 'Unknown developer action.' };
    }
    this._event('debug', player.id, { action: payload.action });
    return { ok: true };
  };
  Game.prototype.command = function (playerId, command) {
    command = command || {};
    const payload = command.payload || {};
    const player = this.state.players.find(function (entry) { return entry.id === playerId; });
    if (!player) return { ok: false, reason: 'Unknown player.' };
    if (command.type === 'debug') return this._debug(payload);
    if (this.state.phase !== 'playing') return { ok: false, reason: this.state.phase === 'ended' ? 'The match has ended.' : 'The match is not running.' };
    if (command.type === 'answer') {
      if (payload.clueId !== player.clue.id) return { ok: false, reason: 'That clue is no longer current.' };
      const correct = player.clue.kind === 'trivia'
        ? normalizeTrivia(payload.answer) !== '' && player.clue.acceptedAnswers.some(function (answer) { return normalizeTrivia(payload.answer) === normalizeTrivia(answer); })
        : LD.normalizeAnswer(payload.answer) === player.clue.answer;
      if (!correct) {
        this._event('answer', player.id, { correct: false });
        return { ok: false, reason: 'Try another answer.' };
      }
      return this._solve(player);
    }
    if (command.type === 'skip') {
      if (player.skipCharges <= 0) return { ok: false, reason: 'No skips available. Wait for recharge.' };
      player.skipCharges -= 1;
      player.clue = this._clue(player.id);
      this._event('skip', player.id);
      return { ok: true };
    }
    if (command.type === 'craft') {
      if (!LD.affordable(player.wallet, C.ivigRecipe)) return { ok: false, reason: 'Need 6 IgG1, 3 IgG2, 2 IgG3 and 1 IgG4.' };
      Object.keys(C.ivigRecipe).forEach(function (currency) { player.wallet[currency] -= C.ivigRecipe[currency]; });
      player.wallet.ivig += 1;
      this._event('craft', player.id);
      return { ok: true };
    }
    if (command.type === 'buy') {
      const item = LD.ItemById[payload.itemId];
      const reason = LD.purchaseReason(player, item);
      if (reason) return { ok: false, reason: reason };
      const effect = LD.Effects[item.effect];
      if (typeof effect !== 'function') return { ok: false, reason: 'This item has no registered effect.' };
      Object.keys(item.cost).forEach(function (currency) { player.wallet[currency] -= item.cost[currency]; });
      player.owned[item.id] = true;
      effect(this, player, item);
      this._event('purchase', player.id, { itemId: item.id });
      return { ok: true };
    }
    if (command.type === 'cast') {
      const x = Number(payload.x);
      const y = Number(payload.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= C.cultureX || y < 0 || y > C.height) return { ok: false, reason: 'Place polymer inside the reactor.' };
      if (player.laserCooldown > EPSILON) return { ok: false, reason: 'Laser recharging.' };
      const walls = LD.getPolymerCenters(player, x, y).map(function (center) {
        return {
          x: center.x, y: center.y, radius: C.radius, thickness: C.wallThickness,
          health: C.wallHealth, maxHealth: C.wallHealth, remaining: C.wallLifetime,
          lifetime: C.wallLifetime, dps: player.coatingDps, age: 0,
          polymerImage: player.polymerImage
        };
      });
      if (walls.some(function (wall) {
        return player.enemies.some(function (enemy) { return enemy.health > 0 && LD.Navigation.touchesWall(enemy, wall, enemy.radius); });
      })) {
        return { ok: false, reason: 'An enemy intersects the circle wall. Adjust its position.' };
      }
      const castId = 'cast-' + (++this._counter);
      walls.forEach(function (wall) {
        wall.id = 'wall-' + (++this._counter);
        wall.castId = castId;
        wall.groupId = castId;
        player.walls.push(wall);
      }, this);
      player.laserCooldown = player.laserCooldownMax;
      this._navDirty[player.id] = true;
      walls.forEach(function (wall) {
        this._event('cast', player.id, { wallId: wall.id, castId: castId, groupId: castId, x: wall.x, y: wall.y, radius: wall.radius });
      }, this);
      return { ok: true };
    }
    return { ok: false, reason: 'Unknown command.' };
  };
  Game.prototype._moveEnemy = function (enemy, player, nav, dt) {
    const route = nav.next(enemy);
    enemy.attackingWallId = undefined;
    if (route.breakWalls && route.wallId) {
      const targetWall = player.walls.find(function (wall) { return wall.id === route.wallId; });
      if (targetWall && LD.Navigation.touchesWall(enemy, targetWall, enemy.radius)) {
        enemy.attackingWallId = targetWall.id;
        targetWall.health -= enemy.damage * dt;
        return;
      }
    }
    const dx = route.x - enemy.x;
    const dy = route.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance < EPSILON) return;
    const movement = Math.min(distance, enemy.speed * dt);
    const target = { x: enemy.x + dx / distance * movement, y: enemy.y + dy / distance * movement };
    const blocking = nav.blockingWall(enemy, target, enemy.radius);
    if (!blocking) {
      enemy.x = target.x;
      enemy.y = target.y;
      return;
    }
    // Stop precisely at the physical wall, independent of the navigation grid.
    const start = { x: enemy.x, y: enemy.y };
    let low = 0;
    let high = 1;
    for (let i = 0; i < 12; i += 1) {
      const mid = (low + high) / 2;
      const point = { x: start.x + (target.x - start.x) * mid, y: start.y + (target.y - start.y) * mid };
      if (nav.canMove(start, point, enemy.radius)) low = mid; else high = mid;
    }
    enemy.x = start.x + (target.x - start.x) * low;
    enemy.y = start.y + (target.y - start.y) * low;
    if (route.breakWalls && LD.Navigation.touchesWall(enemy, blocking, enemy.radius)) {
      enemy.attackingWallId = blocking.id;
      blocking.health -= enemy.damage * dt;
    }
  };
  Game.prototype._navigationFor = function (player, radius) {
    const cache = this._navCaches[player.id];
    if (!cache[radius]) {
      cache[radius] = new LD.Navigation(Object.assign({}, C, { enemyRadius: radius }));
      cache[radius].rebuild(player.walls);
    }
    return cache[radius];
  };
  Game.prototype._tickPlayer = function (player, dt) {
    player.laserCooldown = Math.max(0, player.laserCooldown - dt);
    if (player.skipCharges < C.skipCapacity) {
      player.skipProgress += dt;
      while (player.skipProgress + EPSILON >= player.skipRecharge && player.skipCharges < C.skipCapacity) {
        player.skipProgress -= player.skipRecharge;
        player.skipCharges += 1;
      }
      if (player.skipCharges === C.skipCapacity) player.skipProgress = 0;
    } else player.skipProgress = 0;
    const producers = this._producers[player.id];
    for (let i = 0; i < producers.length; i += 1) {
      while (this.state.time + EPSILON >= producers[i].next) {
        player.wallet[producers[i].currency] += 1;
        producers[i].next += C.productionInterval;
        this._event('production', player.id, { currency: producers[i].currency });
      }
    }
    player.walls.forEach(function (wall) { wall.remaining -= dt; wall.age += dt; });
    const expired = player.walls.filter(function (wall) { return wall.remaining <= EPSILON || wall.health <= 0; });
    if (expired.length) {
      player.walls = player.walls.filter(function (wall) { return wall.remaining > EPSILON && wall.health > 0; });
      this._navDirty[player.id] = true;
      expired.forEach(function (wall) { this._event('wallEnd', player.id, { wallId: wall.id, x: wall.x, y: wall.y }); }, this);
    }
    if (this._navDirty[player.id]) {
      Object.values(this._navCaches[player.id]).forEach(function (nav) { nav.rebuild(player.walls); });
      this._navDirty[player.id] = false;
    }
    const survivors = [];
    for (let i = 0; i < player.enemies.length; i += 1) {
      const enemy = player.enemies[i];
      const nav = this._navigationFor(player, enemy.radius);
      this._moveEnemy(enemy, player, nav, dt);
      let dps = 0;
      for (let w = 0; w < player.walls.length; w += 1) {
        const wall = player.walls[w];
        // Walls remain physical until the end of this tick. Their coating also
        // remains active for every enemy, independent of iteration order.
        if (Math.hypot(enemy.x - wall.x, enemy.y - wall.y) <= wall.radius) dps = Math.max(dps, wall.dps);
      }
      enemy.health -= dps * dt;
      if (enemy.health <= EPSILON) {
        player.stats.neutralized += 1;
        this._event('neutralized', player.id, { enemyId: enemy.id, x: enemy.x, y: enemy.y });
      } else if (enemy.x + enemy.radius >= C.cultureX) {
        player.contamination = Math.min(100, player.contamination + enemy.breach);
        this._event('breach', player.id, { enemyId: enemy.id, amount: enemy.breach, x: enemy.x, y: enemy.y });
      } else survivors.push(enemy);
    }
    player.enemies = survivors;
    if (player.walls.some(function (wall) { return wall.health <= 0; })) {
      const broken = player.walls.filter(function (wall) { return wall.health <= 0; });
      player.walls = player.walls.filter(function (wall) { return wall.health > 0; });
      this._navDirty[player.id] = true;
      broken.forEach(function (wall) { this._event('wallEnd', player.id, { wallId: wall.id, x: wall.x, y: wall.y }); }, this);
    }
  };
  Game.prototype._tick = function (dt) {
    this.state.time += dt;
    if (this.state.naturalEnabled && this.state.time + EPSILON >= this._naturalNext) {
      const y = 24 + this._random() * (C.height - 48);
      const speed = C.naturalSpeed(this.state.time);
      this.state.players.forEach(function (player) { this._spawn(player, 'basic', speed, y); }, this);
      this._naturalNext = this.state.time + C.naturalInterval(this.state.time);
    }
    this.state.players.forEach(function (player) { this._tickPlayer(player, dt); }, this);
    this._endIfNeeded();
  };
  Game.prototype.step = function (dt) {
    let remaining = Number(dt);
    if (!Number.isFinite(remaining) || remaining <= 0 || this.state.phase === 'paused' || this.state.phase === 'ended') return;
    if (this.state.phase === 'countdown') {
      const countdownStep = Math.min(remaining, this.state.countdown);
      this.state.countdown = Math.max(0, this.state.countdown - countdownStep);
      remaining -= countdownStep;
      if (this.state.countdown > EPSILON) return;
      this.state.countdown = 0;
      this.state.phase = 'playing';
      this._event('start');
    }
    while (remaining > EPSILON && this.state.phase === 'playing') {
      const amount = Math.min(C.step, remaining);
      this._tick(amount);
      remaining -= amount;
    }
  };
  LD.Game = Game;
})(typeof globalThis !== 'undefined' ? globalThis : window);
