(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  let runNumber = 0;

  LD.runClueTests = function () {
    const results = [];
    const serial = ++runNumber;
    const assert = function (value, message) { if (!value) throw new Error(message || 'Assertion failed.'); };
    const test = function (name, callback) {
      try { callback(); results.push({ name: name, ok: true }); }
      catch (error) { results.push({ name: name, ok: false, error: error.message, stack: error.stack }); }
    };
    const withBank = function (bank, callback) {
      const previous = LD.ClueBank;
      try { LD.ClueBank = bank; callback(); }
      finally { LD.ClueBank = previous; }
    };
    const syntheticBank = function (label) {
      const rows = [];
      for (let tier = 1; tier <= 4; tier++) {
        ['CAT', 'DOG', 'FOX'].forEach(function (answer, index) {
          rows.push({ id: 'test-' + serial + '-' + label + '-' + tier + '-' + index, text: 'Test ' + serial + ' ' + label + ' ' + tier + ' ' + index, answer: answer, tier: tier, length: answer.length });
        });
      }
      return rows;
    };

    test('Curated fallback contains 64 original, normalized clues and 16 per tier', function () {
      assert(Array.isArray(LD.CuratedClues) && LD.CuratedClues.length === 64);
      const ids = new Set(), texts = new Set(), counts = [0, 0, 0, 0];
      LD.CuratedClues.forEach(function (row) {
        const text = row.text.trim().toLowerCase().replace(/\s+/g, ' ');
        assert(!ids.has(row.id) && !texts.has(text), 'Repeated fallback clue.');
        assert(/^[A-Z]{3,15}$/.test(row.answer) && row.length === row.answer.length);
        assert(Number.isInteger(row.tier) && row.tier >= 1 && row.tier <= 4);
        ids.add(row.id); texts.add(text); counts[row.tier - 1]++;
      });
      assert(counts.every(function (count) { return count === 16; }));
    });

    test('Unavailable or unusable banks select the complete offline fallback', function () {
      [undefined, null, [], [{ id: 'bad', text: 'Broken record', answer: '', tier: 1 }]].forEach(function (bank) {
        withBank(bank, function () {
          const provider = new LD.ClueProvider({ seed: 10, storage: null });
          assert(provider.source === 'curated');
          assert(provider.counts.every(function (count) { return count === 16; }));
          [1, 2, 3, 4].forEach(function (tier) { assert(provider.next(tier).tier === tier); });
        });
      });
    });

    test('Fallback seed gives repeatable independent mixed-tier sequences', function () {
      withBank(undefined, function () {
        const a = new LD.ClueProvider({ seed: 502, storage: null });
        const b = new LD.ClueProvider({ seed: 502, storage: null });
        [1, 4, 1, 2, 3, 1, 2, 4, 3, 3, 2, 1].forEach(function (tier) {
          assert(JSON.stringify(a.next(tier)) === JSON.stringify(b.next(tier)), 'Seeded sequence changed.');
        });
      });
    });

    test('Only an exhausted requested tier recycles its deck', function () {
      withBank(undefined, function () {
        const provider = new LD.ClueProvider({ seed: 716, storage: null });
        const tierOne = new Set(), tierTwo = new Set();
        for (let i = 0; i < 3; i++) tierTwo.add(provider.next(2).id);
        for (let i = 0; i < 16; i++) {
          const row = provider.next(1);
          assert(!tierOne.has(row.id), 'Tier 1 repeated before exhaustion.'); tierOne.add(row.id);
        }
        assert(tierOne.has(provider.next(1).id), 'Exhausted tier did not recycle.');
        for (let i = 3; i < 16; i++) {
          const row = provider.next(2);
          assert(!tierTwo.has(row.id), 'Recycling tier 1 reset tier 2.'); tierTwo.add(row.id);
        }
        assert(tierTwo.size === 16 && tierTwo.has(provider.next(2).id));
      });
    });

    test('Displayed IDs persist into another match and cannot repeat early', function () {
      withBank(syntheticBank('persist'), function () {
        const saved = new Map();
        const storage = { getItem: function (key) { return saved.get(key) || null; }, setItem: function (key, value) { saved.set(key, value); } };
        const first = new LD.ClueProvider({ seed: 26, storage: storage });
        const displayed = first.next(3).id;
        const second = new LD.ClueProvider({ seed: 26, storage: storage });
        const another = second.next(3).id;
        assert(another !== displayed, 'Persisted clue repeated before tier exhaustion.');
        const ids = JSON.parse(saved.get('lyric-defense.clues.v1.tier-3'));
        assert(ids.includes(displayed) && ids.includes(another), 'Displayed IDs were not saved.');
      });
    });

    test('Denied reads and quota failures still preserve current-page history', function () {
      withBank(syntheticBank('denied'), function () {
        const denied = { getItem: function () { throw new Error('Storage denied.'); }, setItem: function () { throw new Error('Quota exceeded.'); } };
        const first = new LD.ClueProvider({ seed: 45, storage: denied });
        const displayed = first.next(4).id;
        const second = new LD.ClueProvider({ seed: 45, storage: denied });
        assert(second.next(4).id !== displayed, 'Memory fallback lost current-page history.');
      });
    });

    test('Malformed saved data and unknown IDs do not prevent clue selection', function () {
      withBank(syntheticBank('saved-data'), function () {
        ['{', '{"bad":true}', '[null,12,"unknown-id"]'].forEach(function (serialized) {
          const storage = { getItem: function () { return serialized; }, setItem: function () {} };
          const provider = new LD.ClueProvider({ seed: 89, storage: storage });
          assert(provider.next(1).answer.length === 3);
        });
      });
    });

    test('Runtime bank validation removes conflicting clue texts across lengths', function () {
      const bank = syntheticBank('ambiguous');
      bank.push({ id: 'test-cat-conflict-' + serial, text: ' Common PET ', answer: 'CAT', tier: 1 });
      bank.push({ id: 'test-elephant-conflict-' + serial, text: 'common   pet', answer: 'ELEPHANT', tier: 2 });
      withBank(bank, function () {
        const provider = new LD.ClueProvider({ seed: 201, storage: null });
        assert(provider.source === 'bundled');
        assert(provider.counts.every(function (count) { return count === 3; }), 'Ambiguous variants remained.');
      });
    });

    test('Imported local bank has the exact pinned size and canonical schema', function () {
      if (!LD.ClueBank) return;
      const counts = [0, 0, 0, 0];
      assert(LD.ClueBank.length === 44968, 'Unexpected pinned bank size.');
      LD.ClueBank.forEach(function (row) {
        assert(typeof row.id === 'string' && typeof row.text === 'string' && row.text.trim());
        assert(/^[A-Z]{3,15}$/.test(row.answer) && row.answer.length === row.length);
        assert(Number.isInteger(row.tier) && row.tier >= 1 && row.tier <= 4);
        counts[row.tier - 1]++;
      });
      assert(JSON.stringify(counts) === '[7467,20733,13054,3714]', 'Pinned tier counts changed.');
    });
    return results;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
