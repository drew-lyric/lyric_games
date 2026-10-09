(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  const normalizeAnswer = LD.normalizeAnswer || function (value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  };
  const normalizeText = function (value) { return value.trim().toLowerCase().replace(/\s+/g, ' '); };
  const fallbackRows = [
    [1, 'Animal that says meow', 'CAT'],
    [1, 'Animal that says woof', 'DOG'],
    [1, 'Frozen water', 'ICE'],
    [1, 'The star at the center of our solar system', 'SUN'],
    [1, 'A hen lays one of these', 'EGG'],
    [1, 'A sweet substance made by bees', 'HONEY'],
    [1, 'Number of sides on a triangle', 'THREE'],
    [1, 'The color of a ripe banana', 'YELLOW'],
    [1, 'You use this body part to smell', 'NOSE'],
    [1, 'You use this body part to hear', 'EAR'],
    [1, 'A vehicle that travels on railway tracks', 'TRAIN'],
    [1, 'A book of maps', 'ATLAS'],
    [1, 'The opposite of night', 'DAY'],
    [1, 'The opposite of left', 'RIGHT'],
    [1, 'A person who teaches a class', 'TEACHER'],
    [1, 'The season between winter and summer', 'SPRING'],
    [2, 'A shape with six sides', 'HEXAGON'],
    [2, 'A person who writes books', 'AUTHOR'],
    [2, 'An instrument with black and white keys', 'PIANO'],
    [2, 'A large land animal with a trunk', 'ELEPHANT'],
    [2, 'The planet famous for its prominent rings', 'SATURN'],
    [2, 'The largest ocean on Earth', 'PACIFIC'],
    [2, 'The capital city of France', 'PARIS'],
    [2, 'The chemical element with the symbol O', 'OXYGEN'],
    [2, 'The chemical element with the symbol Au', 'GOLD'],
    [2, 'An instrument used to measure temperature', 'THERMOMETER'],
    [2, 'A person who studies stars and planets', 'ASTRONOMER'],
    [2, 'A scientist who studies rocks', 'GEOLOGIST'],
    [2, 'A word with the opposite meaning of another word', 'ANTONYM'],
    [2, 'A punctuation mark shaped like two vertically stacked dots', 'COLON'],
    [2, 'A solid with six square faces', 'CUBE'],
    [2, 'The smallest unit of a chemical element', 'ATOM'],
    [3, 'An instrument that measures atmospheric pressure', 'BAROMETER'],
    [3, 'The study of the origins and histories of words', 'ETYMOLOGY'],
    [3, 'A word pronounced like another word but with a different meaning', 'HOMOPHONE'],
    [3, 'The branch of mathematics concerned with rates of change and integrals', 'CALCULUS'],
    [3, 'A scientist who studies insects', 'ENTOMOLOGIST'],
    [3, 'A scientist who studies earthquakes', 'SEISMOLOGIST'],
    [3, 'The green pigment that absorbs light in plants', 'CHLOROPHYLL'],
    [3, 'The process by which plants use light to make sugars', 'PHOTOSYNTHESIS'],
    [3, 'An animal that eats both plants and other animals', 'OMNIVORE'],
    [3, 'The process of a liquid changing into a gas at its surface', 'EVAPORATION'],
    [3, 'The splitting of one cell nucleus into two identical nuclei', 'MITOSIS'],
    [3, 'The _____ system includes the brain and spinal cord', 'NERVOUS'],
    [3, 'A substance that speeds a chemical reaction without being consumed', 'CATALYST'],
    [3, 'The gradual wearing away of land by wind or water', 'EROSION'],
    [3, 'The middle value in a sorted set of numbers', 'MEDIAN'],
    [3, 'An eight-sided polygon', 'OCTAGON'],
    [4, 'A manuscript page whose earlier writing was erased so it could be reused', 'PALIMPSEST'],
    [4, 'The figure of speech that names a whole by one of its parts', 'SYNECDOCHE'],
    [4, 'The use of a related name, such as the crown to mean royalty', 'METONYMY'],
    [4, 'The rhetorical reversal of phrase structure, as in live to learn and learn to live', 'CHIASMUS'],
    [4, 'A thing placed in a historical period where it does not belong', 'ANACHRONISM'],
    [4, 'An elevated heart rate, in medical terminology', 'TACHYCARDIA'],
    [4, 'A cell whose genetic material is enclosed in a nucleus', 'EUKARYOTE'],
    [4, 'The chromosome region where sister chromatids are joined', 'CENTROMERE'],
    [4, 'The chemical study of quantitative relationships between reactants and products', 'STOICHIOMETRY'],
    [4, 'An organism that obtains organic nutrients by consuming other organisms', 'HETEROTROPH'],
    [4, 'The regulation of water and dissolved salts within an organism', 'OSMOREGULATION'],
    [4, 'The point in an Earth orbit that is farthest from Earth', 'APOGEE'],
    [4, 'The point in an Earth orbit that is closest to Earth', 'PERIGEE'],
    [4, 'The process of a solid turning directly into a gas', 'SUBLIMATION'],
    [4, 'An antibody, using its formal protein-family name', 'IMMUNOGLOBULIN'],
    [4, 'The process of linking monomers into long molecular chains', 'POLYMERIZATION']
  ];
  const fallback = fallbackRows.map(function (row, index) {
    return Object.freeze({ id: 'curated-v1-' + (index + 1), tier: row[0], text: row[1], answer: row[2], length: row[2].length });
  });
  LD.CuratedClues = Object.freeze(fallback);
  const pageSeen = [null, new Set(), new Set(), new Set(), new Set()];
  const storagePrefix = 'lyric-defense.clues.v1.tier-';

  function usableBank(candidate) {
    if (!Array.isArray(candidate)) return null;
    const textGroups = new Map();
    const ids = new Set();
    candidate.forEach(function (row) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.text !== 'string' || !row.text.trim()) return;
      const answer = normalizeAnswer(row.answer);
      const tier = Number(row.tier);
      if (answer.length < 3 || answer.length > 15 || !Number.isInteger(tier) || tier < 1 || tier > 4) return;
      ids.add(row.id);
      const key = normalizeText(row.text);
      const prior = textGroups.get(key);
      if (prior === false) return;
      if (prior && prior.answer !== answer) { textGroups.set(key, false); return; }
      if (prior) { prior.tier = Math.min(prior.tier, tier); return; }
      textGroups.set(key, { id: row.id, text: row.text.trim(), answer: answer, tier: tier, length: answer.length });
    });
    const pools = [null, [], [], [], []];
    textGroups.forEach(function (row) { if (row) pools[row.tier].push(Object.freeze(row)); });
    return pools.slice(1).every(function (pool) { return pool.length > 0; }) ? pools : null;
  }

  function fallbackPools() {
    const pools = [null, [], [], [], []];
    fallback.forEach(function (row) { pools[row.tier].push(row); });
    return pools;
  }

  function shuffle(rows, random) {
    const result = rows.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const value = result[i]; result[i] = result[j]; result[j] = value;
    }
    return result;
  }

  function discoverStorage() {
    try { return root.localStorage || null; } catch (_) { return null; }
  }

  function ClueProvider(options) {
    options = options || {};
    this.pools = usableBank(LD.ClueBank);
    this.source = this.pools ? 'bundled' : 'curated';
    this.pools = this.pools || fallbackPools();
    this.counts = Object.freeze(this.pools.slice(1).map(function (pool) { return pool.length; }));
    this.storage = options.storage === undefined ? discoverStorage() : options.storage;
    this.shareMemory = options.storage !== null;
    this.seen = [null, new Set(), new Set(), new Set(), new Set()];
    this.decks = [null, [], [], [], []];
    this.positions = [0, 0, 0, 0, 0];
    this.random = LD.makeRandom ? LD.makeRandom(options.seed === undefined ? Date.now() : options.seed) : Math.random;
    for (let tier = 1; tier <= 4; tier++) {
      const validIds = new Set(this.pools[tier].map(function (row) { return row.id; }));
      if (this.shareMemory) pageSeen[tier].forEach(function (id) { if (validIds.has(id)) this.seen[tier].add(id); }, this);
      try {
        if (this.storage && typeof this.storage.getItem === 'function') {
          const serialized = this.storage.getItem(storagePrefix + tier);
          const stored = serialized && serialized.length <= 2000000 ? JSON.parse(serialized) : [];
          if (Array.isArray(stored)) stored.forEach(function (id) { if (typeof id === 'string' && validIds.has(id)) this.seen[tier].add(id); }, this);
        }
      } catch (_) { /* Storage may be blocked or contain an invalid previous value. */ }
      this.refill(tier, false);
    }
  }

  ClueProvider.prototype.refill = function (tier, recycle) {
    if (recycle) {
      this.seen[tier].clear();
      if (this.shareMemory) pageSeen[tier].clear();
    }
    const seen = this.seen[tier];
    this.decks[tier] = shuffle(this.pools[tier].filter(function (row) { return !seen.has(row.id); }), this.random);
    this.positions[tier] = 0;
  };

  ClueProvider.prototype.persist = function (tier) {
    if (this.shareMemory) pageSeen[tier] = new Set(this.seen[tier]);
    try {
      if (this.storage && typeof this.storage.setItem === 'function') this.storage.setItem(storagePrefix + tier, JSON.stringify(Array.from(this.seen[tier])));
    } catch (_) { /* The current page still remembers displayed clues without storage. */ }
  };

  ClueProvider.prototype.next = function (tier) {
    tier = Number(tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 4) throw new RangeError('Clue tier must be an integer from 1 to 4.');
    if (this.positions[tier] >= this.decks[tier].length) this.refill(tier, true);
    const row = this.decks[tier][this.positions[tier]++];
    this.seen[tier].add(row.id);
    this.persist(tier);
    return { id: row.id, text: row.text, answer: row.answer, tier: row.tier, length: row.length };
  };

  LD.ClueProvider = ClueProvider;
})(typeof globalThis !== 'undefined' ? globalThis : window);
