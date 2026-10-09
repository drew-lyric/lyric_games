(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  let runNumber = 0;
  LD.runTriviaTests = function () {
    const results = [], serial = ++runNumber;
    function assert(value, message) { if (!value) throw new Error(message || 'Assertion failed.'); }
    function test(name, callback) {
      try { callback(); results.push({ name: name, ok: true }); }
      catch (error) { results.push({ name: name, ok: false, error: error.message, stack: error.stack }); }
    }
    function withBank(bank, callback) {
      const previous = LD.TriviaBank;
      try { LD.TriviaBank = bank; callback(); } finally { LD.TriviaBank = previous; }
    }
    function syntheticBank(label) {
      const rows = [];
      for (let tier = 1; tier <= 4; tier++) ['R2-D2', 'Jane Austen', '1066'].forEach(function (answer, index) {
        rows.push({ id: 'trivia-test-' + serial + '-' + label + '-' + tier + '-' + index, text: 'Trivia test ' + serial + ' ' + label + ' ' + tier + ' ' + index, answer: answer, acceptedAnswers: [answer], tier: tier });
      });
      return rows;
    }
    test('Trivia fallback has 64 original questions, with 16 in every tier', function () {
      assert(Array.isArray(LD.CuratedTrivia) && LD.CuratedTrivia.length === 64);
      const ids = new Set(), texts = new Set(), counts = [0, 0, 0, 0];
      LD.CuratedTrivia.forEach(function (row) {
        const text = row.text.trim().toLowerCase().replace(/\s+/g, ' ');
        assert(!ids.has(row.id) && !texts.has(text), 'Repeated fallback question.');
        assert(typeof row.answer === 'string' && LD.normalizeTriviaAnswer(row.answer));
        assert(row.kind === 'trivia' && Array.isArray(row.acceptedAnswers) && row.acceptedAnswers.includes(row.answer));
        assert(Number.isInteger(row.tier) && row.tier >= 1 && row.tier <= 4);
        ids.add(row.id); texts.add(text); counts[row.tier - 1]++;
      });
      assert(counts.every(function (count) { return count === 16; }));
    });
    test('Trivia normalization folds case, accents, spaces, and ordinary punctuation', function () {
      const normalize = LD.normalizeTriviaAnswer;
      assert(normalize('  Gabriel García-Márquez ') === normalize('GABRIEL GARCIA MARQUEZ'));
      assert(normalize('R2-D2') === 'R2D2' && normalize('H2O') === 'H2O');
      assert(normalize('The Beatles') === normalize('Beatles'));
      assert(normalize('A') === 'A' && normalize('The The') === 'THETHE' && normalize('THE') === 'THE');
      assert(normalize(0) === '0' && normalize(null) === '' && normalize(undefined) === '');
      assert(normalize('Mars') !== normalize('Mar'), 'Substring acceptance is unsafe.');
    });
    test('Trivia normalization preserves meaningful numeric punctuation and digits', function () {
      const normalize = LD.normalizeTriviaAnswer;
      assert(normalize('4.2') !== normalize('42'));
      assert(normalize('4 / 6') === normalize('4/6') && normalize('4/6') !== normalize('46'));
      assert(normalize('-1') !== normalize('1'));
      assert(normalize('.5') === normalize('0.5') && normalize('-.5') === normalize('-0.5'));
      assert(normalize('.5') !== normalize('5') && normalize('12:30') !== normalize('1230'));
      assert(normalize('1940-1950') !== normalize('19401950'));
      assert(normalize('20,000') === normalize('20000'));
    });
    test('Trivia normalization distinguishes language symbols and Unicode negative numbers', function () {
      const normalize = LD.normalizeTriviaAnswer;
      assert(normalize('C++') !== normalize('C') && normalize('C#') !== normalize('C'));
      assert(normalize('C++') !== normalize('C#') && normalize('c + +') === normalize('C++'));
      assert(normalize('F\u266f') === normalize('F#') && normalize('F#') !== normalize('F'));
      assert(normalize('\u221240') === normalize('-40') && normalize('\u221240') !== normalize('40'));
      assert(normalize('1940\u20131950') === normalize('1940-1950'));
      assert(normalize('#025') === normalize('025'));
    });
    test('Missing or unusable trivia banks select the complete offline fallback', function () {
      [undefined, null, [], [{ id: 'broken', text: 'Broken', answer: '', tier: 1 }]].forEach(function (bank) {
        withBank(bank, function () {
          const provider = new LD.TriviaProvider({ seed: 20, storage: null });
          assert(provider.source === 'curated' && provider.counts.every(function (count) { return count === 16; }));
          [1, 2, 3, 4].forEach(function (tier) { const row = provider.next(tier); assert(row.tier === tier && row.kind === 'trivia'); });
        });
      });
    });
    test('Independent trivia seeds reproduce a mixed-tier sequence without shared history', function () {
      withBank(undefined, function () {
        const a = new LD.TriviaProvider({ seed: 502, storage: null }), b = new LD.TriviaProvider({ seed: 502, storage: null });
        [1, 4, 1, 2, 3, 1, 2, 4, 3, 3, 2, 1].forEach(function (tier) { assert(JSON.stringify(a.next(tier)) === JSON.stringify(b.next(tier))); });
      });
    });
    test('Trivia tiers recycle only when that tier is exhausted', function () {
      withBank(undefined, function () {
        const provider = new LD.TriviaProvider({ seed: 716, storage: null }), first = new Set(), second = new Set();
        for (let i = 0; i < 3; i++) second.add(provider.next(2).id);
        for (let i = 0; i < 16; i++) { const row = provider.next(1); assert(!first.has(row.id), 'Question repeated early.'); first.add(row.id); }
        assert(first.has(provider.next(1).id));
        for (let i = 3; i < 16; i++) { const row = provider.next(2); assert(!second.has(row.id), 'Another tier was recycled.'); second.add(row.id); }
        assert(second.size === 16 && second.has(provider.next(2).id));
      });
    });
    test('Trivia display history persists across matches in a separate storage namespace', function () {
      withBank(syntheticBank('persist'), function () {
        const saved = new Map([['lyric-defense.clues.v1.tier-3', '["crossword-preserved"]']]);
        const storage = { getItem: function (key) { return saved.get(key) || null; }, setItem: function (key, value) { saved.set(key, value); } };
        const first = new LD.TriviaProvider({ seed: 26, storage: storage }), id = first.next(3).id;
        const second = new LD.TriviaProvider({ seed: 26, storage: storage }), next = second.next(3).id;
        assert(next !== id);
        const ids = JSON.parse(saved.get('lyric-defense.trivia.v1.tier-3')); assert(ids.includes(id) && ids.includes(next));
        assert(saved.get('lyric-defense.clues.v1.tier-3') === '["crossword-preserved"]');
      });
    });
    test('Denied trivia storage and quota failures use current-page history safely', function () {
      withBank(syntheticBank('denied'), function () {
        const storage = { getItem: function () { throw new Error('Denied'); }, setItem: function () { throw new Error('Quota'); } };
        const first = new LD.TriviaProvider({ seed: 25, storage: storage }), id = first.next(4).id;
        const second = new LD.TriviaProvider({ seed: 25, storage: storage }); assert(second.next(4).id !== id);
      });
    });
    test('Malformed trivia histories and unknown IDs cannot prevent selection', function () {
      withBank(syntheticBank('history'), function () {
        ['{', '{"bad":true}', '[null,12,"unknown-id"]'].forEach(function (serialized) {
          const storage = { getItem: function () { return serialized; }, setItem: function () {} };
          assert(new LD.TriviaProvider({ seed: 23, storage: storage }).next(1).kind === 'trivia');
        });
      });
    });
    test('Trivia validation removes globally conflicting prompts and deduplicates equivalent ones', function () {
      const bank = syntheticBank('conflict');
      bank.push({ id: 'conflict-a-' + serial, text: ' Common capital ', answer: 'Paris', tier: 1 });
      bank.push({ id: 'conflict-b-' + serial, text: 'common   capital', answer: 'London', tier: 2 });
      bank.push({ id: 'duplicate-a-' + serial, text: 'Identical question', answer: 'The Beatles', tier: 3 });
      bank.push({ id: 'duplicate-b-' + serial, text: 'identical question', answer: 'Beatles', tier: 2 });
      withBank(bank, function () { const provider = new LD.TriviaProvider({ seed: 76, storage: null }); assert(JSON.stringify(provider.counts) === '[3,4,3,3]'); });
    });
    test('Trivia provider caches validated pools by bank reference and copies returned aliases', function () {
      withBank(syntheticBank('cache'), function () {
        const first = new LD.TriviaProvider({ seed: 8, storage: null }), second = new LD.TriviaProvider({ seed: 8, storage: null });
        assert(first.pools === second.pools, 'Large bank validation repeated.');
        const row = first.next(1); row.acceptedAnswers.push('BAD MUTATION');
        assert(!second.next(1).acceptedAnswers.includes('BAD MUTATION'));
      });
    });
    test('Expanded trivia bank contains 5,000 distinct questions and complete no-repeat tiers', function () {
      assert(Array.isArray(LD.TriviaBank), 'Expanded bank was not loaded.');
      assert(LD.TriviaBank.length === 5000, 'Expanded bank must contain 5,000 questions.');
      const ids = new Set(), texts = new Set(), counts = [0, 0, 0, 0];
      LD.TriviaBank.forEach(function (row) {
        const text = row.text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
        assert(typeof row.id === 'string' && !ids.has(row.id) && !texts.has(text));
        assert(typeof row.answer === 'string' && row.answer.length <= 512 && LD.normalizeTriviaAnswer(row.answer));
        assert(row.text.length <= 400 && Array.isArray(row.acceptedAnswers) && row.acceptedAnswers.includes(row.answer));
        assert(Number.isInteger(row.tier) && row.tier >= 1 && row.tier <= 4);
        ids.add(row.id); texts.add(text); counts[row.tier - 1]++;
      });
      assert(counts.every(function (count) { return count >= 400; }), 'An expanded difficulty tier is too small.');
      assert(LD.TriviaBankInfo && LD.TriviaBankInfo.count === 5000, 'Expanded bank metadata missing.');
      assert(JSON.stringify(LD.TriviaBankInfo.tierCounts) === JSON.stringify(counts), 'Tier metadata disagrees with the bank.');
      const provider = new LD.TriviaProvider({ seed: 117, storage: null });
      assert(provider.source === 'bundled' && JSON.stringify(provider.counts) === JSON.stringify(counts), 'Expanded bank is not active.');
      for (let tier = 1; tier <= 4; tier++) {
        const displayed = new Set();
        for (let i = 0; i < counts[tier - 1]; i++) {
          const question = provider.next(tier);
          assert(!displayed.has(question.id), 'Expanded question repeated before tier exhaustion.');
          displayed.add(question.id);
        }
        assert(displayed.has(provider.next(tier).id), 'Expanded tier failed to recycle after exhaustion.');
      }
    });
    return results;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

if (typeof module !== 'undefined' && module.exports && require.main === module) {
  require('../js/config.js');
  try { require('../js/trivia-expanded-bank.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  require('../js/trivia.js');
  const results = globalThis.LyricDefense.runTriviaTests();
  results.forEach(function (result) { console.log((result.ok ? 'PASS ' : 'FAIL ') + result.name + (result.error ? '\n     ' + result.error : '')); });
  console.log(results.filter(function (result) { return result.ok; }).length + '/' + results.length + ' trivia checks passed.');
  process.exitCode = results.every(function (result) { return result.ok; }) ? 0 : 1;
}
