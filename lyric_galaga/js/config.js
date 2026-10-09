(function (root) {
  'use strict';
  const LG = root.LyricGalaga = root.LyricGalaga || {};
  LG.VERSION = '1.0.0';
  // All distances use the logical arena, and all durations are seconds.
  LG.Config = {
    width: 960, height: 720, step: 1 / 60, maxFrame: 0.25,
    lives: 3, invulnerability: 2, intermission: 3, eventLimit: 300,
    antigenResponse: true, passiveSpawnRate: 1.5,
    player: { speed: 425, radius: 18, bottom: 65, muzzle: 19, verticalRangeFraction: 0.2, fireInterval: 0.17 },
    antibody: { speed: 760, radius: 5, damage: 1 },
    enemy: { shotSpeed: 160, shotRadius: 5, shotInterval: 6.7, shotJitter: 2, score: 100 },
    opsonin: {
      firstPickup: 15, pickupIntervalMin: 30, pickupIntervalMax: 45,
      pickupSpeed: 45, pickupRadius: 15, chargePeriod: 1.5,
      minSpeed: 150, maxSpeed: 620, deceleration: 330, stopSpeed: 8,
      radius: 10, areaFraction: 0.22, windup: 0.5, aftermath: 0.45
    },
    ivig: {
      firstPickup: 75, pickupIntervalMin: 90, pickupIntervalMax: 135,
      pickupTravelTime: 5, pickupRadius: 11, duration: 30,
      // Radians from vertical, mirrored at the two blasters; one pair per color.
      sprayAngles: [0.18, 0.12, 0.06, 0.015]
    },
    boss: {
      health: 300, radius: 83, coreRadius: 34, y: 140, score: 5000,
      phases: [1, 0.67, 0.34], phaseSpeed: [1, 1.22, 1.48],
      colorOrder: ['green', 'blue', 'purple', 'gold'], colorDuration: 9,
      telegraph: 1.2, summonInterval: 10, summonCount: 4,
      macrophageDamageFraction: 0.1
    }
  };
  LG.Colors = [
    { id: 'green', name: 'Influenza', color: '#52c8ac', shape: 'lobes', unlock: 1 },
    { id: 'blue', name: 'Common Colds', color: '#6caff0', shape: 'chevron', unlock: 2 },
    { id: 'purple', name: 'Bacterial Infections', color: '#c6a0ee', shape: 'spikes', unlock: 3 },
    { id: 'gold', name: 'Measles, Mumps, and Rubella', color: '#edbc73', shape: 'diamond', unlock: 4 }
  ];
  LG.ColorById = Object.fromEntries(LG.Colors.map(function (color) { return [color.id, color]; }));
  LG.Antigens = {
    green: { radius: 17, health: 1, score: 100, shape: 'lobes', sprite: 'antigen-green' },
    blue: { radius: 17, health: 1, score: 125, shape: 'chevron', sprite: 'antigen-blue' },
    purple: { radius: 18, health: 1, score: 150, shape: 'spikes', sprite: 'antigen-purple' },
    gold: { radius: 18, health: 1, score: 175, shape: 'diamond', sprite: 'antigen-gold' }
  };
  // Waves are finite, authored schedules. Colors and patterns cycle over a wave's members.
  function wave(at, count, colors, patterns, extra) {
    return Object.assign({ at: at, count: count, colors: colors, patterns: patterns }, extra || {});
  }
  LG.Levels = [
    { id: 1, title: 'Round 1', subtitle: 'Influenza antibodies online', speed: 0.88, waves: [
      wave(0, 6, ['green'], ['straight']), wave(18, 8, ['green'], ['sine']),
      wave(24, 10, ['green'], ['straight', 'sine'])
    ] },
    { id: 2, title: 'Round 2', subtitle: 'Common Cold antibodies online', speed: 1, waves: [
      wave(0, 8, ['blue'], ['arc']), wave(18, 10, ['green', 'blue'], ['sine', 'arc']),
      wave(24, 10, ['blue', 'green'], ['arc', 'straight']), wave(54, 12, ['green', 'blue'], ['arc'])
    ] },
    { id: 3, title: 'Round 3', subtitle: 'Bacterial infection antibodies online', speed: 1.1, waves: [
      wave(0, 10, ['purple'], ['zigzag']), wave(18, 10, ['green', 'purple'], ['sine', 'zigzag']),
      wave(24, 12, ['blue', 'purple'], ['arc', 'zigzag']), wave(54, 12, ['green', 'blue', 'purple'], ['zigzag', 'arc'])
    ] },
    { id: 4, title: 'Round 4', subtitle: 'Measles, Mumps, and Rubella antibodies online', speed: 1.2, waves: [
      wave(0, 14, ['gold'], ['flank']), wave(18, 12, ['blue', 'gold'], ['arc', 'flank']),
      wave(24, 14, ['purple', 'gold', 'blue'], ['zigzag', 'flank']), wave(54, 14, ['green', 'blue', 'purple', 'gold'], ['flank', 'arc'])
    ] },
    { id: 5, title: 'Round 5', subtitle: 'All antibody classes active', speed: 1.28, waves: [
      wave(0, 14, ['green', 'blue', 'purple', 'gold'], ['sine', 'arc']),
      wave(18, 14, ['gold', 'purple', 'blue', 'green'], ['zigzag', 'flank']),
      wave(36, 18, ['green', 'purple', 'gold', 'blue'], ['straight', 'arc', 'flank']),
      wave(54, 20, ['green', 'blue', 'purple', 'gold'], ['sine', 'arc', 'zigzag', 'flank'])
    ] }
  ];
  // Boss behavior is data-driven. Add a movement or attack implementation in Patterns
  // and reference its key here to introduce another mode.
  LG.BossModes = {
    green: { movement: 'drift', attack: 'aimed', interval: 1.55, shotSpeed: 205, summon: 'sine' },
    blue: { movement: 'sweep', attack: 'fan', interval: 1.35, shotSpeed: 220, summon: 'arc' },
    purple: { movement: 'figure8', attack: 'spread', interval: 1.1, shotSpeed: 205, summon: 'zigzag' },
    gold: { movement: 'loop', attack: 'lanes', interval: 0.95, shotSpeed: 235, summon: 'flank' }
  };
  LG.makeRandom = function (seed) {
    let value = (seed >>> 0) || 1;
    return function () {
      value += 0x6D2B79F5;
      let x = value;
      x = Math.imul(x ^ x >>> 15, x | 1);
      x ^= x + Math.imul(x ^ x >>> 7, x | 61);
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
