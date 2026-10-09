'use strict';

// Optional regeneration tool; shipped gameplay needs only the resulting JS bank.
// Reads the author's hash-pinned no-context Parquet mirror as data. The small
// vendored MIT reader is used only here, never by browser gameplay or the host.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const COMMIT = 'ca43b5820b107f3970cf4b7d67f7db7a98117b79';
const REPOSITORY = 'https://raw.githubusercontent.com/mandarjoshi90/triviaqa/' + COMMIT + '/';
const MIRROR_REVISION = '0f7faf33a3908546c6fd5b73a660e0f8ff173c2f';
const MIRROR_URL = 'https://huggingface.co/datasets/mandarjoshi/trivia_qa/resolve/' + MIRROR_REVISION + '/';
const SOURCE_FILES = [
  { path: 'unfiltered.nocontext/train-00000-of-00001.parquet', bytes: 33210864, sha256: '0a7253ec32dbf5b6fb07d71ce344d028e38f9cf86a27082033ce8957f5709100' },
  { path: 'unfiltered.nocontext/validation-00000-of-00001.parquet', bytes: 4390956, sha256: '58925ac87e2e2031154899e9c1226f15d81e1675237da1a308e234b77b7bdcaf' }
];
const ROOT = path.resolve(__dirname, '..');
require('../js/trivia.js');
const normalizeAnswer = globalThis.LyricDefense.normalizeTriviaAnswer;
const normalizeText = function (value) { return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '); };
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function displayText(value) {
  return String(value || '').replace(/&(?:quot|#34);/g, '"').replace(/&(?:apos|#39);/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, function (_, digits) { const number = Number(digits); return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ''; }).replace(/\s+/g, ' ').trim();
}
function answerWords(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/);
}
function conservativeAlias(canonical, alias) {
  if (normalizeAnswer(canonical) === normalizeAnswer(alias)) return true;
  const base = answerWords(canonical), candidate = answerWords(alias);
  // Only inserted single-letter middle initials are accepted beyond equivalent
  // spelling. Entity redirects, nicknames, shorter substrings, and titles are not.
  if (base.length < 2 || candidate.length <= base.length || base.some(function (word) { return word.length < 2; }) || candidate[0] !== base[0] || candidate[candidate.length - 1] !== base[base.length - 1]) return false;
  let position = 0;
  for (const word of candidate) {
    if (word === base[position]) position++;
    else if (position === 0 || position >= base.length || !/^[A-Z]$/.test(word)) return false;
  }
  return position === base.length;
}
function compactRecord(row) {
  if (!row || typeof row.Question !== 'string' || typeof row.QuestionId !== 'string' || !row.Answer || typeof row.Answer.Value !== 'string') return null;
  const answer = displayText(row.Answer.Value);
  const aliases = (Array.isArray(row.Answer.Aliases) ? row.Answer.Aliases : []).filter(function (alias) { return typeof alias === 'string' && alias.length <= 512 && conservativeAlias(answer, displayText(alias)); }).map(displayText);
  return { QuestionId: row.QuestionId, Question: displayText(row.Question), Answer: { Value: answer, Aliases: Array.from(new Set(aliases)).slice(0, 31) } };
}

async function readPinnedMirror(sourceDirectory) {
  const directory = path.join(__dirname, 'vendor', 'hyparquet-1.31.2');
  const vendor = JSON.parse(fs.readFileSync(path.join(directory, 'PIN.json'), 'utf8'));
  vendor.files.forEach(function (file) { const location = path.resolve(directory, file.path); assert(location.startsWith(directory + path.sep), 'Unsafe vendor path.'); assert.equal(hash(fs.readFileSync(location)), file.sha256, 'Import tool was modified: ' + file.path); });
  const { parquetReadObjects } = await import(pathToFileURL(path.join(directory, 'src', 'index.js')).href);
  const records = [];
  for (const source of SOURCE_FILES) {
    let bytes;
    if (sourceDirectory) bytes = fs.readFileSync(path.join(sourceDirectory, path.basename(source.path)));
    else {
      const response = await fetch(MIRROR_URL + source.path, { signal: AbortSignal.timeout(5 * 60 * 1000) });
      assert(response.ok, 'Pinned mirror download failed: ' + response.status);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    assert.equal(bytes.length, source.bytes, 'Source file changed size.'); assert.equal(hash(bytes), source.sha256, 'Source file does not match pinned SHA256.');
    const rows = await parquetReadObjects({ file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), columns: ['question', 'question_id', 'answer'] });
    rows.forEach(function (row) { const record = compactRecord({ Question: row.question, QuestionId: row.question_id, Answer: row.answer && { Value: row.answer.value, Aliases: row.answer.aliases } }); if (record) records.push(record); });
    console.log('Validated ' + source.path + ': ' + rows.length + ' source rows.');
  }
  return { records: records, revision: MIRROR_REVISION, files: SOURCE_FILES };
}

function convertRecords(records) {
  const groups = new Map();
  const stats = { sourceRecords: records.length, invalid: 0, mediaOrRelative: 0, conflictingGroups: 0, duplicates: 0 };
  records.forEach(function (row) {
    const question = displayText(row.Question), answer = displayText(row.Answer && row.Answer.Value), normalized = normalizeAnswer(answer);
    if (!question || question.length > 400 || !answer || answer.length > 512 || !normalized || /<[^>]+>/.test(question) || /https?:\/\//i.test(question)) { stats.invalid++; return; }
    if (/\b(?:pictured|shown (?:here|above|below)|this (?:picture|image|photograph)|audio clip|video clip|current(?:ly)?|today|this year|presently)\b/i.test(question)) { stats.mediaOrRelative++; return; }
    const key = normalizeText(question), prior = groups.get(key);
    const aliases = Array.from(new Set([answer].concat(row.Answer.Aliases || []))).slice(0, 32);
    if (prior === false) return;
    if (prior && normalizeAnswer(prior.answer) !== normalized) { groups.set(key, false); stats.conflictingGroups++; return; }
    if (prior) { prior.acceptedAnswers = Array.from(new Set(prior.acceptedAnswers.concat(aliases))).slice(0, 32); stats.duplicates++; return; }
    groups.set(key, { id: 'triviaqa-' + hash(key).slice(0, 24), text: question, answer: answer, acceptedAnswers: aliases });
  });
  const bank = Array.from(groups.values()).filter(Boolean), frequencies = new Map();
  bank.forEach(function (row) { const key = normalizeAnswer(row.answer); frequencies.set(key, (frequencies.get(key) || 0) + 1); });
  bank.sort(function (a, b) {
    const aKey = normalizeAnswer(a.answer), bKey = normalizeAnswer(b.answer);
    return frequencies.get(bKey) - frequencies.get(aKey) || answerWords(a.answer).length - answerWords(b.answer).length || aKey.length - bKey.length || a.text.length - b.text.length || a.id.localeCompare(b.id, 'en');
  });
  bank.forEach(function (row, index) { row.tier = Math.min(4, 1 + Math.floor(index * 4 / bank.length)); });
  bank.sort(function (a, b) { return a.id.localeCompare(b.id, 'en'); });
  stats.usable = bank.length; stats.tiers = [1, 2, 3, 4].map(function (tier) { return bank.filter(function (row) { return row.tier === tier; }).length; });
  validateOutput(bank);
  return { bank: bank, stats: stats };
}
function validateOutput(bank) {
  assert(bank.length >= 44968, 'Too few distinct source questions after filtering.');
  const ids = new Set(), texts = new Set(), tiers = [0, 0, 0, 0, 0];
  bank.forEach(function (row) {
    assert(!ids.has(row.id) && !texts.has(normalizeText(row.text)), 'Repeated source ID or question text.'); ids.add(row.id); texts.add(normalizeText(row.text));
    assert(row.answer && row.answer.length <= 512 && normalizeAnswer(row.answer)); assert(row.text.length <= 400);
    assert(Number.isInteger(row.tier) && row.tier >= 1 && row.tier <= 4); tiers[row.tier]++;
    assert(Array.isArray(row.acceptedAnswers) && row.acceptedAnswers.length <= 32 && row.acceptedAnswers.every(function (answer) { return typeof answer === 'string' && conservativeAlias(row.answer, answer); }));
  });
  assert(tiers.slice(1).every(function (count) { return count > 0; }));
}
async function main(args) {
  const cacheIndex = args.indexOf('--cache'), sourceIndex = args.indexOf('--source-dir');
  const manifestPath = path.join(ROOT, 'assets', 'trivia', 'manifest.json');
  let imported;
  if (cacheIndex >= 0) {
    const previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8')), bytes = fs.readFileSync(args[cacheIndex + 1]);
    assert.equal(hash(bytes), previous.sourceCacheSha256, 'Unrecognized source cache.'); imported = JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
    assert.equal(imported.revision, MIRROR_REVISION); assert.deepEqual(imported.files, SOURCE_FILES);
  } else imported = await readPinnedMirror(sourceIndex >= 0 ? args[sourceIndex + 1] : null);
  const result = convertRecords(imported.records);
  let license, readme;
  if (cacheIndex >= 0) {
    license = fs.readFileSync(path.join(ROOT, 'assets', 'trivia', 'LICENSE.txt'), 'utf8');
    readme = fs.readFileSync(path.join(ROOT, 'assets', 'trivia', 'UPSTREAM-README.md'), 'utf8');
    const previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(hash(license), previous.licenseSha256); assert.equal(hash(readme), previous.upstreamReadmeSha256);
  } else {
    const responses = await Promise.all([fetch(REPOSITORY + 'LICENSE'), fetch(REPOSITORY + 'README.md')]);
    assert(responses.every(function (response) { return response.ok; }), 'Pinned license metadata unavailable.');
    license = await responses[0].text(); readme = await responses[1].text();
  }
  assert(license.includes('Apache License') && license.includes('Version 2.0')); assert(readme.includes('The Apache 2.0 License applies to both the code and the data.'));
  const body = '// Generated from TriviaQA v1.0. Archived bank, not active gameplay. See assets/trivia/TRIVIAQA-ARCHIVE.md and LICENSE.txt.\n(function (root) {\n  \'use strict\';\n  const LD = root.LyricDefense = root.LyricDefense || {};\n  LD.TriviaBank = [\n' + result.bank.map(function (row) { return '    ' + JSON.stringify(row); }).join(',\n') + '\n  ];\n})(typeof globalThis !== \'undefined\' ? globalThis : window);\n';
  const cached = zlib.gzipSync(JSON.stringify(imported));
  fs.mkdirSync(path.join(ROOT, 'assets', 'trivia'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'js', 'trivia-bank.js'), body);
  fs.writeFileSync(path.join(ROOT, 'assets', 'trivia', 'LICENSE.txt'), license);
  fs.writeFileSync(path.join(ROOT, 'assets', 'trivia', 'UPSTREAM-README.md'), readme);
  fs.writeFileSync(manifestPath, JSON.stringify({ version: 'TriviaQA 1.0 unfiltered', mirrorUrl: MIRROR_URL, mirrorRevision: MIRROR_REVISION, licenseCommit: COMMIT, sourceFiles: SOURCE_FILES, stats: result.stats, outputSha256: hash(body), sourceCacheSha256: hash(cached), licenseSha256: hash(license), upstreamReadmeSha256: hash(readme), regenerationTool: 'hyparquet 1.31.2 (MIT; vendored)' }, null, 2) + '\n');
  if (args.includes('--keep-cache')) fs.writeFileSync(path.join(ROOT, 'assets', 'trivia', '.source-cache.json.gz'), cached);
  console.log(JSON.stringify(result.stats, null, 2));
}
module.exports = { MIRROR_REVISION: MIRROR_REVISION, MIRROR_URL: MIRROR_URL, SOURCE_FILES: SOURCE_FILES, COMMIT: COMMIT, normalizeAnswer: normalizeAnswer, normalizeText: normalizeText, conservativeAlias: conservativeAlias, compactRecord: compactRecord, convertRecords: convertRecords, validateOutput: validateOutput };
if (require.main === module) main(process.argv.slice(2)).catch(function (error) { console.error(error.stack); process.exitCode = 1; });
