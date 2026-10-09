(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  LD.VERSION = '0.4.0';
  LD.Config = {
    width: 800, height: 360, cultureX: 688, gridSize: 8, step: 1 / 30,
    countdown: 3, radius: 26, imageSpacing: 72, wallThickness: 4, wallHealth: 48, wallLifetime: 14,
    laserCooldown: 1.25, skipCapacity: 2, skipRecharge: 30, productionInterval: 18,
    firstNaturalSpawn: 12, difficultyWeights: [6, 3, 2, 1],
    botSolveDelays: [6, 9, 13, 18], botDefenseChance: 0.65, botAttackInterval: 10,
    currencies: ['igg1', 'igg2', 'igg3', 'igg4', 'ivig'],
    ivigRecipe: { igg1: 6, igg2: 3, igg3: 2, igg4: 1 },
    colors: ['#52c8ac', '#6caff0', '#c6a0ee', '#edbc73', '#efda95'],
    naturalInterval: function (time) { return Math.max(2, 24 / (1 + time / 90)); },
    naturalSpeed: function (time) { return 1 + time / 240; }
  };
  LD.Enemies = {
    basic: { id: 'basic', name: 'Staphylococcus epidermidis', health: 12, speed: 14, damage: 4, breach: 2, radius: 8, sprite: 'enemy-basic', color: '#cf8ba8' },
    fast: { id: 'fast', name: 'Pseudomonas aeruginosa', health: 8, speed: 56, damage: 1.5, breach: 5, radius: 6, sprite: 'enemy-fast', color: '#64d1c7' },
    slow: { id: 'slow', name: 'Bacillus subtilis', health: 64, speed: 8, damage: 12, breach: 20, radius: 11, sprite: 'enemy-slow', color: '#d9bc76' },
    elite: { id: 'elite', name: 'Mycoplasma hyorhinis', health: 100, speed: 48, damage: 14, breach: 30, radius: 10, sprite: 'enemy-elite', color: '#d887fa' },
    ecoli: { id: 'ecoli', name: 'Escherichia coli (E. coli)', health: 22, speed: 18, damage: 48, breach: 1, radius: 8, sprite: 'enemy-ecoli', color: '#b8db57' }
  };
  // One geometry function drives the physics and cursor preview. An image
  // changes the pattern of a cast, while each resulting ring is its own wall.
  LD.polymerCenters = function (shape, x, y) {
    if (shape !== 'grid3x3') return [{ x: x, y: y }];
    const centers = [];
    for (let row = -1; row <= 1; row++) for (let column = -1; column <= 1; column++) centers.push({ x: x + column * LD.Config.imageSpacing, y: y + row * LD.Config.imageSpacing });
    return centers;
  };
  const item = function (id, name, tab, tree, cost, effect, description, extra) {
    return Object.assign({ id: id, name: name, tab: tab, tree: tree, cost: cost, effect: effect, description: description, prerequisites: [], repeatable: false, sprite: 'upgrade' }, extra || {});
  };
  const enemyItem = function (type, cost, description) {
    const enemy = LD.Enemies[type];
    return item('send-' + type, enemy.name, 'OFFENSE', type === 'elite' ? 'IVIG dispatch' : 'Microbe dispatch', cost, 'sendEnemy', description + ' ' + enemy.health + ' health · ' + enemy.speed + ' speed · ' + enemy.damage + ' wall damage/s · ' + enemy.breach + '% contamination.', { enemyType: type, repeatable: true, sprite: enemy.sprite });
  };
  LD.Items = [1, 2, 3, 4].map(function (tier) {
    return item('culture-' + tier, 'IgG' + tier + ' B cells', 'CULTURE', 'B-cell culture', { ['igg' + tier]: 2 }, 'producer', 'Add a B-cell component that produces one IgG' + tier + ' every 18 seconds. Components work independently and can be bought repeatedly.', { tier: tier, repeatable: true, sprite: 'cell-' + tier });
  }).concat([
    enemyItem('basic', { igg1: 1 }, 'A skin-associated coccus. Send a steady baseline contaminant into the opposing culture.'),
    enemyItem('fast', { igg2: 1 }, 'A motile, rod-shaped bacterium. Quick but fragile.'),
    enemyItem('slow', { igg3: 2 }, 'A slow but resilient spore-forming bacterium.'),
    enemyItem('ecoli', { igg4: 1 }, 'A flagellated rod that tears through polymer walls.'),
    enemyItem('elite', { ivig: 1 }, 'Grave danger for cell cultures everywhere.'),
    item('ethanol-1', 'Ethanol Coating', 'LASER', 'Functionalization', { igg1: 4 }, 'coating', 'Polymer circles deal damage per second to enemies inside.', { dps: 2, sprite: 'coating' }),
    item('ethanol-2', 'Ethanol Coating II', 'LASER', 'Functionalization', { igg2: 2, igg3: 1 }, 'coating', 'Double the damage dealt by polymer circles.', { dps: 4, prerequisites: ['ethanol-1'], sprite: 'coating' }),
    item('image-grid', 'Image Modulation', 'LASER', 'SLM Image', { igg2: 2, igg3: 1 }, 'polymerImage', 'Add an SLM to your laser to drastically increase the throughput of polymerization.', { shape: 'grid3x3', sprite: 'image-grid' }),
    item('laser-recharge', 'Femtosecond Pulsing', 'LASER', 'Recharge', { igg1: 3, igg2: 1 }, 'laserRecharge', 'Reduce the laser recharge.', { cooldown: 0.8, sprite: 'laser' }),
    item('sterilize', 'Sterilization', 'LASER', 'Ultraviolet Nuke', { ivig: 2 }, 'sterilize', 'Sterilize every enemy currently in your reactor.', { repeatable: true, sprite: 'ivig' }),
    item('buy-skip', 'Bank a Skip', 'CLUES', 'Skip Bank', { igg1: 1 }, 'skipCharge', 'Buy a single-use skip. Skipping never awards IgG.', { repeatable: true, sprite: 'clue' }),
    item('skip-recharge', 'Rapid Recall', 'CLUES', 'Skip Recharge', { igg2: 2 }, 'skipRecharge', 'Automatically recover one skip every 15 seconds instead of 30, up to two. Purchased skips can be banked above two. Skipping never awards IgG.', { interval: 15, sprite: 'clue' })
  ]);
  LD.ItemById = Object.fromEntries(LD.Items.map(function (entry) { return [entry.id, entry]; }));
  LD.normalizeAnswer = function (value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, ''); };
  LD.makeRandom = function (seed) {
    let state = (seed >>> 0) || 1;
    return function () { state += 0x6D2B79F5; let x = state; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
