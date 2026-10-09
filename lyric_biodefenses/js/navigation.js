(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  const EPSILON = 0.001;
  const DIRECTIONS = [[1, 0], [1, -1], [1, 1], [0, -1], [0, 1], [-1, 0], [-1, -1], [-1, 1]];

  function Heap() { this.entries = []; }
  Heap.prototype.push = function (id, cost) {
    const entry = { id: id, cost: cost };
    const list = this.entries;
    let index = list.length;
    list.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (list[parent].cost <= cost) break;
      list[index] = list[parent];
      index = parent;
    }
    list[index] = entry;
  };
  Heap.prototype.pop = function () {
    const list = this.entries;
    const first = list[0];
    const last = list.pop();
    if (!list.length) return first;
    let index = 0;
    while (index * 2 + 1 < list.length) {
      let child = index * 2 + 1;
      if (child + 1 < list.length && list[child + 1].cost < list[child].cost) child += 1;
      if (last.cost <= list[child].cost) break;
      list[index] = list[child];
      index = child;
    }
    list[index] = last;
    return first;
  };

  function distance(point, wall) { return Math.hypot(point.x - wall.x, point.y - wall.y); }
  function touchesWall(point, wall, radius) {
    return Math.abs(distance(point, wall) - wall.radius) <= wall.thickness / 2 + radius + EPSILON;
  }
  function segmentMinimumDistance(from, to, wall) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((wall.x - from.x) * dx + (wall.y - from.y) * dy) / lengthSquared)) : 0;
    return Math.hypot(from.x + dx * t - wall.x, from.y + dy * t - wall.y);
  }
  function blocksSegment(from, to, wall, radius) {
    const inner = Math.max(0, wall.radius - wall.thickness / 2 - radius);
    const outer = wall.radius + wall.thickness / 2 + radius;
    const start = distance(from, wall);
    const end = distance(to, wall);
    // A newly spawned enemy can intersect a clipped wall. Let it leave toward
    // the nearer side, but never pass through the circumference.
    if (start > inner + EPSILON && start < outer - EPSILON) {
      return start < wall.radius ? end >= start - EPSILON : end <= start + EPSILON;
    }
    if (start <= inner + EPSILON) return end > inner + EPSILON;
    return segmentMinimumDistance(from, to, wall) < outer - EPSILON;
  }

  function Navigation(options) {
    options = options || LD.Config;
    this.width = options.cultureX || options.width;
    this.height = options.height;
    this.cellSize = options.gridSize || 8;
    this.radius = options.enemyRadius === undefined ? 8 : options.enemyRadius;
    this.columns = Math.ceil(this.width / this.cellSize);
    this.rows = Math.ceil(this.height / this.cellSize);
    this.size = this.columns * this.rows;
    this.blocked = new Uint8Array(this.size);
    this.boundary = new Uint8Array(this.size);
    this.owners = new Array(this.size);
    this.walls = [];
    this.freeDistance = new Float64Array(this.size);
    this.breakDistance = new Float64Array(this.size);
    this.freeNext = new Int32Array(this.size);
    this.breakNext = new Int32Array(this.size);
    this.version = 0;
    this.rebuild([]);
  }
  Navigation.prototype.point = function (id) {
    return { x: Math.min(this.width - 0.01, (id % this.columns + 0.5) * this.cellSize), y: Math.min(this.height - 0.01, (Math.floor(id / this.columns) + 0.5) * this.cellSize) };
  };
  Navigation.prototype.cell = function (point) {
    const x = Math.max(0, Math.min(this.columns - 1, Math.floor(point.x / this.cellSize)));
    const y = Math.max(0, Math.min(this.rows - 1, Math.floor(point.y / this.cellSize)));
    return y * this.columns + x;
  };
  Navigation.prototype.rebuild = function (walls) {
    this.walls = walls;
    this.version += 1;
    const margin = this.radius + this.cellSize / Math.SQRT2;
    for (let id = 0; id < this.size; id += 1) {
      const point = this.point(id);
      const boundary = point.x < this.radius || point.y < this.radius || point.y > this.height - this.radius;
      this.boundary[id] = boundary ? 1 : 0;
      this.owners[id] = null;
      this.blocked[id] = boundary ? 1 : 0;
    }
    // Grid images create nine circles at once. Rasterize each circle only in
    // its bounding box rather than testing every wall against the whole arena.
    for (let w = 0; w < walls.length; w += 1) {
      const wall = walls[w];
      const thickness = wall.thickness / 2 + margin;
      const outer = wall.radius + thickness;
      const firstX = Math.max(0, Math.floor((wall.x - outer) / this.cellSize));
      const lastX = Math.min(this.columns - 1, Math.floor((wall.x + outer) / this.cellSize));
      const firstY = Math.max(0, Math.floor((wall.y - outer) / this.cellSize));
      const lastY = Math.min(this.rows - 1, Math.floor((wall.y + outer) / this.cellSize));
      for (let y = firstY; y <= lastY; y += 1) {
        for (let x = firstX; x <= lastX; x += 1) {
          const id = y * this.columns + x;
          if (Math.abs(distance(this.point(id), wall) - wall.radius) > thickness) continue;
          if (!this.owners[id]) this.owners[id] = [];
          this.owners[id].push(wall.id);
          this.blocked[id] = 1;
        }
      }
    }
    this._buildField(false, this.freeDistance, this.freeNext);
    this._buildField(true, this.breakDistance, this.breakNext);
  };
  Navigation.prototype._buildField = function (allowWalls, distances, next) {
    distances.fill(Infinity);
    next.fill(-1);
    const heap = new Heap();
    for (let y = 0; y < this.rows; y += 1) {
      const id = y * this.columns + this.columns - 1;
      if (this.boundary[id] || (!allowWalls && this.blocked[id])) continue;
      distances[id] = allowWalls && this.owners[id] ? this.owners[id].length * 256 : 0;
      heap.push(id, distances[id]);
    }
    while (heap.entries.length) {
      const current = heap.pop();
      if (current.cost !== distances[current.id]) continue;
      const x = current.id % this.columns;
      const y = Math.floor(current.id / this.columns);
      for (let d = 0; d < DIRECTIONS.length; d += 1) {
        const dx = DIRECTIONS[d][0];
        const dy = DIRECTIONS[d][1];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= this.columns || ny < 0 || ny >= this.rows) continue;
        const id = ny * this.columns + nx;
        if (this.boundary[id] || (!allowWalls && this.blocked[id])) continue;
        if (dx && dy) {
          const horizontal = y * this.columns + nx;
          const vertical = ny * this.columns + x;
          if (this.boundary[horizontal] || this.boundary[vertical]) continue;
          if (!allowWalls && (this.blocked[horizontal] || this.blocked[vertical])) continue;
        }
        const crossing = allowWalls && this.owners[id] ? this.owners[id].length * 256 : 0;
        const cost = current.cost + this.cellSize * (dx && dy ? Math.SQRT2 : 1) + crossing;
        if (cost + EPSILON >= distances[id]) continue;
        distances[id] = cost;
        next[id] = current.id;
        heap.push(id, cost);
      }
    }
  };
  Navigation.prototype.blockingWall = function (from, to, radius) {
    for (let i = 0; i < this.walls.length; i += 1) {
      if (blocksSegment(from, to, this.walls[i], radius === undefined ? this.radius : radius)) return this.walls[i];
    }
    return null;
  };
  Navigation.prototype.canMove = function (from, to, radius) {
    return !this.blockingWall(from, to, radius);
  };
  Navigation.prototype._nearbyFree = function (point) {
    const start = this.cell(point);
    const sx = start % this.columns;
    const sy = Math.floor(start / this.columns);
    let best = -1;
    let bestDistance = Infinity;
    for (let y = Math.max(0, sy - 5); y <= Math.min(this.rows - 1, sy + 5); y += 1) {
      for (let x = Math.max(0, sx - 5); x <= Math.min(this.columns - 1, sx + 5); x += 1) {
        const id = y * this.columns + x;
        if (this.blocked[id] || !Number.isFinite(this.freeDistance[id])) continue;
        const target = this.point(id);
        const candidateDistance = Math.hypot(point.x - target.x, point.y - target.y);
        if (candidateDistance >= bestDistance || !this.canMove(point, target)) continue;
        best = id;
        bestDistance = candidateDistance;
      }
    }
    return best;
  };
  Navigation.prototype.next = function (enemy) {
    const id = this.cell(enemy);
    if (!this.blocked[id] && Number.isFinite(this.freeDistance[id])) {
      const next = this.freeNext[id];
      return next < 0 ? { x: this.width, y: enemy.y, breakWalls: false } : Object.assign(this.point(next), { breakWalls: false });
    }
    if (this.blocked[id]) {
      const nearby = this._nearbyFree(enemy);
      if (nearby >= 0) return Object.assign(this.point(nearby), { breakWalls: false });
    }
    const wallIds = this.owners[id] || [];
    for (let i = 0; i < wallIds.length; i += 1) {
      const wall = this.walls.find(function (entry) { return entry.id === wallIds[i]; });
      if (wall && touchesWall(enemy, wall, enemy.radius)) {
        return { x: enemy.x, y: enemy.y, wallId: wall.id, breakWalls: true };
      }
    }
    const next = this.breakNext[id];
    if (next < 0) return { x: this.width, y: enemy.y, breakWalls: true };
    const owners = this.owners[next] || [];
    return Object.assign(this.point(next), { breakWalls: true, wallId: owners.length ? owners[0] : undefined });
  };
  Navigation.touchesWall = touchesWall;
  Navigation.blocksSegment = blocksSegment;
  LD.Navigation = Navigation;
})(typeof globalThis !== 'undefined' ? globalThis : window);
