(function (root) {
  'use strict';
  const LD = root.LyricDefense;
  const C = LD.Config;
  const TAU = Math.PI * 2;

  function pixelRing(ctx, x, y, radius, color, thickness, dashed) {
    ctx.fillStyle = color;
    const seen = new Set();
    for (let a = 0; a < TAU; a += 1 / Math.max(8, radius)) {
      if (dashed && Math.floor(a * 12) % 3 === 0) continue;
      const px = Math.round((x + Math.cos(a) * radius) / 2) * 2;
      const py = Math.round((y + Math.sin(a) * radius) / 2) * 2;
      const id = px + ':' + py;
      if (seen.has(id)) continue;
      seen.add(id);
      ctx.fillRect(px - thickness / 2, py - thickness / 2, thickness, thickness);
    }
  }

  function pixelText(ctx, text, x, y, color, size, align) {
    ctx.font = (size || 8) + 'px "Consolas", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  class Renderer {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.options = options || {};
      this.pointer = null;
      this.effects = [];
      this.time = 0;
      this.lastEnemies = new Map();
      this.lastWalls = new Map();
      this.createdWallIds = new Set();
      this.removedWallIds = new Set();
      this.removedEnemyIds = new Set();
      this.playerId = this.options.opponent ? 'p2' : 'p1';
      this.ctx.imageSmoothingEnabled = false;
    }

    setPointer(point) { this.pointer = point; }

    handleEvent(event) {
      if (event.playerId && event.playerId !== this.playerId) return;
      const data = event.payload || event;
      if (event.type === 'cast' || event.type === 'wall-created' || event.type === 'wallPlaced') {
        this.effects.push({ type: 'zap', x: data.x, y: data.y, radius: data.radius || C.radius, age: 0, duration: .24 });
        this.createdWallIds.add(data.wallId);
      }
      if (event.type === 'breach' || event.type === 'enemy-breached') {
        this.effects.push({ type: 'breach', x: C.cultureX, y: data.y || C.height / 2, age: 0, duration: .5 });
        this.removedEnemyIds.add(data.enemyId);
      }
      if (event.type === 'neutralized') {
        this.effects.push({ type: 'kill', x: data.x, y: data.y, age: 0, duration: .38 });
        this.removedEnemyIds.add(data.enemyId);
      }
      if (event.type === 'wallEnd') {
        const wall = this.lastWalls.get(data.wallId);
        this.effects.push({ type: 'dissolve', x: data.x, y: data.y, radius: wall ? wall.radius : C.radius, age: 0, duration: .45 });
        this.removedWallIds.add(data.wallId);
      }
      if (event.type === 'sterilize') {
        this.lastEnemies.forEach((enemy, id) => {
          this.effects.push({ type: 'kill', x: enemy.x, y: enemy.y, age: 0, duration: .38 });
          this.removedEnemyIds.add(id);
        });
      }
    }

    render(player, state, dt) {
      dt = dt || 0;
      this.time += dt;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, C.width, C.height);
      this.drawEnvironment(player);
      const walls = (player && player.walls) || [];
      const enemies = (player && player.enemies) || [];
      const wallIds = new Set(walls.map(function (wall) { return wall.id; }));
      const enemyIds = new Set(enemies.map(function (enemy) { return enemy.id; }));
      this.lastWalls.forEach((wall, id) => {
        if (!wallIds.has(id) && !this.removedWallIds.has(id)) this.effects.push({ type: 'dissolve', x: wall.x, y: wall.y, radius: wall.radius, age: 0, duration: .45 });
      });
      this.lastEnemies.forEach((enemy, id) => {
        if (!enemyIds.has(id) && !this.removedEnemyIds.has(id)) this.effects.push({ type: 'kill', x: enemy.x, y: enemy.y, age: 0, duration: .38 });
      });
      walls.forEach(wall => {
        if (!this.lastWalls.has(wall.id) && !this.createdWallIds.has(wall.id)) this.effects.push({ type: 'zap', x: wall.x, y: wall.y, radius: wall.radius, age: 0, duration: .2 });
        this.drawWall(wall);
      });
      enemies.forEach(enemy => this.drawEnemy(enemy));
      this.lastWalls = new Map(walls.map(function (wall) { return [wall.id, wall]; }));
      this.lastEnemies = new Map(enemies.map(function (enemy) { return [enemy.id, enemy]; }));
      this.createdWallIds.clear();
      this.removedWallIds.clear();
      this.removedEnemyIds.clear();
      this.effects = this.effects.filter(effect => {
        effect.age += dt;
        if (effect.age >= effect.duration) return false;
        this.drawEffect(effect);
        return true;
      });
      if (this.pointer && !this.options.opponent && state && state.phase === 'playing') this.drawPointer(player);
      ctx.imageSmoothingEnabled = false;
    }

    drawEnvironment(player) {
      const ctx = this.ctx;
      ctx.fillStyle = '#101c2e';
      ctx.fillRect(0, 0, C.width, C.height);
      // A quiet schematic grid leaves room for enemies and polymer boundaries.
      ctx.fillStyle = '#25384f';
      for (let x = 24; x < C.cultureX; x += 40) {
        for (let y = 20; y < C.height; y += 40) ctx.fillRect(x, y, 1, 1);
      }
      ctx.fillStyle = '#182c3e';
      ctx.fillRect(C.cultureX, 0, C.width - C.cultureX, C.height);
      ctx.fillStyle = '#37556e';
      for (let y = 0; y < C.height; y += 12) ctx.fillRect(C.cultureX, y, 2, 6);
      for (let x = C.cultureX + 8; x < C.width; x += 16) {
        ctx.fillStyle = '#203c52'; ctx.fillRect(x, 0, 1, C.height);
      }
      ctx.fillStyle = '#25384f';
      ctx.fillRect(0, 0, C.width, 1); ctx.fillRect(0, C.height - 1, C.width, 1);
      for (let x = 16; x < C.cultureX; x += 16) {
        ctx.fillRect(x, 8, 3, 2); ctx.fillRect(x, C.height - 10, 3, 2);
      }
      // Pixel docking ports and direction marks.
      ctx.fillStyle = '#2d4058'; ctx.fillRect(0, 133, 9, 94);
      ctx.fillStyle = '#638ba8'; ctx.fillRect(0, 138, 3, 84);
      for (let y = 145; y < 220; y += 14) {
        ctx.fillStyle = '#486681'; ctx.fillRect(6, y, 6, 7);
      }
      pixelText(ctx, 'INLET', 21, 32, '#63839f', 8);
      pixelText(ctx, 'B-CELL', C.cultureX + 15, 32, '#8fb2cc', 8);
      pixelText(ctx, 'CULTURE', C.cultureX + 15, 45, '#60849f', 7);
      for (let x = 40; x <= 600; x += 112) {
        const y = 335;
        ctx.fillStyle = '#2c4962'; ctx.fillRect(x, y, 13, 2); ctx.fillRect(x + 10, y - 2, 3, 6); ctx.fillRect(x + 7, y - 4, 3, 10);
      }
      const producers = (player && player.producers) || {};
      const culture = [];
      C.currencies.slice(0, 4).forEach(function (key, index) {
        const count = Number(producers[key]) || 0;
        for (let i = 0; i < Math.min(count, 6); i++) culture.push({ tier: index + 1, index: i });
      });
      if (culture.length === 0) {
        ctx.save(); ctx.globalAlpha = .4;
        pixelRing(ctx, C.cultureX + 57, 175, 29, '#557e99', 2, true);
        LD.Assets.draw(ctx, 'cell-1', C.cultureX + 40, 159, 32, this.time, { alpha: .55 });
        ctx.restore();
        pixelText(ctx, 'NO PRODUCERS', C.cultureX + 57, 222, '#668ea9', 6, 'center');
        pixelText(ctx, 'ADD B CELLS', C.cultureX + 57, 234, '#405f79', 6, 'center');
      } else {
        culture.slice(0, 18).forEach((cell, i) => {
          const x = C.cultureX + 17 + i % 2 * 42;
          const y = 75 + Math.floor(i / 2) * 28;
          const wobble = Math.floor(Math.sin(this.time * 1.3 + i * 1.5) * 2);
          LD.Assets.draw(ctx, 'cell-' + cell.tier, x, y + wobble, 29, this.time + i);
          if (Math.floor(this.time * 2 + i) % 7 === 0) {
            ctx.fillStyle = C.colors[cell.tier - 1]; ctx.fillRect(x + 29, y + 3, 2, 2);
          }
        });
        const count = Object.values(producers).reduce(function (a, b) { return a + Number(b || 0); }, 0);
        pixelText(ctx, count + ' COMPONENTS', C.cultureX + 57, 325, '#83abc6', 6, 'center');
      }
      pixelText(ctx, 'POLYMERIZATION CHAMBER', 24, 317, '#3b5a77', 7);
      pixelText(ctx, 'FLOW →', 570, 32, '#577b98', 7);
    }

    drawWall(wall) {
      const ctx = this.ctx;
      const r = wall.radius || C.radius;
      const health = wall.health / (wall.maxHealth || C.wallHealth);
      const remaining = wall.remaining == null ? C.wallLifetime : wall.remaining;
      const color = health < .3 ? '#c94b36' : wall.dps > 0 ? '#ff8057' : '#ec603e';
      ctx.save();
      if (remaining < 2) ctx.globalAlpha = Math.floor(this.time * 8) % 2 ? .5 : .85;
      const pulse = .88 + Math.sin(this.time * 2.8 + wall.x * .015) * .12;
      const glow = ctx.createRadialGradient(wall.x, wall.y, Math.max(0, r - 8), wall.x, wall.y, r + 10);
      glow.addColorStop(0, '#e24b2600');
      glow.addColorStop(.34, '#ef542730');
      glow.addColorStop(.48, '#f85b3960');
      glow.addColorStop(.62, '#ec462938');
      glow.addColorStop(1, '#b72e2100');
      ctx.fillStyle = glow;
      ctx.globalAlpha *= pulse;
      ctx.fillRect(wall.x - r - 10, wall.y - r - 10, (r + 10) * 2, (r + 10) * 2);
      if (wall.dps > 0) {
        ctx.fillStyle = '#ed6a3210'; ctx.beginPath(); ctx.arc(wall.x, wall.y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff9c66';
        ctx.globalAlpha = .3;
        for (let i = 0; i < 8; i++) {
          const angle = i * 2.4 + Math.floor(this.time * 2) * .1;
          const distance = r * (.15 + (i * .137 % .68));
          ctx.fillRect(Math.round(wall.x + Math.cos(angle) * distance), Math.round(wall.y + Math.sin(angle) * distance), 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      pixelRing(ctx, wall.x, wall.y, r, '#642d29', 5, false);
      pixelRing(ctx, wall.x, wall.y, r, color, 3, false);
      if (health < .85) {
        ctx.fillStyle = '#462521';
        for (let i = 0; i < Math.ceil((1 - health) * 8); i++) {
          const a = i * 2.1 + .35;
          ctx.fillRect(Math.round(wall.x + Math.cos(a) * r) - 2, Math.round(wall.y + Math.sin(a) * r) - 2, 4, 4);
        }
      }
      ctx.fillStyle = '#573831'; ctx.fillRect(wall.x - 14, wall.y + r + 7, 28, 2);
      ctx.fillStyle = color; ctx.fillRect(wall.x - 14, wall.y + r + 7, 28 * Math.max(0, health), 2);
      ctx.restore();
    }

    drawEnemy(enemy) {
      const ctx = this.ctx;
      const bob = Math.round(Math.sin(this.time * (enemy.type === 'fast' ? 12 : 8) + String(enemy.id).length) * 1.1);
      const size = (enemy.radius || 8) * 3;
      ctx.fillStyle = '#07111e66'; ctx.fillRect(Math.round(enemy.x - 8), Math.round(enemy.y + 8), 17, 3);
      const sprite = enemy.sprite || (LD.Enemies[enemy.type] || {}).sprite || 'enemy-basic';
      LD.Assets.draw(ctx, sprite, enemy.x - size / 2, enemy.y - size / 2 + bob, size, this.time, { animation: enemy.attackingWallId ? 'attack' : 'walk' });
      if (enemy.health < (enemy.maxHealth || 12)) {
        const ratio = enemy.health / (enemy.maxHealth || 12);
        ctx.fillStyle = '#483432'; ctx.fillRect(Math.round(enemy.x - 8), Math.round(enemy.y - 16), 16, 2);
        ctx.fillStyle = '#d08c78'; ctx.fillRect(Math.round(enemy.x - 8), Math.round(enemy.y - 16), 16 * ratio, 2);
      }
      if (enemy.attackingWallId && Math.floor(this.time * 7) % 3 === 0) {
        ctx.fillStyle = '#e0cf97'; ctx.fillRect(Math.round(enemy.x + 10), Math.round(enemy.y - 2), 2, 2);
      }
    }

    drawPointer(player) {
      const point = this.pointer;
      const centers = LD.polymerCenters ? LD.polymerCenters(player && player.polymerImage, point.x, point.y) : [point];
      const invalid = point.x < 0 || point.x >= C.cultureX || point.y < 0 || point.y > C.height || centers.some(function (center) {
        return ((player && player.enemies) || []).some(function (enemy) {
          return Math.abs(Math.hypot(enemy.x - center.x, enemy.y - center.y) - C.radius) <= (enemy.radius || 8) + C.wallThickness / 2;
        });
      });
      const ready = player && player.laserCooldown <= 0 && !invalid;
      const color = invalid ? '#ffb4a2' : ready ? '#ff7e58' : '#945749';
      this.ctx.save(); this.ctx.globalAlpha = .75;
      centers.forEach((center) => pixelRing(this.ctx, center.x, center.y, C.radius, color, 2, true));
      this.ctx.fillStyle = invalid ? color : '#7ab8cf';
      this.ctx.fillRect(Math.round(point.x) - 5, Math.round(point.y), 3, 1);
      this.ctx.fillRect(Math.round(point.x) + 3, Math.round(point.y), 3, 1);
      this.ctx.fillRect(Math.round(point.x), Math.round(point.y) - 5, 1, 3);
      this.ctx.fillRect(Math.round(point.x), Math.round(point.y) + 3, 1, 3);
      this.ctx.restore();
    }

    drawEffect(effect) {
      const ctx = this.ctx;
      if (!Number.isFinite(effect.x) || !Number.isFinite(effect.y)) return;
      const t = effect.age / effect.duration;
      ctx.save(); ctx.globalAlpha = 1 - t;
      if (effect.type === 'zap') {
        const radius = effect.radius || C.radius;
        pixelRing(ctx, effect.x, effect.y, radius * (.75 + t * .25), '#ff9d6f', 4, false);
        ctx.fillStyle = '#ff8154';
        for (let i = 0; i < 7; i++) {
          const a = i * TAU / 7;
          ctx.fillRect(Math.round(effect.x + Math.cos(a) * (radius + 3 + t * 10)), Math.round(effect.y + Math.sin(a) * (radius + 3 + t * 10)), 3, 3);
        }
      } else {
        const breach = effect.type === 'breach';
        ctx.fillStyle = breach ? '#de8c75' : effect.type === 'kill' ? '#8acbd0' : '#e66343';
        const radius = effect.type === 'dissolve' ? effect.radius || C.radius : 4;
        for (let i = 0; i < 12; i++) {
          const a = i * TAU / 12;
          const r = radius + t * (breach ? 25 : 12);
          ctx.fillRect(Math.round(effect.x + Math.cos(a) * r), Math.round(effect.y + Math.sin(a) * r), 3, 3);
        }
        if (breach) { ctx.globalAlpha = (1 - t) * .2; ctx.fillStyle = '#d67b65'; ctx.fillRect(C.cultureX, 0, C.width - C.cultureX, C.height); }
      }
      ctx.restore();
    }
  }

  LD.Renderer = Renderer;
  LD.drawWelcomeArt = function (canvas, time) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let x = 8; x < 280; x += 16) { ctx.fillStyle = '#2d445f'; ctx.fillRect(x, 60, 3, 1); }
    ctx.fillStyle = '#2e4a65'; ctx.fillRect(213, 17, 2, 87);
    for (let y = 20; y < 110; y += 13) { ctx.fillStyle = '#557d9b'; ctx.fillRect(213, y, 2, 5); }
    LD.Assets.draw(ctx, 'enemy-basic', 16, 43 + Math.round(Math.sin(time * 3)), 32, time, { animation: 'walk' });
    LD.Assets.draw(ctx, 'enemy-fast', 56, 43 + Math.round(Math.cos(time * 3)), 32, time, { animation: 'walk' });
    for (let row = -1; row <= 1; row++) {
      for (let column = -1; column <= 1; column++) {
        const x = 147 + column * 29;
        const y = 60 + row * 29;
        ctx.save();
        ctx.globalAlpha = .2 + Math.sin(time * 2 + row + column) * .06;
        pixelRing(ctx, x, y, 11, '#e84e31', 6, false);
        ctx.globalAlpha = .85;
        pixelRing(ctx, x, y, 11, '#ee633d', 2, false);
        ctx.restore();
      }
    }
    LD.Assets.draw(ctx, 'enemy-basic', 139, 52, 16, time);
    LD.Assets.draw(ctx, 'cell-1', 229, 24, 32, time);
    LD.Assets.draw(ctx, 'cell-2', 241, 65, 29, time + 2);
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
