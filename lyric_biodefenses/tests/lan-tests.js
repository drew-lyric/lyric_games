'use strict';

// Real HTTP/SSE integration checks; no browser, dependencies, or external host.
const assert = require('node:assert/strict');
const http = require('node:http');

const delay = function (milliseconds) { return new Promise(function (resolve) { setTimeout(resolve, milliseconds); }); };
async function until(predicate, message, timeout) {
  const deadline = Date.now() + (timeout || 3000);
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error(message || 'Timed out waiting for server state.');
}

class EventStream {
  constructor(url) {
    this.controller = new AbortController();
    this.events = [];
    this.state = null;
    this.session = null;
    this.error = null;
    this.ended = false;
    this.ready = this.start(url);
  }
  async start(url) {
    const response = await fetch(url, { signal: this.controller.signal });
    assert.equal(response.status, 200, 'SSE connection rejected.');
    assert.match(response.headers.get('content-type') || '', /text\/event-stream/);
    this.reader = response.body.getReader();
    this.task = this.consume().catch((error) => { if (!this.controller.signal.aborted) this.error = error; });
  }
  async consume() {
    const decoder = new TextDecoder();
    let buffered = '';
    for (;;) {
      const chunk = await this.reader.read();
      if (chunk.done) break;
      buffered = (buffered + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffered.indexOf('\n\n')) >= 0) {
        const frame = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        let type = 'message';
        const data = [];
        frame.split('\n').forEach(function (line) {
          if (line.startsWith('event:')) type = line.slice(6).trim();
          if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        });
        if (!data.length) continue;
        const value = JSON.parse(data.join('\n'));
        this.events.push({ type: type, data: value });
        if (type === 'state') this.state = value;
        if (type === 'session') this.session = value;
      }
    }
    this.ended = true;
  }
  async wait(predicate, message) {
    await until(() => {
      if (this.error) throw this.error;
      return predicate(this);
    }, message);
  }
  async close() {
    this.controller.abort();
    try { await this.ready; } catch (_) { /* Aborting a pending connection is expected. */ }
    if (this.task) await this.task;
  }
}

function rawGet(address, requestPath) {
  return new Promise(function (resolve, reject) {
    const request = http.get({ hostname: address.host, port: address.port, path: requestPath }, function (response) {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', function (chunk) { text += chunk; });
      response.on('end', function () { resolve({ status: response.statusCode, text: text }); });
    });
    request.setTimeout(3000, function () { request.destroy(new Error('HTTP request timed out.')); });
    request.on('error', reject);
  });
}

