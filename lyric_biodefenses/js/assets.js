(function (root) {
  'use strict';
  const LD = root.LyricDefense;
  // Replace src with a local PNG sprite sheet. Frame indices are zero-based,
  // left-to-right then top-to-bottom. Missing art keeps the procedural fallback.
  LD.AssetManifest = {
    'enemy-basic': { src: null, frameWidth: 16, frameHeight: 16, fps: 6, animations: { idle: [0], walk: [0, 1, 2, 1], attack: [2, 3] }, fallback: 'enemy' },
    'enemy-fast': { src: null, frameWidth: 16, frameHeight: 16, fps: 8, animations: { idle: [0], walk: [0, 1, 2, 1], attack: [2, 3] }, fallback: 'fast' },
    'enemy-slow': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0], walk: [0, 1, 2, 1], attack: [2, 3] }, fallback: 'slow' },
    'enemy-elite': { src: null, frameWidth: 16, frameHeight: 16, fps: 6, animations: { idle: [0], walk: [0, 1, 2, 1], attack: [2, 3] }, fallback: 'elite' },
    'enemy-ecoli': { src: null, frameWidth: 16, frameHeight: 16, fps: 7, animations: { idle: [0], walk: [0, 1, 2, 1], attack: [2, 3] }, fallback: 'ecoli' },
    'cell-1': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0, 1, 2, 1] }, fallback: 'cell', color: '#52c8ac' },
    'cell-2': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0, 1, 2, 1] }, fallback: 'cell', color: '#6caff0' },
    'cell-3': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0, 1, 2, 1] }, fallback: 'cell', color: '#c6a0ee' },
    'cell-4': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0, 1, 2, 1] }, fallback: 'cell', color: '#edbc73' },
    'coating': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0] }, fallback: 'coating' },
    'laser': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0] }, fallback: 'laser' },
    'ivig': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0] }, fallback: 'ivig' },
    'clue': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0] }, fallback: 'clue' },
    'image-grid': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0] }, fallback: 'grid' },
    'upgrade': { src: null, frameWidth: 16, frameHeight: 16, fps: 4, animations: { idle: [0] }, fallback: 'laser' }
  };

  const matrices = {
    enemy: [
      '................', '.....111........', '....13331.......', '....13431111....',
      '..11133313331...', '.133311113431...', '.134311113331...', '.13331333111....',
      '..111134311111..', '....1133313331..', '...13311113431..', '...13431313331..',
      '...1333111111...', '....111.........', '................', '................'
    ],
    fast: [
      '................', '................', '................', '................',
      '................', '......1111111...', '.....133333331..', '..1111343343321.',
      '.1...1322222321.', '1.....11111111..', '.1..............', '..11............',
      '....11..........', '................', '................', '................'
    ],
    slow: [
      '................', '................', '................', '...1111111111...',
      '..133333333331..', '.13222222222331.', '.13223333332231.', '.13233444433231.',
      '.13233455433231.', '.13233444433231.', '.13223333332231.', '.13322222223331.',
      '..133333333331..', '...1111111111...', '................', '................'
    ],
    elite: [
      '................', '......111.......', '..11.13331......', '.13311343311....',
      '.1343333333311..', '..1333222233331.', '...132111123431.', '..1331144113331.',
      '.1332114411231..', '.1343211112331..', '.1333322223331..', '..113333334311..',
      '....133113331...', '....111..111....', '................', '................'
    ],
    ecoli: [
      '................', '.11.............', '...1............', '....1......11...',
      '.....111111131..', '....13333333331.', '...133433443331.', '..1133333333331.',
      '.1..13322223331.', '.1...133333331..', '..1...1111111...', '...11.....1.....',
      '.....1.....11...', '......1......1..', '.......11.......', '................'
    ],
    cell: [
      '................', '.....111111.....', '...1122222211...', '..122223322221..',
      '..122333333221..', '.12233344333221.', '.12233444433221.', '.12334455443321.',
      '.12334455443321.', '.12233444433221.', '.12233344333221.', '..122333333221..',
      '..122223322221..', '...1122222211...', '.....111111.....', '................'
    ],
    coating: [
      '................', '.....111111.....', '.....122221.....', '......1111......',
      '......1331......', '.....133331.....', '....13333331....', '...1333333331...',
      '...1334433331...', '...1334433331...', '...1333333331...', '...1222222221...',
      '...1222222221...', '...1111111111...', '................', '................'
    ],
    laser: [
      '................', '.......1........', '.......1........', '.....11111......',
      '...11.....11....', '...1...2...1....', '..1....2....1...', '.111.22222.111..',
      '..1....2....1...', '...1...2...1....', '...11.....11....', '.....11111......',
      '.......1........', '.......1........', '................', '................'
    ],
    ivig: [
      '................', '..11........11..', '..111......111..', '...111....111...',
      '....111..111....', '.....111111.....', '......1111......', '.......11.......',
      '.......11.......', '.......11.......', '.......11.......', '.......11.......',
      '.....111111.....', '.....122221.....', '.....111111.....', '................'
    ],
    clue: [
      '................', '....111111......', '...12222221.....', '..1223333221....',
      '..1231..1321....', '...11...1321....', '.......1321.....', '......1321......',
      '.....1321.......', '.....1321.......', '......11........', '................',
      '.....1331.......', '.....1331.......', '......11........', '................'
    ],
    grid: [
      '................', '.11...11...11...', '1..1.1..1.1..1..', '1..1.1..1.1..1..',
      '.11...11...11...', '................', '.11...11...11...', '1..1.1..1.1..1..',
      '1..1.1..1.1..1..', '.11...11...11...', '................', '.11...11...11...',
      '1..1.1..1.1..1..', '1..1.1..1.1..1..', '.11...11...11...', '................'
    ]
  };

  function palette(entry) {
    if (entry.fallback === 'enemy') return ['#111c2c', '#b5769b', '#5c354d', '#d395b7', '#f1dce5'];
    if (entry.fallback === 'fast') return ['#111c2c', '#52aebe', '#285368', '#78d7d4', '#d0f2e7'];
    if (entry.fallback === 'slow') return ['#111c2c', '#c89c56', '#604b2b', '#e7c485', '#a68249', '#fff0bf'];
    if (entry.fallback === 'elite') return ['#111c2c', '#d1a8e4', '#563951', '#a16caa', '#edc29a', '#fff0cd'];
    if (entry.fallback === 'ecoli') return ['#111c2c', '#a9d63d', '#3a672c', '#c8ef62', '#f1ffb1'];
    if (entry.fallback === 'grid') return ['#111c2c', '#ef6b3d', '#a63524', '#ffa57a'];
    if (entry.fallback === 'clue') return ['#111c2c', '#659abb', '#2f526b', '#b5d7ed'];
    if (entry.fallback === 'cell') return ['#191f1b', entry.color, '#28453b', '#426957', '#8dbba0', '#cee5bf'];
    if (entry.fallback === 'coating') return ['#191f1b', '#92aa78', '#425544', '#7dac87', '#bed0a0'];
    if (entry.fallback === 'ivig') return ['#191f1b', '#decf8c', '#7b7746', '#f1e2b0'];
    return ['#191f1b', '#8c9e7d', '#d8d2a4', '#475a44'];
  }

  LD.Assets = {
    images: {},
    listeners: new Set(),
    subscribe: function (listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
    notify: function (key) { this.listeners.forEach(function (listener) { listener(key); }); },
    load: function () {
      const images = this.images;
      const assets = this;
      Object.keys(LD.AssetManifest).forEach(function (key) {
        const entry = LD.AssetManifest[key];
        if (!entry.src || typeof Image === 'undefined') return;
        const img = new Image();
        img.onload = function () { images[key] = img; assets.notify(key); };
        img.onerror = function () { images[key] = null; assets.notify(key); };
        img.src = entry.src;
      });
    },
    draw: function (ctx, key, x, y, size, time, options) {
      options = options || {};
      const entry = LD.AssetManifest[key] || LD.AssetManifest.upgrade;
      const animation = options.animation || 'idle';
      const frames = (entry.animations && (entry.animations[animation] || entry.animations.idle)) || [0];
      const frame = frames[Math.floor((time || 0) * (entry.fps || 6)) % frames.length];
      const img = this.images[key];
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (options.alpha != null) ctx.globalAlpha = options.alpha;
      if (img && img.width >= entry.frameWidth && img.height >= entry.frameHeight) {
        const columns = Math.floor(img.width / entry.frameWidth);
        const safeFrame = frame < columns * Math.floor(img.height / entry.frameHeight) ? frame : 0;
        ctx.drawImage(img, safeFrame % columns * entry.frameWidth, Math.floor(safeFrame / columns) * entry.frameHeight, entry.frameWidth, entry.frameHeight, Math.round(x), Math.round(y), size, size);
      } else {
        const matrix = matrices[entry.fallback] || matrices.laser;
        const colors = palette(entry);
        const scale = size / 16;
        const blink = entry.fallback === 'cell' && Math.floor((time || 0) * 2) % 9 === 0;
        matrix.forEach(function (row, py) {
          for (let px = 0; px < row.length; px++) {
            const n = Number(row[px]);
            if (!n) continue;
            ctx.fillStyle = colors[blink && n === 5 ? 4 : n] || colors[1];
            ctx.fillRect(Math.round(x + px * scale), Math.round(y + py * scale), Math.ceil(scale), Math.ceil(scale));
          }
        });
        if (['enemy', 'fast', 'slow', 'elite', 'ecoli'].includes(entry.fallback) && animation === 'attack') {
          ctx.fillStyle = '#efdda8';
          ctx.fillRect(Math.round(x + size - 1), Math.round(y + size / 2), 3, 2);
        }
      }
      ctx.restore();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
