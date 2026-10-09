'use strict';

// Optional maintainer tool. The game uses the checked-in classic JavaScript bank.
// Usage: node scripts/import-clues.js
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const REPOSITORY = 'tamino-martinius/node-open-crossword-bank';
const COMMIT = 'b82d6a3899db8437366b618d3c217e9eb942de99';
const EXPECTED_COUNT = 44968;
const MANIFEST = [
  ['len-10/tier-1.ts', 'd79ddc1555d85392a079cb94fe9c25624154933e'],
  ['len-10/tier-2.ts', 'a47d65623fef61b0e5b2224b302a8cc41a63b7cd'],
  ['len-11/tier-1.ts', '6d076838c2ac5ea715282499889c5678a083f7ae'],
  ['len-11/tier-2.ts', 'f9b5d2f8c21e39e7bb6ed8de278b0e426dce9520'],
  ['len-12/tier-1.ts', 'fc0c46346934b2d5fc0cfbc195334f1ba291d5ee'],
  ['len-12/tier-2.ts', '00246a3c118c5a6d7df84489e174fe12f949fe3a'],
  ['len-13/tier-1.ts', 'f86d5a0264c9f2d8e43eb9e352109afeb4651d79'],
  ['len-13/tier-2.ts', '2df48c12993a044ccf7359a6dd3d11216b8ff5f5'],
  ['len-14/tier-1.ts', '65a0f4e7bc304cb9debde4373f8e981b9b69a4cf'],
  ['len-14/tier-2.ts', '7537a425e715903a9c8bac923edbbe499b4b5d57'],
  ['len-15/tier-1.ts', '491fbbca5ebbf1005ff3dc4b78504bda82c91007'],
  ['len-15/tier-2.ts', '1d58488a3fa2ee89e395094adb224391e5254de1'],
  ['len-3/tier-1.ts', '2c9aa58a0f11a4c2ff52dd1d9ee2f340b991c2d0'],
  ['len-3/tier-2.ts', '8174e2f320091ad7fd8420150d433726bed376d8'],
  ['len-4/tier-1.ts', 'ab0f61d49a27f79bbd881fa9901df089ab79c2d7'],
  ['len-5/tier-1.ts', '4cac71a020e79b015afe9ab417847ab5b3a91926'],
  ['len-6/tier-1.ts', '2ecf7595309c937ff79001cf1defaa64f2367506'],
  ['len-7/tier-1.ts', '6d496161e4401b125e1f708f35af8b084f2c8d63'],
  ['len-8/tier-1.ts', '8491088d171e71639c20f85b9ac2ec26f8e1c591'],
  ['len-9/tier-1.ts', '668ffcea8a5a19401beeb196fb17ade68f2b7b13'],
  ['len-9/tier-2.ts', 'dae65ed7865401ffe5b50cc69f9f3c219e698f8b']
];

function normalizeAnswer(value) {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
}

function normalizeText(value) { return value.trim().toLowerCase().replace(/\s+/g, ' '); }

function gitBlobSha(bytes) {
  return crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}

