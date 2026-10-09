'use strict';

// The LAN host is the only process that changes match state. Browser clients
// submit commands and receive snapshots; no third-party packages are needed.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

for (const name of ['config', 'clue-bank', 'clues', 'trivia-expanded-bank', 'trivia', 'navigation', 'simulation']) {
  if (name.endsWith('-bank') && !fs.existsSync(path.join(__dirname, 'js', name + '.js'))) continue;
  require('./js/' + name + '.js');
}
const LD = globalThis.LyricDefense;
const PROJECT_ROOT = __dirname;
const GAME_COMMANDS = new Set(['answer', 'skip', 'buy', 'craft', 'cast']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function json(response, status, value) {
  if (response.writableEnded || response.destroyed) return;
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}
function sameToken(candidate, token) {
  if (typeof candidate !== 'string' || candidate.length !== token.length) return false;
  const candidateBytes = Buffer.from(candidate);
  const tokenBytes = Buffer.from(token);
  return candidateBytes.length === tokenBytes.length && crypto.timingSafeEqual(candidateBytes, tokenBytes);
}
function cleanName(value, fallback) {
  if (value !== undefined && typeof value !== 'string') throw new HttpError(400, 'Name must be text.');
  return (value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || fallback;
}
function readJSON(request, limit) {
  const type = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'Send application/json.');
  if (Number(request.headers['content-length']) > limit) { request.resume(); throw new HttpError(413, 'Request is too large.'); }
  return new Promise(function (resolve, reject) {
    let size = 0;
    let failed = false;
    const chunks = [];
    request.on('data', function (chunk) {
      if (failed) return;
      size += chunk.length;
      if (size > limit) { failed = true; reject(new HttpError(413, 'Request is too large.')); return; }
      chunks.push(chunk);
    });
    request.on('end', function () {
      if (failed) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!plainObject(value)) throw new Error('Expected an object.');
        resolve(value);
      } catch (_) { reject(new HttpError(400, 'Invalid JSON object.')); }
    });
    request.on('error', reject);
    request.on('aborted', function () { reject(new HttpError(400, 'Request was interrupted.')); });
  });
}

