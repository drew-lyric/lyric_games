'use strict';
// HTTP routing and realpath checks for the shared launcher host.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createGamesServer } = require('../server.js');
const { createLanServer } = require('../lyric_biodefenses/server.js');

function request(address, requestPath, method, body) {
  return new Promise(function (resolve, reject) {
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = http.request({ hostname: '127.0.0.1', port: address.port, path: requestPath, method: method || 'GET', headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, function (response) {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', function (part) { text += part; });
      response.on('end', function () { resolve({ status: response.statusCode, headers: response.headers, text: text }); });
    });
    request.setTimeout(4000, function () { request.destroy(new Error('Request timed out.')); });
    request.on('error', reject);
    request.end(payload);
  });
}

async function runHostingTests() {
  const results = [];
  async function test(name, run) {
    try { await run(); results.push({ name: name, ok: true }); }
    catch (error) { results.push({ name: name, ok: false, error: error.stack }); }
  }
  const host = createGamesServer({ host: '127.0.0.1', port: 0 });
  const address = await host.start();
  try {
    await test('root serves the shared collection and launcher assets', async function () {
      for (const route of ['/', '/index.html']) {
        const response = await request(address, route);
        assert.equal(response.status, 200); assert.match(response.text, /Lyric Games/); assert.match(response.text, /Antigen Assault/); assert.match(response.text, /Sterile Solver/);
      }
      for (const route of ['/launcher.js', '/launcher.css']) assert.equal((await request(address, route)).status, 200);
    });
    await test('all three mounted games expose their entrypoints and public scripts', async function () {
      for (const name of ['lyric_biodefenses', 'lyric_galaga', 'lyric_sterilesolve']) {
        for (const file of ['', 'index.html', 'styles.css', 'js/config.js']) {
          const response = await request(address, '/' + name + '/' + file);
          assert.equal(response.status, 200, name + '/' + file);
        }
      }
    });
    await test('legacy Biodefenses public URLs remain aliases', async function () {
      for (const route of ['styles.css', 'trivia-review.html', 'js/config.js', 'assets/branding/lyric-logo.jpg']) {
        const legacy = await request(address, '/' + route);
        const mounted = await request(address, '/lyric_biodefenses/' + route);
        assert.equal(legacy.status, 200, route); assert.equal(legacy.text, mounted.text);
      }
    });
    await test('static responses have MIME, HEAD support, and iframe-compatible CSP', async function () {
      const response = await request(address, '/launcher.js');
      assert.match(response.headers['content-type'], /javascript/);
      assert.match(response.headers['content-security-policy'], /frame-src 'self'/);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      const head = await request(address, '/lyric_galaga/index.html', 'HEAD');
      assert.equal(head.status, 200); assert.equal(head.text, ''); assert(Number(head.headers['content-length']) > 0);
    });
    await test('root LAN API creates and explicitly deletes Biodefenses rooms', async function () {
      const created = await request(address, '/api/rooms', 'POST', { name: 'Arcade' });
      assert.equal(created.status, 201);
      const credentials = JSON.parse(created.text);
      const health = await request(address, '/api/health'); assert.equal(JSON.parse(health.text).rooms, 1);
      const left = await request(address, '/api/rooms/' + credentials.roomCode + '/leave', 'POST', { token: credentials.token });
      assert.equal(left.status, 200); assert.equal(host.rooms.size, 0);
    });
    await test('private sources, scripts, tests, dotfiles, and unknown entrypoints are denied', async function () {
      for (const route of ['/server.js', '/README.md', '/start-lan.bat', '/tests/hosting-tests.js', '/scripts/browser-smoke.js', '/.git/config', '/lyric_biodefenses/server.js', '/lyric_biodefenses/scripts/browser-smoke.js', '/lyric_biodefenses/tests/run.js', '/lyric_galaga/tests/run.js', '/lyric_galaga/README.md', '/lyric_galaga/js/config.json', '/lyric_sterilesolve/README.md', '/lyric_sterilesolve/tests/run.js', '/lyric_sterilesolve/scripts/browser-smoke.js', '/lyric_sterilesolve/assets/.hidden.png', '/lyric_biodefenses/assets/.hidden.png']) {
        const response = await request(address, route);
        assert.equal(response.status, 404, route); assert.doesNotMatch(response.text, /function create(?:Lan|Games)Server/);
      }
    });
    await test('raw and encoded traversal, backslashes, nulls, and drive paths are denied', async function () {
      for (const route of ['/../index.html', '/lyric_galaga/../index.html', '/%2e%2e/index.html', '/lyric_galaga/%2e%2e%2findex.html', '/lyric_galaga/assets/..%2f..%2fserver.js', '/lyric_sterilesolve/%2e%2e%2findex.html', '/lyric_sterilesolve/assets/..%2f..%2fserver.js', '/lyric_galaga%5cindex.html', '/lyric_galaga/index.html%00', '/C:/Windows/win.ini']) {
        const response = await request(address, route);
        assert.equal(response.status, 404, route);
      }
      assert.equal((await request(address, '/%GG')).status, 400);
    });
    await test('unsupported static methods and unrecognized API routes are denied', async function () {
      assert.equal((await request(address, '/', 'PUT')).status, 405);
      assert.equal((await request(address, '/api/not-a-route')).status, 404);
    });
  } finally { await host.close(); }

  // Junctions do not require Windows developer mode and let this test exercise
  // the realpath boundary without adding files to either game's asset folder.
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-hosting-'));
  const publicRoot = path.join(fixture, 'public');
  const privateRoot = path.join(fixture, 'private');
  fs.mkdirSync(path.join(publicRoot, 'js'), { recursive: true });
  fs.mkdirSync(privateRoot);
  fs.writeFileSync(path.join(publicRoot, 'index.html'), '<!doctype html><title>Fixture</title>');
  fs.writeFileSync(path.join(privateRoot, 'secret.js'), 'PRIVATE_SOURCE');
  fs.symlinkSync(privateRoot, path.join(publicRoot, 'js', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const fixtureHost = createLanServer({ host: '127.0.0.1', port: 0, staticRoot: publicRoot, staticMaps: [
    { prefix: '/', directory: '.', files: ['index.html'], directories: ['js'] },
    { prefix: '/private/', directory: '../private', files: ['secret.js'], directories: [] }
  ] });
  const fixtureAddress = await fixtureHost.start();
  try {
    await test('realpath rejects a public asset junction escaping its mount', async function () {
      const response = await request(fixtureAddress, '/js/escape/secret.js');
      assert.equal(response.status, 404); assert(!response.text.includes('PRIVATE_SOURCE'));
    });
    await test('configured mounts cannot escape the static root', async function () {
      const response = await request(fixtureAddress, '/private/secret.js');
      assert.equal(response.status, 404); assert(!response.text.includes('PRIVATE_SOURCE'));
    });
  } finally {
    await fixtureHost.close();
    fs.unlinkSync(path.join(publicRoot, 'js', 'escape'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  return results;
}
module.exports = { runHostingTests: runHostingTests };
if (require.main === module) runHostingTests().then(function (results) {
  results.forEach(function (result) { console.log((result.ok ? 'PASS ' : 'FAIL ') + result.name + (result.error ? '\n' + result.error : '')); });
  console.log('\n' + results.filter(function (result) { return result.ok; }).length + '/' + results.length + ' hosting checks passed.');
  process.exitCode = results.every(function (result) { return result.ok; }) ? 0 : 1;
}).catch(function (error) { console.error(error.stack); process.exitCode = 1; });