function parseLeaf(source) {
  // The pinned generator emits one JSON object per line. Parse data; never eval TS.
  if (!/export const ENTRIES: readonly EnrichedEntry\[\] = \[/.test(source)) throw new Error('Unexpected clue leaf format.');
  const rows = source.split(/\r?\n/).filter(function (line) { return /^\s*\{/.test(line); });
  if (!rows.length) throw new Error('Empty clue leaf.');
  return rows.map(function (line) { return JSON.parse(line.trim().replace(/,$/, '')); });
}

function convertEntries(entries) {
  const groups = new Map();
  const sourceIds = new Set();
  entries.forEach(function (entry) {
    if (!entry || typeof entry.id !== 'string' || sourceIds.has(entry.id) || entry.lang !== 'en' || typeof entry.word !== 'string' || !Array.isArray(entry.clues)) throw new Error('Malformed or duplicate source entry.');
    sourceIds.add(entry.id);
    const answer = normalizeAnswer(entry.word);
    if (!/^[A-Z]{3,15}$/.test(answer) || entry.length !== answer.length) throw new Error('Unsupported source answer: ' + entry.id);
    entry.clues.forEach(function (clue, index) {
      if (!clue || typeof clue.text !== 'string' || !clue.text.trim() || ![1, 2, 3, 4, 5].includes(clue.difficulty)) throw new Error('Malformed source clue: ' + entry.id);
      const key = normalizeText(clue.text);
      const row = { id: 'ocb:' + entry.id + ':' + index, text: clue.text.trim(), answer: answer, tier: Math.min(clue.difficulty, 4), length: answer.length, difficulty: clue.difficulty };
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
  });
  let excludedGroups = 0;
  let excludedVariants = 0;
  let duplicateVariants = 0;
  const rows = [];
  groups.forEach(function (variants) {
    if (new Set(variants.map(function (row) { return row.answer; })).size > 1) { excludedGroups++; excludedVariants += variants.length; return; }
    variants.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    const first = variants[0];
    const difficulty = Math.min.apply(null, variants.map(function (row) { return row.difficulty; }));
    rows.push({ id: first.id, text: first.text, answer: first.answer, tier: Math.min(difficulty, 4), length: first.length });
    duplicateVariants += variants.length - 1;
  });
  rows.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return { rows: rows, excludedGroups: excludedGroups, excludedVariants: excludedVariants, duplicateVariants: duplicateVariants };
}

function validateOutput(rows) {
  const ids = new Set();
  const texts = new Set();
  const counts = [0, 0, 0, 0];
  rows.forEach(function (row) {
    const key = normalizeText(row.text);
    if (ids.has(row.id) || texts.has(key) || !/^[A-Z]{3,15}$/.test(row.answer) || row.length !== row.answer.length || ![1, 2, 3, 4].includes(row.tier)) throw new Error('Invalid generated clue: ' + row.id);
    ids.add(row.id); texts.add(key); counts[row.tier - 1]++;
  });
  if (counts.some(function (count) { return count === 0; })) throw new Error('Every clue tier must contain records.');
  return counts;
}

async function download(relativePath) {
  const url = 'https://raw.githubusercontent.com/' + REPOSITORY + '/' + COMMIT + '/' + relativePath;
  const response = await fetch(url, { headers: { 'User-Agent': 'LyricDefenseClueImporter' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Download failed: ' + response.status + ' ' + url);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const entries = [];
  for (let start = 0; start < MANIFEST.length; start += 4) {
    await Promise.all(MANIFEST.slice(start, start + 4).map(async function (leaf) {
      const bytes = await download('src/data/en/enriched/' + leaf[0]);
      if (gitBlobSha(bytes) !== leaf[1]) throw new Error('Pinned file integrity check failed: ' + leaf[0]);
      entries.push.apply(entries, parseLeaf(bytes.toString('utf8')));
    }));
  }
  const result = convertEntries(entries);
  const counts = validateOutput(result.rows);
  if (result.rows.length !== EXPECTED_COUNT) throw new Error('Unexpected bank size; expected ' + EXPECTED_COUNT + ', received ' + result.rows.length + '.');
  const license = await download('src/data/LICENSE');
  if (!license.toString('utf8').startsWith('The crossword word bank data in this directory is dedicated to the public domain under CC0 1.0 Universal.')) throw new Error('Unexpected source data license.');
  const workspace = path.resolve(__dirname, '..');
  const bankPath = path.join(workspace, 'js', 'clue-bank.js');
  const licensePath = path.join(workspace, 'assets', 'clues', 'LICENSE.txt');
  const output = '// Generated by scripts/import-clues.js. Data: CC0 1.0. See assets/clues/SOURCE.md.\n' +
    '// Pinned source: ' + REPOSITORY + '@' + COMMIT + '\n' +
    '(function (root) {\n  \'use strict\';\n  const LD = root.LyricDefense = root.LyricDefense || {};\n  LD.ClueBank = [\n' +
    result.rows.map(function (row) { return '    ' + JSON.stringify(row); }).join(',\n') + '\n  ];\n})(typeof globalThis !== \'undefined\' ? globalThis : window);\n';
  // Download, integrity, schema, coverage, and final-size checks finish before writes.
  fs.mkdirSync(path.dirname(bankPath), { recursive: true });
  fs.mkdirSync(path.dirname(licensePath), { recursive: true });
  fs.writeFileSync(bankPath, output, 'utf8');
  fs.writeFileSync(licensePath, license);
  console.log('Bundled ' + result.rows.length + ' clues; tiers: ' + counts.join(', ') + '.');
  console.log('Excluded ' + result.excludedVariants + ' ambiguous variants; consolidated ' + result.duplicateVariants + ' duplicate variant.');
}

module.exports = { COMMIT, MANIFEST, normalizeAnswer, normalizeText, gitBlobSha, parseLeaf, convertEntries, validateOutput };
if (require.main === module) main().catch(function (error) { console.error(error.message); process.exitCode = 1; });