function createLanServer(options) {
  options = options || {};
  const host = options.host || '0.0.0.0';
  const port = options.port === undefined ? 3000 : options.port;
  const reconnectGraceMs = options.reconnectGraceMs === undefined ? 30000 : options.reconnectGraceMs;
  const waitingRoomMs = options.waitingRoomMs === undefined ? 10 * 60 * 1000 : options.waitingRoomMs;
  const endedRoomMs = options.endedRoomMs === undefined ? 10 * 60 * 1000 : options.endedRoomMs;
  const tickRate = options.tickRate || 30;
  const snapshotRate = options.snapshotRate || 15;
  const bodyLimit = options.bodyLimit || 4096;
  // Each mount has an explicit entrypoint list and public asset directories.
  // The default keeps this folder independently hostable; the root arcade host
  // supplies mounts for both games plus the original URLs as aliases.
  const staticRoot = path.resolve(options.staticRoot || PROJECT_ROOT);
  const staticMaps = options.staticMaps || [{ prefix: '/', directory: '.', files: ['index.html', 'styles.css', 'trivia-review.html'], directories: ['js', 'assets'] }];
  const maxRooms = options.maxRooms || 20;
  // Test hosts can raise unrelated limits while exercising one limiter. The
  // CLI keeps the bounded defaults below.
  const postBurst = options.postBurst === undefined ? 80 : options.postBurst;
  const createBurst = options.createBurst === undefined ? 10 : options.createBurst;
  const eventBurst = options.eventBurst === undefined ? 20 : options.eventBurst;
  const commandBurst = options.commandBurst === undefined ? 40 : options.commandBurst;
  const commandRate = options.commandRate === undefined ? 20 : options.commandRate;
  const rooms = new Map();
  const rateBuckets = new Map();
  let timer = null;
  let started = false;
  let closing = false;

  function rateLimit(key, capacity, refillPerSecond) {
    const now = Date.now();
    const previous = rateBuckets.get(key);
    const bucket = previous || { tokens: capacity, at: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.at) / 1000 * refillPerSecond);
    bucket.at = now;
    rateBuckets.set(key, bucket);
    if (bucket.tokens < 1) throw new HttpError(429, 'Too many requests. Try again shortly.');
    bucket.tokens -= 1;
  }
  function checkOrigin(request) {
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Use the page served by this LAN host.');
    const expected = new URL('http://' + request.headers.host).origin;
    for (const name of ['origin', 'referer']) {
      if (!request.headers[name]) continue;
      let origin;
      try { origin = new URL(request.headers[name]).origin; } catch (_) { throw new HttpError(403, 'Invalid request origin.'); }
      if (origin !== expected) throw new HttpError(403, 'Use the page served by this LAN host.');
    }
  }
  function roomCode() {
    let code;
    do {
      const bytes = crypto.randomBytes(6);
      code = Array.from(bytes, function (value) { return CODE_ALPHABET[value % CODE_ALPHABET.length]; }).join('');
    } while (rooms.has(code));
    return code;
  }
  function playerFor(room, token) {
    for (const id of ['p1', 'p2']) {
      if (room.slots[id] && sameToken(token, room.slots[id].token)) return id;
    }
    throw new HttpError(401, 'Invalid room token.');
  }
  function bothConnected(room) { return !!(room.clients.p1 && room.clients.p2); }
  function newGame(room) {
    const seed = crypto.randomBytes(4).readUInt32LE(0);
    const makeProvider = options.clueProviderFactory || function (settings) { return new LD.TriviaProvider({ seed: settings.seed, storage: null }); };
    if (!room.clueProviders) room.clueProviders = {
      p1: makeProvider({ seed: seed, playerId: 'p1', roomCode: room.code }),
      p2: makeProvider({ seed: (seed + 1) >>> 0, playerId: 'p2', roomCode: room.code })
    };
    const gameOptions = { seed: seed, mode: 'lan', clueProvider: room.clueProviders.p1, opponentClueProvider: room.clueProviders.p2 };
    room.game = options.gameFactory ? options.gameFactory(gameOptions) : new LD.Game(gameOptions);
    if (options.countdownSeconds !== undefined) room.game.state.countdown = Math.max(0, Number(options.countdownSeconds) || 0);
    room.matchId = crypto.randomUUID();
    room.game.state.matchId = room.matchId;
    room.game.state.botEnabled = false;
    room.game.state.sandbox = false;
    room.game.pause();
    room.game.drainEvents();
    room.started = false;
    room.status = 'waiting';
    room.endedAt = null;
    room.rematchRequested.clear();
  }
  function session(room, playerId) {
    return {
      roomCode: room.code, playerId: playerId, matchId: room.matchId,
      names: { p1: room.slots.p1 ? room.slots.p1.name : 'Player 1', p2: room.slots.p2 ? room.slots.p2.name : 'Player 2' },
      connections: { p1: !!room.clients.p1, p2: !!room.clients.p2 },
      status: room.status, rematchRequested: Array.from(room.rematchRequested),
      reconnectGraceMs: reconnectGraceMs
    };
  }
  function snapshot(room, playerId) {
    const state = JSON.parse(JSON.stringify(room.game.state));
    state.matchId = room.matchId;
    state.players.forEach(function (player) {
      const clue = player.clue;
      player.clue = player.id === playerId && clue ? { id: clue.id, text: clue.text, tier: clue.tier, length: clue.kind === 'trivia' ? undefined : clue.length, kind: clue.kind } : null;
    });
    return state;
  }
  function emit(response, type, value) {
    if (!response || response.writableEnded || response.destroyed) return;
    if (response.writableLength > 1024 * 1024) { response.destroy(); return; }
    response.write('event: ' + type + '\ndata: ' + JSON.stringify(value) + '\n\n');
  }
  function publishSession(room) {
    for (const id of ['p1', 'p2']) emit(room.clients[id], 'session', session(room, id));
  }
  function publishState(room) {
    for (const id of ['p1', 'p2']) if (room.clients[id]) emit(room.clients[id], 'state', snapshot(room, id));
    room.nextSnapshotAt = Date.now() + 1000 / snapshotRate;
  }
  function publishEvents(room) {
    for (const event of room.game.drainEvents()) {
      // Currently no event contains an answer. Keep the wire free of accidental
      // answer/token fields when future simulation events are added.
      const safe = JSON.parse(JSON.stringify(event, function (key, value) { return key === 'answer' || key === 'token' ? undefined : value; }));
      for (const id of ['p1', 'p2']) emit(room.clients[id], 'event', safe);
    }
  }
  function updateStatus(room) {
    const previous = room.status;
    if (room.game.state.phase === 'ended') {
      if (!room.endedAt) room.endedAt = Date.now();
      room.status = room.rematchRequested.size ? 'rematch' : 'ended';
    } else if (!room.started) room.status = 'waiting';
    else room.status = bothConnected(room) ? 'playing' : 'paused';
    if (room.status !== previous) publishSession(room);
  }
  function reconcile(room) {
    if (room.closed) return;
    if (room.game.state.phase === 'ended' && room.rematchRequested.size === 2 && bothConnected(room)) newGame(room);
    if (!room.started && room.slots.p1 && room.slots.p2 && bothConnected(room)) {
      room.started = true;
      room.game.resume();
    } else if (room.started && room.game.state.phase !== 'ended') {
      if (bothConnected(room)) room.game.resume(); else room.game.pause();
    }
    updateStatus(room);
  }
  function forfeit(room, loser) {
    if (room.game.state.phase === 'ended') return;
    room.game.state.phase = 'ended';
    room.game.state.winner = loser === 'both' ? 'draw' : loser === 'p1' ? 'p2' : 'p1';
    room.endedAt = Date.now();
    room.status = 'ended';
    const event = { type: 'end', playerId: room.game.state.winner, winner: room.game.state.winner, reason: 'disconnect' };
    for (const id of ['p1', 'p2']) emit(room.clients[id], 'event', event);
    publishState(room);
    publishSession(room);
  }
  function closeRoom(room, reason) {
    if (room.closed) return;
    room.closed = true;
    rooms.delete(room.code);
    for (const id of ['p1', 'p2']) {
      const response = room.clients[id];
      if (response) { emit(response, 'closed', { reason: reason }); response.end(); }
      room.clients[id] = null;
    }
  }
  function connect(room, playerId, response) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff'
    });
    response.flushHeaders();
    const previous = room.clients[playerId];
    room.clients[playerId] = response;
    room.slots[playerId].disconnectedAt = null;
    if (previous) { emit(previous, 'closed', { reason: 'This player connected in another browser.' }); previous.end(); }
    response.on('close', function () {
      if (room.closed || room.clients[playerId] !== response) return;
      room.clients[playerId] = null;
      room.slots[playerId].disconnectedAt = Date.now();
      reconcile(room);
      publishEvents(room);
      publishSession(room);
      publishState(room);
    });
    reconcile(room);
    publishEvents(room);
    publishSession(room);
    publishState(room);
  }
  function validateCommand(command) {
    if (!plainObject(command) || typeof command.type !== 'string') throw new HttpError(400, 'Invalid command.');
    if (!GAME_COMMANDS.has(command.type)) throw new HttpError(403, 'That command is not available in LAN matches.');
    const payload = command.payload === undefined ? {} : command.payload;
    if (!plainObject(payload)) throw new HttpError(400, 'Invalid command payload.');
    if (command.type === 'answer') {
      if (typeof payload.clueId !== 'string' || payload.clueId.length > 128 || typeof payload.answer !== 'string' || payload.answer.length > 512) throw new HttpError(400, 'Invalid answer payload.');
      return { type: 'answer', payload: { clueId: payload.clueId, answer: payload.answer } };
    }
    if (command.type === 'buy') {
      if (typeof payload.itemId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(payload.itemId)) throw new HttpError(400, 'Invalid item ID.');
      return { type: 'buy', payload: { itemId: payload.itemId } };
    }
    if (command.type === 'cast') {
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number' || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) throw new HttpError(400, 'Invalid cast coordinates.');
      return { type: 'cast', payload: { x: payload.x, y: payload.y } };
    }
    return { type: command.type, payload: {} };
  }
  function contained(directory, filename) {
    const relative = path.relative(directory, filename);
    return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  }
  function staticAllowed(relative, mount) {
    if (!relative || relative.split('/').some(function (part) { return !part || part.startsWith('.') || part.includes(':'); })) return false;
    if ((mount.files || []).includes(relative)) return true;
    const directory = relative.split('/')[0];
    if (!(mount.directories || []).includes(directory)) return false;
    const extension = path.extname(relative).toLowerCase();
    return directory === 'js' ? extension === '.js' : !!MIME[extension];
  }
  async function serveStatic(request, response, pathname) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch (_) { throw new HttpError(400, 'Invalid path.'); }
    if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(function (part) { return part.startsWith('.') || part.includes(':'); })) throw new HttpError(404, 'Not found.');
    let mount;
    let relative;
    for (const candidate of staticMaps) {
      if (!decoded.startsWith(candidate.prefix)) continue;
      const file = decoded.slice(candidate.prefix.length) || 'index.html';
      if (!staticAllowed(file, candidate)) continue;
      mount = candidate; relative = file; break;
    }
    if (!mount) throw new HttpError(404, 'Not found.');
    const directory = path.resolve(staticRoot, mount.directory);
    const filePath = path.resolve(directory, relative);
    if (!contained(staticRoot, directory) || !contained(directory, filePath)) throw new HttpError(404, 'Not found.');
    let realPath;
    let realDirectory;
    let realRoot;
    let stat;
    try {
      [realRoot, realDirectory, realPath] = await Promise.all([fs.promises.realpath(staticRoot), fs.promises.realpath(directory), fs.promises.realpath(filePath)]);
      stat = await fs.promises.stat(realPath);
    } catch (_) { throw new HttpError(404, 'Not found.'); }
    const realRelative = path.relative(realDirectory, realPath).split(path.sep).join('/');
    if (!contained(realRoot, realDirectory) || !contained(realDirectory, realPath) || !stat.isFile() || !staticAllowed(realRelative, mount)) throw new HttpError(404, 'Not found.');
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(realPath).toLowerCase()], 'Content-Length': stat.size,
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-src 'self'"
    });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = fs.createReadStream(realPath);
    stream.on('error', function () { response.destroy(); });
    response.on('close', function () { stream.destroy(); });
    stream.pipe(response);
  }

  const server = http.createServer(async function (request, response) {
    try {
      if (closing) throw new HttpError(503, 'LAN host is shutting down.');
      if (!request.url.startsWith('/') || request.url.startsWith('//')) throw new HttpError(400, 'Invalid request path.');
      let rawPath;
      try { rawPath = decodeURIComponent(request.url.split('?')[0]); } catch (_) { throw new HttpError(400, 'Invalid path.'); }
      if (rawPath.split('/').some(function (part) { return part === '..' || part === '.'; })) throw new HttpError(404, 'Not found.');
      const url = new URL(request.url, 'http://localhost');
      const pathname = url.pathname;
      const ip = request.socket.remoteAddress || 'unknown';
      if (request.method === 'GET' && pathname === '/api/health') { json(response, 200, { ok: true, rooms: rooms.size }); return; }
      if (request.method === 'POST') { checkOrigin(request); rateLimit('requests:' + ip, postBurst, 20); }
      if (request.method === 'POST' && pathname === '/api/rooms') {
        rateLimit('create:' + ip, createBurst, 10 / 60);
        if (rooms.size >= maxRooms) throw new HttpError(503, 'The host has reached its room limit.');
        const body = await readJSON(request, bodyLimit);
        if (closing) throw new HttpError(503, 'LAN host is shutting down.');
        if (rooms.size >= maxRooms) throw new HttpError(503, 'The host has reached its room limit.');
        const code = roomCode();
        const room = {
          code: code, createdAt: Date.now(), nextSnapshotAt: 0, nextHeartbeatAt: Date.now() + 15000,
          slots: { p1: { name: cleanName(body.name, 'Player 1'), token: crypto.randomBytes(32).toString('base64url'), disconnectedAt: null }, p2: null },
          clients: { p1: null, p2: null }, rematchRequested: new Set(), closed: false
        };
        newGame(room);
        rooms.set(code, room);
        json(response, 201, { roomCode: code, playerId: 'p1', token: room.slots.p1.token, matchId: room.matchId });
        return;
      }
      const match = /^\/api\/rooms\/([a-zA-Z0-9]{6})\/(join|events|commands|rematch|leave)$/.exec(pathname);
      if (match) {
        const room = rooms.get(match[1].toUpperCase());
        if (!room) throw new HttpError(404, 'Room not found.');
        const action = match[2];
        if (action === 'events' && request.method === 'GET') {
          rateLimit('events:' + ip, eventBurst, 2);
          const playerId = playerFor(room, url.searchParams.get('token'));
          connect(room, playerId, response);
          return;
        }
        if (request.method !== 'POST' || action === 'events') throw new HttpError(405, 'Method not allowed.');
        const body = await readJSON(request, bodyLimit);
        if (closing) throw new HttpError(503, 'LAN host is shutting down.');
        if (room.closed || !rooms.has(room.code)) throw new HttpError(404, 'Room not found.');
        if (action === 'join') {
          rateLimit('join:' + ip, 20, 20 / 60);
          if (room.slots.p2) throw new HttpError(409, 'This room already has two players.');
          room.slots.p2 = { name: cleanName(body.name, 'Player 2'), token: crypto.randomBytes(32).toString('base64url'), disconnectedAt: null };
          publishSession(room);
          json(response, 200, { roomCode: room.code, playerId: 'p2', token: room.slots.p2.token, matchId: room.matchId });
          return;
        }
        const playerId = playerFor(room, body.token);
        if (action === 'commands') {
          if (body.matchId !== room.matchId) throw new HttpError(409, 'This command belongs to an earlier match.');
          rateLimit('command:' + body.token, commandBurst, commandRate);
          const command = validateCommand(body.command);
          const result = room.game.command(playerId, command);
          updateStatus(room);
          publishEvents(room);
          publishState(room);
          json(response, 200, result);
          return;
        }
        if (action === 'rematch') {
          if (room.game.state.phase !== 'ended') throw new HttpError(409, 'Rematch is available after the match ends.');
          room.rematchRequested.add(playerId);
          reconcile(room);
          publishEvents(room);
          publishSession(room);
          publishState(room);
          json(response, 200, { ok: true, matchId: room.matchId, status: room.status });
          return;
        }
        if (action === 'leave') {
          if (room.started && room.game.state.phase !== 'ended') forfeit(room, playerId);
          closeRoom(room, room.slots[playerId].name + ' left the room.');
          json(response, 200, { ok: true });
          return;
        }
      }
      if (pathname.startsWith('/api/')) throw new HttpError(404, 'Endpoint not found.');
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
      await serveStatic(request, response, pathname);
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      json(response, error.status || 500, { ok: false, reason: error.status ? error.message : 'LAN host error.' });
      if (!error.status && options.onError) options.onError(error);
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;

  function tick() {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (!room.started && now - room.createdAt >= waitingRoomMs) { closeRoom(room, 'Waiting room expired.'); continue; }
      if (room.endedAt && now - room.endedAt >= endedRoomMs) { closeRoom(room, 'Finished room expired.'); continue; }
      const disconnected = ['p1', 'p2'].filter(function (id) {
        return room.slots[id] && !room.clients[id] && room.slots[id].disconnectedAt !== null && now - room.slots[id].disconnectedAt >= reconnectGraceMs;
      });
      if (disconnected.length && room.game.state.phase !== 'ended') {
        if (!room.started) { closeRoom(room, 'A player disconnected from the waiting room.'); continue; }
        forfeit(room, disconnected.length === 2 ? 'both' : disconnected[0]);
      }
      if (room.started && bothConnected(room) && room.game.state.phase !== 'ended') room.game.step(1 / tickRate);
      updateStatus(room);
      publishEvents(room);
      if (bothConnected(room) && now >= room.nextSnapshotAt) publishState(room);
      if (now >= room.nextHeartbeatAt) {
        for (const id of ['p1', 'p2']) if (room.clients[id] && !room.clients[id].destroyed) room.clients[id].write(': keep-alive\n\n');
        room.nextHeartbeatAt = now + 15000;
      }
    }
    for (const [key, bucket] of rateBuckets) if (now - bucket.at > 5 * 60 * 1000) rateBuckets.delete(key);
  }
  async function start() {
    if (started) return { host: host, port: server.address().port, url: 'http://' + (host === '0.0.0.0' ? 'localhost' : host) + ':' + server.address().port };
    await new Promise(function (resolve, reject) {
      server.once('error', reject);
      server.listen(port, host, function () { server.removeListener('error', reject); resolve(); });
    });
    started = true;
    timer = setInterval(tick, 1000 / tickRate);
    return { host: host, port: server.address().port, url: 'http://' + (host === '0.0.0.0' ? 'localhost' : host) + ':' + server.address().port };
  }
  async function close() {
    if (closing) return;
    closing = true;
    if (timer) { clearInterval(timer); timer = null; }
    for (const room of Array.from(rooms.values())) closeRoom(room, 'LAN host stopped.');
    rateBuckets.clear();
    if (!started) return;
    await new Promise(function (resolve) {
      server.close(resolve);
      if (server.closeAllConnections) server.closeAllConnections();
    });
    started = false;
  }
  return { server: server, rooms: rooms, start: start, close: close };
}

module.exports = { createLanServer: createLanServer };

if (require.main === module) {
  const args = process.argv.slice(2);
  let port = Number(process.env.PORT || 3000);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--port' && args[i + 1] !== undefined) port = Number(args[++i]);
    else { console.error('Usage: node server.js [--port 3000]'); process.exit(1); }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('Port must be between 1 and 65535.'); process.exit(1); }
  const host = createLanServer({ port: port, onError: function (error) { console.error(error.message); } });
  host.start().then(function () {
    console.log('Lyric Defense LAN host is running.');
    console.log('This computer: http://localhost:' + port);
    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const address of interfaces || []) if (address.family === 'IPv4' && !address.internal) console.log('LAN address:   http://' + address.address + ':' + port);
    }
    console.log('Open a LAN address on the second computer, then create or join a room.');
    console.log('Press Ctrl+C to stop.');
  }).catch(function (error) { console.error('Cannot start LAN host: ' + error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, function () { host.close().then(function () { process.exit(0); }); });
}
