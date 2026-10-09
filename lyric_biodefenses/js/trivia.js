(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};

  // Exact whole-answer matching, with numeric separators kept meaningful.
  function normalizeTriviaAnswer(value) {
    let text = String(value === undefined || value === null ? '' : value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\u2212\u2010-\u2014]/g, '-').replace(/\u266f/g, '#');
    text = text.replace(/[^A-Z0-9+#./:\-]+/g, ' ').trim();
    if (/^THE\s+/.test(text) && text.replace(/^THE\s+/, '') !== 'THE') text = text.replace(/^THE\s+/, '');
    text = text.replace(/\s+/g, '').replace(/^(\-?)\.(?=\d)/, '$10.');
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      if (/[A-Z0-9]/.test(character)) result += character;
      else if (character === '+' && /[A-Z0-9+]/.test(text[i - 1] || '')) result += character;
      else if (character === '#' && /[A-Z]/.test(text[i - 1] || '')) result += character;
      else if (/[./:\-]/.test(character) && /[0-9]/.test(text[i + 1] || '') && (/[0-9]/.test(text[i - 1] || '') || (character === '-' && i === 0))) result += character;
    }
    return result;
  }
  LD.normalizeTriviaAnswer = normalizeTriviaAnswer;

  // Independent original fallback: familiar tiers1/2 and harder tiers3/4.
  const fallbackRows = [
    [1,"What is the capital city of France?","Paris",[]],
    [1,"Which planet is nicknamed the Red Planet?","Mars",[]],
    [1,"How many legs does a spider normally have?","8",["Eight"]],
    [1,"Which organ pumps blood around the human body?","Heart",["The heart"]],
    [1,"In basic paint mixing, what colour do blue and yellow make?","Green",[]],
    [1,"How many days make up one week?","7",["Seven"]],
    [1,"Which large land animal has tusks and a long trunk?","Elephant",["An elephant","Elephants"]],
    [1,"Which ocean borders California's coastline?","Pacific Ocean",["Pacific","The Pacific"]],
    [1,"How many months are in a calendar year?","12",["Twelve"]],
    [1,"What sweet food do honeybees produce?","Honey",[]],
    [1,"What shape has exactly three straight sides?","Triangle",["A triangle"]],
    [1,"What do we call water when it freezes solid?","Ice",[]],
    [1,"Which storybook puppet's nose grows when he lies?","Pinocchio",[]],
    [1,"Winnie-the-Pooh is what kind of animal?","Bear",["A bear"]],
    [1,"Which sport does the NBA play?","Basketball",[]],
    [1,"What is Italy's capital city?","Rome",[]],
    [2,"What is the capital of Japan?","Tokyo",[]],
    [2,"Which musical instrument normally has 88 black-and-white keys?","Piano",["A piano"]],
    [2,"At the start of a standard soccer match, how many players are on the field for each team?","11",["Eleven"]],
    [2,"Who wrote the play Hamlet? A surname is enough.","William Shakespeare",["Shakespeare"]],
    [2,"Who wrote the Harry Potter books? A surname is enough.","J. K. Rowling",["JK Rowling","Rowling","Joanne Rowling"]],
    [2,"Which chemical element has the symbol Au?","Gold",[]],
    [2,"Wimbledon's tennis courts have what playing surface?","Grass",["Grass courts"]],
    [2,"The ruins of Machu Picchu are in which country?","Peru",[]],
    [2,"Which planet is the largest in our solar system?","Jupiter",[]],
    [2,"What is the name of the young lion who becomes king in Disney's The Lion King?","Simba",[]],
    [2,"How many dwarfs live with Snow White in the classic Disney film?","7",["Seven"]],
    [2,"Which country is often nicknamed the Land Down Under?","Australia",[]],
    [2,"Which planet is best known for its large, visible rings?","Saturn",[]],
    [2,"In what year did the United States adopt the Declaration of Independence?","1776",["Seventeen seventy-six","Seventeen seventy six"]],
    [2,"What is the most abundant gas in Earth's atmosphere?","Nitrogen",[]],
    [2,"Which continent contains both China and India?","Asia",[]],
    [3,"Who wrote the novel The Trial? A surname is enough.","Franz Kafka",["Kafka"]],
    [3,"Which chemical element has the symbol W?","Tungsten",["Wolfram"]],
    [3,"Titan is the largest moon of which planet?","Saturn",[]],
    [3,"Who wrote Brave New World? A surname is enough.","Aldous Huxley",["Huxley"]],
    [3,"Which river flows through Budapest?","Danube",["Danube River","The Danube"]],
    [3,"What is the capital city of New Zealand?","Wellington",[]],
    [3,"Which atmospheric layer contains most of Earth's ozone layer?","Stratosphere",["The stratosphere"]],
    [3,"Who composed the ballet Swan Lake? A surname is enough.","Pyotr Ilyich Tchaikovsky",["Tchaikovsky","Pyotr Tchaikovsky","Peter Tchaikovsky","Peter Ilyich Tchaikovsky","Pyotr Ilich Tchaikovsky"]],
    [3,"What boundary around a black hole marks the point beyond which light cannot escape?","Event horizon",["The event horizon"]],
    [3,"Which treaty signed in 1919 imposed postwar peace terms on Germany?","Treaty of Versailles",["Versailles","Versailles Treaty"]],
    [3,"What is the name of the SI unit of electrical resistance?","Ohm",["Ohms"]],
    [3,"Which astronomer formulated the three laws of planetary motion? A surname is enough.","Johannes Kepler",["Kepler"]],
    [3,"Who painted Guernica? A surname is enough.","Pablo Picasso",["Picasso"]],
    [3,"Who wrote Things Fall Apart? A surname is enough.","Chinua Achebe",["Achebe"]],
    [3,"Kathmandu is the capital of which country?","Nepal",[]],
    [3,"What is the geometric name for a polygon with twelve sides?","Dodecagon",["A dodecagon"]],
    [4,"What is the capital city of Kyrgyzstan?","Bishkek",[]],
    [4,"Which treaty ended the Russo-Japanese War in 1905?","Treaty of Portsmouth",["Portsmouth","Portsmouth Treaty","Portsmouth Peace Treaty"]],
    [4,"Which scientist proposed continental drift in 1912? A surname is enough.","Alfred Wegener",["Wegener","Alfred Lothar Wegener"]],
    [4,"Which chemical element has the symbol Sb?","Antimony",[]],
    [4,"Which Italian composer left Turandot unfinished at his death in 1924? A surname is enough.","Giacomo Puccini",["Puccini"]],
    [4,"Who wrote The Master and Margarita? A surname is enough.","Mikhail Bulgakov",["Bulgakov"]],
    [4,"What is the Japanese art of repairing broken pottery with gold lacquer called?","Kintsugi",["Kintsukuroi"]],
    [4,"Which Danish astronomer's planetary observations helped Kepler develop his laws?","Tycho Brahe",["Brahe","Tycho"]],
    [4,"What is the capital city of Bhutan?","Thimphu",["Thimpu"]],
    [4,"What is the largest bundle of nerve fibres connecting the brain's two cerebral hemispheres?","Corpus callosum",["The corpus callosum"]],
    [4,"Who proved Fermat's Last Theorem in the 1990s? A surname is enough.","Andrew Wiles",["Wiles","Andrew John Wiles","Andrew J. Wiles","Sir Andrew Wiles"]],
    [4,"Which ancient Greek scholar estimated Earth's circumference using shadows at two cities?","Eratosthenes",["Eratosthenes of Cyrene"]],
    [4,"What is the name of Neptune's largest moon?","Triton",[]],
    [4,"Finnish, Estonian, and Hungarian belong to which language family?","Uralic",["Uralic languages","Uralic language family","Finno-Ugric","Finno-Ugrian","Finno Ugric","Finno Ugrian"]],
    [4,"Which physicist gives his name to the quantum exclusion principle? A surname is enough.","Wolfgang Pauli",["Pauli"]],
    [4,"What name is given to the cycle of rebirth in Hindu and Buddhist traditions?","Samsara",[]]
  ];
  const fallback = fallbackRows.map(function (row, index) {
    return Object.freeze({ id: 'trivia-curated-v3-' + String(index + 1).padStart(3, '0'), text: row[1], answer: row[2], acceptedAnswers: Object.freeze([row[2]].concat(row[3] || [])), tier: row[0], kind: 'trivia' });
  });
  LD.CuratedTrivia = Object.freeze(fallback);
  const cache = new WeakMap();
  const pageSeen = [null, new Set(), new Set(), new Set(), new Set()];
  const storagePrefix = 'lyric-defense.trivia.v1.tier-';
  const normalizeText = function (value) { return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '); };

  function usableBank(candidate) {
    if (!Array.isArray(candidate)) return null;
    if (cache.has(candidate)) return cache.get(candidate);
    const groups = new Map(), ids = new Set();
    candidate.forEach(function (row) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.text !== 'string' || !row.text.trim() || row.text.length > 2048 || typeof row.answer !== 'string' || !row.answer.trim() || row.answer.length > 512 || !normalizeTriviaAnswer(row.answer) || !Number.isInteger(row.tier) || row.tier < 1 || row.tier > 4) return;
      ids.add(row.id);
      const key = normalizeText(row.text), normalized = normalizeTriviaAnswer(row.answer), prior = groups.get(key);
      if (prior === false) return;
      if (prior && normalizeTriviaAnswer(prior.answer) !== normalized) { groups.set(key, false); return; }
      const aliases = [row.answer].concat(Array.isArray(row.acceptedAnswers) ? row.acceptedAnswers : []).filter(function (alias) { return typeof alias === 'string' && alias.trim() && alias.length <= 512 && normalizeTriviaAnswer(alias); }).slice(0, 32);
      if (prior) { prior.tier = Math.min(prior.tier, row.tier); prior.acceptedAnswers = Array.from(new Set(prior.acceptedAnswers.concat(aliases))).slice(0, 32); }
      else groups.set(key, { id: row.id, text: row.text.trim(), answer: row.answer.trim(), acceptedAnswers: aliases, tier: row.tier, kind: 'trivia' });
    });
    const pools = [null, [], [], [], []], validIds = [null, new Set(), new Set(), new Set(), new Set()];
    groups.forEach(function (row) {
      if (!row) return;
      Object.freeze(row.acceptedAnswers); pools[row.tier].push(Object.freeze(row)); validIds[row.tier].add(row.id);
    });
    const result = pools.slice(1).every(function (pool) { return pool.length > 0; }) ? { pools: pools, ids: validIds } : null;
    cache.set(candidate, result);
    return result;
  }
  const fallbackData = usableBank(fallback);
  function discoverStorage() { try { return root.localStorage || null; } catch (_) { return null; } }
  function shuffle(rows, random) {
    const result = rows.slice();
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)), value = result[i]; result[i] = result[j]; result[j] = value; }
    return result;
  }
  function TriviaProvider(options) {
    options = options || {};
    const data = usableBank(LD.TriviaBank);
    this.source = data ? 'bundled' : 'curated';
    const selected = data || fallbackData;
    this.pools = selected.pools;
    this.counts = Object.freeze(this.pools.slice(1).map(function (pool) { return pool.length; }));
    this.storage = options.storage === undefined ? discoverStorage() : options.storage;
    this.shareMemory = options.storage !== null;
    this.seen = [null, new Set(), new Set(), new Set(), new Set()];
    this.decks = [null, [], [], [], []];
    this.positions = [0, 0, 0, 0, 0];
    this.random = LD.makeRandom ? LD.makeRandom(options.seed === undefined ? Date.now() : options.seed) : Math.random;
    for (let tier = 1; tier <= 4; tier++) {
      const validIds = selected.ids[tier];
      if (this.shareMemory) pageSeen[tier].forEach(function (id) { if (validIds.has(id)) this.seen[tier].add(id); }, this);
      try {
        if (this.storage && typeof this.storage.getItem === 'function') {
          const serialized = this.storage.getItem(storagePrefix + tier);
          const stored = serialized && serialized.length <= 2000000 ? JSON.parse(serialized) : [];
          if (Array.isArray(stored)) stored.forEach(function (id) { if (typeof id === 'string' && validIds.has(id)) this.seen[tier].add(id); }, this);
        }
      } catch (_) { /* Storage denial or old malformed history does not prevent play. */ }
      this.refill(tier, false);
    }
  }
  TriviaProvider.prototype.refill = function (tier, recycle) {
    if (recycle) { this.seen[tier].clear(); if (this.shareMemory) pageSeen[tier].clear(); }
    const seen = this.seen[tier];
    this.decks[tier] = shuffle(this.pools[tier].filter(function (row) { return !seen.has(row.id); }), this.random);
    this.positions[tier] = 0;
  };
  TriviaProvider.prototype.persist = function (tier) {
    if (this.shareMemory) pageSeen[tier] = new Set(this.seen[tier]);
    try { if (this.storage && typeof this.storage.setItem === 'function') this.storage.setItem(storagePrefix + tier, JSON.stringify(Array.from(this.seen[tier]))); }
    catch (_) { /* The page still remembers displayed questions when storage is full. */ }
  };
  TriviaProvider.prototype.next = function (tier) {
    tier = Number(tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 4) throw new RangeError('Trivia tier must be an integer from 1 to 4.');
    if (this.positions[tier] >= this.decks[tier].length) this.refill(tier, true);
    const row = this.decks[tier][this.positions[tier]++];
    this.seen[tier].add(row.id); this.persist(tier);
    return { id: row.id, text: row.text, answer: row.answer, acceptedAnswers: row.acceptedAnswers.slice(), tier: row.tier, kind: 'trivia' };
  };
  LD.TriviaProvider = TriviaProvider;
})(typeof globalThis !== 'undefined' ? globalThis : window);