async function runLanTests() {
  const createLanServer = require('../server.js').createLanServer;
  const results = [];
  const streams = new Set();
  const application = createLanServer({
    host: '127.0.0.1', port: 0, countdownSeconds: 0.12, reconnectGraceMs: 500,
    createBurst: 100, postBurst: 1000, eventBurst: 100,
    clueProviderFactory: function (details) {
      let counter = 0;
      return { next: function (tier) { return { id: details.roomCode + '-' + details.playerId + '-' + (++counter), text: 'Opposite of cold', answer: 'HOT', tier: tier, length: 3 }; } };
    }
  });
  const address = await application.start();
  const baseUrl = address.url;

  async function request(route, body, raw) {
    const options = { signal: AbortSignal.timeout(3000) };
    if (body !== undefined || raw !== undefined) {
      options.method = 'POST'; options.headers = { 'Content-Type': 'application/json' };
      options.body = raw !== undefined ? raw : JSON.stringify(body);
    }
    const response = await fetch(baseUrl + route, options);
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  }
  async function create() {
    const response = await request('/api/rooms', { name: 'Creator' });
    assert(response.status >= 200 && response.status < 300, 'Room creation failed.');
    assert.equal(typeof response.data.roomCode, 'string');
    assert.equal(typeof response.data.token, 'string');
    assert.equal(response.data.playerId, 'p1');
    const room = application.rooms.get(response.data.roomCode);
    assert(room && room.game, 'Missing diagnostic room/game seam.');
    room.game.state.naturalEnabled = false;
    return response.data;
  }
  async function join(creator) {
    const response = await request('/api/rooms/' + creator.roomCode + '/join', { name: 'Opponent' });
    assert(response.status >= 200 && response.status < 300, 'Room join failed.');
    assert.equal(response.data.playerId, 'p2');
    assert.notEqual(response.data.token, creator.token);
    return response.data;
  }
  async function connect(actor) {
    const stream = new EventStream(baseUrl + '/api/rooms/' + actor.roomCode + '/events?token=' + encodeURIComponent(actor.token));
    streams.add(stream); await stream.ready;
    await stream.wait(function (entry) { return entry.state && entry.session; }, 'Missing initial SSE state/session.');
    return stream;
  }
  async function command(actor, type, payload, overrides) {
    const room = application.rooms.get(actor.roomCode);
    return request('/api/rooms/' + actor.roomCode + '/commands', Object.assign({
      token: actor.token, matchId: room && room.matchId,
      command: { type: type, payload: payload || {} }
    }, overrides || {}));
  }
  async function cleanup(creator, activeStreams) {
    await Promise.all((activeStreams || []).map(function (stream) { return stream.close(); }));
    if (creator && application.rooms.has(creator.roomCode)) {
      try { await request('/api/rooms/' + creator.roomCode + '/leave', { token: creator.token }); } catch (_) { /* Suite-level close still cleans up. */ }
    }
  }
  async function withPair(callback) {
    const a = await create();
    const active = [];
    try {
      const b = await join(a), room = application.rooms.get(a.roomCode);
      const sa = await connect(a); active.push(sa);
      const sb = await connect(b); active.push(sb);
      await until(function () { return room.status === 'playing' && room.game.state.phase === 'playing'; }, 'Match did not finish countdown.');
      await callback({ a: a, b: b, sa: sa, sb: sb, room: room, active: active });
    } finally { await cleanup(a, active); }
  }
  async function test(name, callback) {
    try { await callback(); results.push({ name: name, ok: true }); }
    catch (error) { results.push({ name: name, ok: false, error: error.message, stack: error.stack }); }
  }
  async function endByBreach(pair) {
    const player = pair.room.game.state.players[0];
    player.contamination = 99;
    const enemy = pair.room.game._spawn(player, 'basic', 1, 180);
    enemy.x = 1000;
    await until(function () { return pair.room.status === 'ended'; }, 'Authoritative breach did not end match.');
    assert.equal(pair.room.game.state.winner, 'p2');
    assert.equal(player.contamination, 100);
  }

  try {
    await test('LAN room creation reserves two distinct identities and rejects a third join', async function () {
      const creator = await create();
      try {
        await join(creator);
        const third = await request('/api/rooms/' + creator.roomCode + '/join', { name: 'Third' });
        assert.equal(third.status, 409);
        assert.equal(application.rooms.get(creator.roomCode).status, 'waiting');
      } finally { await cleanup(creator); }
    });

    await test('LAN countdown starts only after both reserved players connect through SSE', async function () {
      const a = await create(), active = [];
      try {
        const room = application.rooms.get(a.roomCode), sa = await connect(a); active.push(sa);
        assert.equal(room.status, 'waiting'); assert.equal(room.game.state.phase, 'paused');
        const b = await join(a);
        await delay(170);
        assert.equal(room.status, 'waiting'); assert.equal(room.game.state.phase, 'paused');
        assert.equal(room.game.state.time, 0);
        const sb = await connect(b); active.push(sb);
        await until(function () { return room.game.state.phase === 'playing'; }, 'Both connections did not start match.');
        assert(sa.events.some(function (event) { return event.type === 'state' && event.data.phase === 'countdown'; }), 'Countdown snapshot was not published.');
        assert.equal(sa.session.connections.p1, true); assert.equal(sa.session.connections.p2, true);
      } finally { await cleanup(a, active); }
    });

    await test('LAN snapshots remove answers and reveal only the viewer current clue', async function () {
      await withPair(async function (pair) {
        [pair.sa, pair.sb].forEach(function (stream, index) {
          const own = stream.state.players[index], opponent = stream.state.players[1 - index];
          assert(own.clue && own.clue.text && own.clue.id);
          assert(!Object.prototype.hasOwnProperty.call(own.clue, 'answer'));
          assert.equal(opponent.clue, null);
          assert.equal(stream.state.matchId, pair.room.matchId);
          assert.equal(stream.session.matchId, pair.room.matchId);
        });
      });
    });

    await test('LAN rejects unknown tokens, malformed JSON, and privileged sandbox commands', async function () {
      await withPair(async function (pair) {
        const route = '/api/rooms/' + pair.a.roomCode;
        assert.equal((await request(route + '/commands', { token: 'invalid', matchId: pair.room.matchId, command: { type: 'skip' } })).status, 401);
        assert.equal((await request(route + '/commands', { token: '\u00e9'.repeat(pair.a.token.length), matchId: pair.room.matchId, command: { type: 'skip' } })).status, 401);
        assert.equal((await request(route + '/events?token=invalid')).status, 401);
        assert.equal((await request(route + '/commands', undefined, '{')).status, 400);
        const before = JSON.stringify(pair.room.game.state.players[0].wallet);
        assert.equal((await command(pair.a, 'debug', { action: 'grant', amount: 100 })).status, 403);
        assert.equal(JSON.stringify(pair.room.game.state.players[0].wallet), before);
      });
    });

    await test('LAN correct answers pay once and stale answers are rejected by the authority', async function () {
      await withPair(async function (pair) {
        const player = pair.room.game.state.players[0], clue = player.clue;
        const before = player.wallet['igg' + clue.tier];
        const answer = await command(pair.a, 'answer', { clueId: clue.id, answer: clue.answer.toLowerCase() });
        assert.equal(answer.status, 200); assert.equal(answer.data.ok, true);
        assert.equal(player.wallet['igg' + clue.tier], before + 1);
        assert.notEqual(player.clue.id, clue.id);
        const stale = await command(pair.a, 'answer', { clueId: clue.id, answer: clue.answer });
        assert.equal(stale.status, 200); assert.equal(stale.data.ok, false);
        assert.equal(player.wallet['igg' + clue.tier], before + 1);
      });
    });

    await test('LAN player identity is bound to the token despite a forged player field', async function () {
      await withPair(async function (pair) {
        const player = pair.room.game.state.players[0], opponent = pair.room.game.state.players[1];
        const clue = player.clue, opponentWallet = JSON.stringify(opponent.wallet);
        const result = await command(pair.a, 'answer', { clueId: clue.id, answer: clue.answer, playerId: 'p2' }, { playerId: 'p2' });
        assert.equal(JSON.stringify(opponent.wallet), opponentWallet, 'Forged identity modified opponent wallet.');
        assert.equal(opponent.stats.solved, 0);
        if (result.status === 200 && result.data.ok) assert.equal(player.stats.solved, 1);
        else assert.equal(player.stats.solved, 0);
      });
    });

    await test('LAN rejects unsupported commands and null or nonfinite polymer coordinates', async function () {
      await withPair(async function (pair) {
        const player = pair.room.game.state.players[0];
        assert.equal((await command(pair.a, 'teleport', { x: 200, y: 180 })).status, 403);
        for (const position of [{ x: NaN, y: 180 }, { x: 200, y: null }, { x: 'Infinity', y: 180 }, { x: 200, y: true }, { y: 180 }]) {
          const result = await command(pair.a, 'cast', position);
          assert.equal(result.status, 400, 'Invalid coordinates were accepted: ' + JSON.stringify(position));
          assert.equal(player.walls.length, 0); assert.equal(player.laserCooldown, 0);
        }
      });
    });

    await test('LAN shop costs, offensive dispatch, polymer, and laser cooldown stay authoritative', async function () {
      await withPair(async function (pair) {
        const player = pair.room.game.state.players[0], opponent = pair.room.game.state.players[1];
        const rejected = await command(pair.a, 'buy', { itemId: 'ethanol-1', cost: {} });
        assert.equal(rejected.data.ok, false); assert.equal(player.wallet.igg1, 0);
        player.wallet.igg1 = 4;
        assert.equal((await command(pair.a, 'buy', { itemId: 'ethanol-1', cost: {} })).data.ok, true);
        assert.equal(player.wallet.igg1, 0); assert.equal(player.coatingDps, 2);
        assert.equal((await command(pair.a, 'cast', { x: 200, y: 180, dps: 999 })).data.ok, true);
        assert.equal(player.walls.length, 1); assert.equal(player.walls[0].dps, 2);
        assert.equal((await command(pair.a, 'cast', { x: 300, y: 180 })).data.ok, false);
        assert.equal(player.walls.length, 1);
        player.wallet.igg1 = 3;
        assert.equal((await command(pair.a, 'buy', { itemId: 'send-basic', enemyType: 'elite', cost: {} })).data.ok, true);
        assert.equal(player.wallet.igg1, 2); assert.equal(opponent.enemies.length, 1);
        assert.equal(opponent.enemies[0].type, 'basic'); assert.equal(player.enemies.length, 0);
      });
    });

    await test('LAN purchased skips charge one IgG1, bank above two, and resume passive recharge below two', async function () {
      await withPair(async function (pair) {
        const player = pair.room.game.state.players[0];
        const rejected = await command(pair.a, 'buy', { itemId: 'buy-skip', cost: {} });
        assert.equal(rejected.data.ok, false); assert.equal(player.skipCharges, 2);
        player.wallet.igg1 = 5;
        for (let i = 0; i < 5; i++) assert.equal((await command(pair.a, 'buy', { itemId: 'buy-skip', charges: 999, cost: {} })).data.ok, true);
        assert.equal(player.skipCharges, 7); assert.equal(player.wallet.igg1, 0);
        assert.equal((await command(pair.a, 'buy', { itemId: 'buy-skip' })).data.ok, false);
        pair.room.game.step(60); assert.equal(player.skipCharges, 7); assert.equal(player.skipProgress, 0);
        for (let i = 0; i < 6; i++) assert.equal((await command(pair.a, 'skip')).data.ok, true);
        assert.equal(player.skipCharges, 1); pair.room.game.step(30.1);
        assert.equal(player.skipCharges, 2); assert.equal(player.skipProgress, 0); assert.equal(player.stats.solved, 0);
      });
    });

    await test('LAN E. coli dispatch keeps its IgG4 cost, rapid wall damage, and one-percent breach authoritative', async function () {
      await withPair(async function (pair) {
        const player = pair.room.game.state.players[0], opponent = pair.room.game.state.players[1];
        player.wallet.igg4 = 1;
        assert.equal((await command(pair.a, 'buy', { itemId: 'send-ecoli', cost: {}, enemyType: 'elite' })).data.ok, true);
        assert.equal(player.wallet.igg4, 0); assert.equal(opponent.enemies[0].type, 'ecoli');
        assert.equal(opponent.enemies[0].damage, 48); assert.equal(opponent.enemies[0].breach, 1);
        assert.equal((await command(pair.a, 'buy', { itemId: 'send-ecoli' })).data.ok, false);
        assert.equal((await command(pair.a, 'cast', { x: 200, y: 180 })).data.ok, true);
        const entry = pair.room.game._spawn(player, 'ecoli', 1, 180);
        entry.x = 200 + globalThis.LyricDefense.Config.radius - globalThis.LyricDefense.Config.wallThickness / 2 - entry.radius;
        pair.room.game.step(.8); assert.equal(player.walls.length, 1);
        pair.room.game.step(.3); assert.equal(player.walls.length, 0);
        entry.x = 1000;
        await until(function () { return player.contamination === 1; }, 'E. coli did not breach for exactly one percent.');
        assert.equal(pair.room.game.state.phase, 'playing');
      });
    });

    await test('LAN trivia accepts numeric and multiword aliases once while hiding canonical answers and aliases', async function () {
      const triviaHost = createLanServer({
        host: '127.0.0.1', port: 0, countdownSeconds: .05,
        clueProviderFactory: function (details) {
          let counter = 0;
          return { next: function (tier) {
            counter += 1;
            return {
              id: details.playerId + '-trivia-' + counter, kind: 'trivia', tier: tier,
              text: counter === 1 ? 'What is the number?' : 'Which mission?',
              answer: counter === 1 ? '42' : 'Apollo 11',
              acceptedAnswers: counter === 1 ? ['forty-two'] : ['Apollo XI']
            };
          } };
        }
      });
      const localStreams = [];
      try {
        const details = await triviaHost.start();
        const post = async function (route, body) {
          const response = await fetch(details.url + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
          assert.equal(response.status >= 200 && response.status < 300, true);
          return response.json();
        };
        const a = await post('/api/rooms', { name: 'Trivia A' });
        const b = await post('/api/rooms/' + a.roomCode + '/join', { name: 'Trivia B' });
        const room = triviaHost.rooms.get(a.roomCode); room.game.state.naturalEnabled = false;
        for (const actor of [a, b]) {
          const stream = new EventStream(details.url + '/api/rooms/' + a.roomCode + '/events?token=' + encodeURIComponent(actor.token));
          localStreams.push(stream); await stream.ready;
        }
        await until(function () { return room.game.state.phase === 'playing'; }, 'Trivia match did not start.');
        for (let i = 0; i < localStreams.length; i++) {
          await localStreams[i].wait(function (stream) { return stream.state && stream.state.phase === 'playing'; }, 'Trivia snapshot was not published.');
          const own = localStreams[i].state.players[i];
          assert.equal(own.clue.kind, 'trivia'); assert.equal(own.clue.answer, undefined); assert.equal(own.clue.acceptedAnswers, undefined);
          assert.equal(localStreams[i].state.players[1 - i].clue, null);
        }
        const submit = function (clueId, answer) { return post('/api/rooms/' + a.roomCode + '/commands', { token: a.token, matchId: room.matchId, command: { type: 'answer', payload: { clueId: clueId, answer: answer } } }); };
        const player = room.game.state.players[0], first = player.clue;
        assert.equal((await submit(first.id, '4')).ok, false);
        assert.equal((await submit(first.id, '42')).ok, true);
        assert.equal((await submit(first.id, 'forty-two')).ok, false);
        assert.equal(player.stats.solved, 1);
        const second = player.clue;
        assert.equal((await submit(second.id, 'apollo')).ok, false);
        assert.equal((await submit(second.id, ' APOLLO XI! ')).ok, true);
        assert.equal(player.stats.solved, 2);
        assert.equal(Object.values(player.wallet).reduce(function (total, amount) { return total + amount; }, 0), 2);
      } finally {
        await Promise.all(localStreams.map(function (stream) { return stream.close(); }));
        await triviaHost.close();
      }
    });

    await test('LAN command bursts return JSON rate limits and recover without stopping the host', async function () {
      await withPair(async function (pair) {
        const replies = await Promise.all(Array.from({ length: 60 }, function () {
          return command(pair.a, 'answer', { clueId: 'old-clue', answer: 'HOT' });
        }));
        assert(replies.some(function (reply) { return reply.status === 429; }), 'Command burst did not reach the bounded limiter.');
        replies.forEach(function (reply) {
          assert([200, 429].includes(reply.status), 'Command burst caused an unexpected response: ' + reply.status);
          assert.equal(reply.data.ok, false);
          if (reply.status === 429) assert.equal(typeof reply.data.reason, 'string');
        });
        assert.equal(pair.room.game.state.players[0].stats.solved, 0);
        await delay(150);
        const healthy = await command(pair.a, 'answer', { clueId: 'old-clue', answer: 'HOT' });
        assert.equal(healthy.status, 200); assert.equal(healthy.data.ok, false);
        assert.equal(pair.room.game.state.phase, 'playing');
      });
    });

    await test('LAN disconnect freezes the match and the same token reconnects before grace expiry', async function () {
      await withPair(async function (pair) {
        await pair.sa.close();
        await until(function () { return pair.room.status === 'paused'; }, 'Disconnect did not pause authority.');
        const frozen = pair.room.game.state.time;
        await delay(70); assert.equal(pair.room.game.state.time, frozen);
        assert.equal(pair.room.game.state.phase, 'paused');
        const resumed = await connect(pair.a); pair.active.push(resumed);
        await until(function () { return pair.room.status === 'playing' && pair.room.game.state.phase === 'playing'; }, 'Reconnect did not resume authority.');
        await until(function () { return pair.room.game.state.time > frozen; }, 'Resumed time did not advance.');
        assert.equal(resumed.session.playerId, 'p1');
      });
    });

    await test('LAN disconnect grace expiry records a forfeit and retains the ended room', async function () {
      await withPair(async function (pair) {
        await pair.sa.close();
        await until(function () { return pair.room.status === 'ended'; }, 'Disconnect grace did not end match.');
        assert.equal(pair.room.game.state.winner, 'p2');
        assert(application.rooms.has(pair.a.roomCode));
        await pair.sb.wait(function (stream) { return stream.state.phase === 'ended'; }, 'Opponent did not receive forfeit outcome.');
      });
    });

    await test('LAN two offline players produce a draw when disconnect grace expires', async function () {
      await withPair(async function (pair) {
        await Promise.all([pair.sa.close(), pair.sb.close()]);
        await until(function () { return pair.room.status === 'ended'; }, 'Both-disconnected match did not resolve.');
        assert.equal(pair.room.game.state.winner, 'draw');
      });
    });

    await test('LAN breach ends the match and rejects subsequent gameplay', async function () {
      await withPair(async function (pair) {
        await endByBreach(pair);
        assert.equal((await command(pair.a, 'skip')).data.ok, false);
        await pair.sb.wait(function (stream) { return stream.state.phase === 'ended' && stream.state.winner === 'p2'; }, 'End state was not delivered.');
      });
    });

    await test('LAN mutual rematch clears gameplay state, changes matchId, and rejects stale commands', async function () {
      await withPair(async function (pair) {
        assert.equal((await request('/api/rooms/' + pair.a.roomCode + '/rematch', { token: pair.a.token })).status, 409);
        pair.room.game.state.players[0].wallet.igg1 = 12;
        await endByBreach(pair);
        const oldMatch = pair.room.matchId;
        const first = await request('/api/rooms/' + pair.a.roomCode + '/rematch', { token: pair.a.token });
        assert.equal(first.status, 200); assert.equal(pair.room.matchId, oldMatch);
        assert.equal(pair.room.game.state.phase, 'ended');
        const second = await request('/api/rooms/' + pair.a.roomCode + '/rematch', { token: pair.b.token });
        assert.equal(second.status, 200);
        await until(function () { return pair.room.matchId !== oldMatch && pair.room.game.state.phase === 'playing'; }, 'Mutual rematch did not start.');
        pair.room.game.state.naturalEnabled = false;
        pair.room.game.state.players.forEach(function (player) {
          assert(Object.values(player.wallet).every(function (amount) { return amount === 0; }));
          assert.equal(player.contamination, 0); assert.equal(player.enemies.length, 0); assert.equal(player.walls.length, 0);
          assert.equal(player.stats.solved, 0); assert.equal(player.stats.sent, 0);
        });
        const stale = await command(pair.a, 'skip', {}, { matchId: oldMatch });
        assert.equal(stale.status, 409); assert.equal(pair.room.game.state.players[0].skipCharges, 2);
        await pair.sa.wait(function (stream) { return stream.state.matchId === pair.room.matchId && stream.session.matchId === pair.room.matchId; }, 'Rematch ID was not delivered to both channels.');
      });
    });

    await test('LAN explicit leave publishes a forfeit, closes streams, and deletes the room', async function () {
      await withPair(async function (pair) {
        const response = await request('/api/rooms/' + pair.a.roomCode + '/leave', { token: pair.a.token });
        assert.equal(response.status, 200);
        await pair.sb.wait(function (stream) { return stream.events.some(function (event) { return event.type === 'closed'; }); }, 'Leave did not close opponent stream.');
        assert(pair.sb.events.some(function (event) { return event.type === 'state' && event.data.phase === 'ended' && event.data.winner === 'p2'; }), 'Leave omitted final forfeit snapshot.');
        assert.equal(application.rooms.has(pair.a.roomCode), false);
      });
    });

    await test('LAN static serving allows the game and blocks source and traversal paths', async function () {
      const index = await rawGet(address, '/'); assert.equal(index.status, 200); assert.match(index.text, /<!doctype html>/i);
      const config = await rawGet(address, '/js/config.js'); assert.equal(config.status, 200); assert.match(config.text, /LyricDefense/);
      const review = await rawGet(address, '/trivia-review.html'); assert.equal(review.status, 200); assert.match(review.text, /trivia-expanded-bank\.js/);
      const sample = await rawGet(address, '/js/trivia-expanded-bank.js'); assert.equal(sample.status, 200); assert.match(sample.text, /TriviaBank/);
      const list = await rawGet(address, '/assets/trivia/expanded-questions.json'); assert.equal(list.status, 200);
      const exported = JSON.parse(list.text); assert.equal(exported.questions.length, 5000); assert.equal(exported.metadata.count, 5000);
      for (const requestPath of ['/server.js', '/scripts/import-clues.js', '/tests/run.js', '/.git/config', '/../server.js', '/..%2fserver.js', '/%2e%2e%2fserver.js']) {
        const blocked = await rawGet(address, requestPath);
        assert([400, 403, 404].includes(blocked.status), 'Unexpected static exposure: ' + requestPath + ' status ' + blocked.status);
        assert(!blocked.text.includes('createLanServer'), 'Server source leaked through ' + requestPath);
      }
    });
  } finally {
    await Promise.all(Array.from(streams).map(function (stream) { return stream.close(); }));
    await application.close();
  }
  return results;
}

module.exports = { runLanTests: runLanTests };
if (require.main === module) runLanTests().then(function (results) {
  results.forEach(function (result) { console.log((result.ok ? 'PASS ' : 'FAIL ') + result.name + (result.error ? '\n     ' + result.error : '')); });
  console.log('\n' + results.filter(function (result) { return result.ok; }).length + '/' + results.length + ' LAN checks passed.');
  process.exitCode = results.every(function (result) { return result.ok; }) ? 0 : 1;
}).catch(function (error) { console.error(error.stack); process.exitCode = 1; });
