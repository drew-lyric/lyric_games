(function (root) {
  'use strict';
  const LG = root.LyricGalaga = root.LyricGalaga || {};
  const TAU = Math.PI * 2;
  const clamp = function (n, low, high) { return Math.max(low, Math.min(high, n)); };
  LG.clamp = clamp;
  // Patterns return positions and never mutate game state. Each excursion begins
  // in formation and crosses the bottom; surviving antigens then re-enter at the top.
  LG.Patterns = {
    straight: function (enemy, t, config) {
      return { x: enemy.homeX + Math.sin(t * 2 + enemy.phase) * 22, y: enemy.homeY + t * 112 };
    },
    sine: function (enemy, t, config) {
      return { x: enemy.homeX + Math.sin(t * 2.35 + enemy.phase) * 105, y: enemy.homeY + t * 100 };
    },
    arc: function (enemy, t, config) {
      return { x: enemy.homeX + Math.sin(t * 1.45) * 190 * enemy.direction, y: enemy.homeY + t * 130 - Math.sin(t * 1.6) * 35 };
    },
    zigzag: function (enemy, t, config) {
      const zig = 2 / Math.PI * Math.asin(Math.sin(t * 3.1 + enemy.phase));
      return { x: enemy.homeX + zig * 130, y: enemy.homeY + t * 122 };
    },
    flank: function (enemy, t, config) {
      return { x: enemy.homeX + enemy.direction * Math.sin(t * 1.8) * 235, y: enemy.homeY + t * 105 + Math.sin(t * 2.2) * 60 };
    }
  };
  LG.BossMovements = {
    drift: function (time, config) { return { x: config.width / 2 + Math.sin(time * 0.55) * 150, y: config.boss.y + Math.sin(time * 0.9) * 12 }; },
    sweep: function (time, config) { return { x: config.width / 2 + Math.sin(time * 0.85) * 300, y: config.boss.y + Math.sin(time * 1.7) * 16 }; },
    figure8: function (time, config) { return { x: config.width / 2 + Math.sin(time * 0.9) * 245, y: config.boss.y + Math.sin(time * 1.8) * 57 }; },
    loop: function (time, config) { return { x: config.width / 2 + Math.sin(time * 1.25) * 290, y: config.boss.y + Math.cos(time * 1.25) * 60 }; }
  };
  // Attacks return normalized directions plus origins for the engine to instantiate.
  function aimed(boss, player) {
    const dx = player.x - boss.x, dy = player.y - boss.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: boss.x, y: boss.y + 45, dx: dx / length, dy: dy / length };
  }
  LG.BossAttacks = {
    aimed: function (boss, player) { return [aimed(boss, player)]; },
    fan: function (boss, player) {
      const center = aimed(boss, player), angle = Math.atan2(center.dx, center.dy);
      return [-0.23, 0, 0.23].map(function (offset) {
        return { x: center.x, y: center.y, dx: Math.sin(angle + offset), dy: Math.cos(angle + offset) };
      });
    },
    spread: function (boss) {
      const shift = boss.attackCount % 2 ? 0.1 : -0.1;
      return [-0.5, -0.25, 0, 0.25, 0.5].map(function (angle) {
        return { x: boss.x, y: boss.y + 45, dx: Math.sin(angle + shift), dy: Math.cos(angle + shift) };
      });
    },
    lanes: function (boss, player, config) {
      const shift = boss.attackCount % 2 ? config.width / 8 : 0;
      return [1, 3, 5, 7].map(function (lane) {
        return { x: (lane * config.width / 8 + shift) % config.width, y: boss.y + 45, dx: 0, dy: 1 };
      });
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
