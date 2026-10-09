'use strict';
// Real browser clients against an ephemeral authoritative host; no npm packages.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createLanServer } = require('../server.js');
const { Protocol, waitFor, waitForDebuggingEndpoint, browsers, delay, assert } = require('./browser-smoke.js');
const artifactPath = path.resolve(__dirname, '../tests/artifacts');

async function launch(name, executable, url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-defense-lan-' + name + '-'));
  const child = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', protocol;
  const client = { name, child, profile, errors: [], session: null, protocol: null };
  try {
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    const endpoint = await waitForDebuggingEndpoint(child, profile, name);
    protocol = client.protocol = new Protocol(endpoint);
    await protocol.ready;
    const target = await protocol.send('Target.createTarget', { url: 'about:blank' });
    client.session = (await protocol.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    protocol.listeners.add(message => { if (message.sessionId === client.session && message.method === 'Runtime.exceptionThrown') client.errors.push(message.params.exceptionDetails); });
    await protocol.send('Runtime.enable', {}, client.session);
    await protocol.send('Page.enable', {}, client.session);
    await protocol.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, client.session);
    await protocol.send('Page.navigate', { url }, client.session);
    await waitFor(protocol, client.session, "document.readyState==='complete' && Boolean(window.LyricDefense && LyricDefense.app && document.getElementById('lan-create'))");
    client.evaluate = expression => protocol.evaluate(expression, client.session);
    client.wait = (expression, timeout) => waitFor(protocol, client.session, expression, timeout);
    client.stderr = () => stderr;
    return client;
  } catch (error) {
    await closeClient(client);
    throw error;
  }
}

async function closeClient(client) {
  if (client.protocol) { try { await client.protocol.send('Browser.close'); } catch (_) {} client.protocol.close(); }
  client.child.kill();
  await delay(200);
  // Only remove the exact profile created under the system temporary directory.
  const resolved = path.resolve(client.profile);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('lyric-defense-lan-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) {}
  }
}

async function clickCanvas(client, x, y) {
  const point = await client.evaluate("(()=>{const r=document.getElementById('reactor-canvas').getBoundingClientRect();return{x:r.left+r.width*" + x + "/800,y:r.top+r.height*" + y + "/360};})()");
  await client.protocol.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y }, client.session);
  await client.protocol.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }, client.session);
  await client.protocol.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }, client.session);
}

async function buy(client, tab, item) {
  await client.evaluate("document.querySelector('[data-tab=" + tab + "]').click();document.querySelector('[data-item-id=" + item + "]').click();document.getElementById('buy-button').click();");
}

async function main() {
  assert(browsers.length >= 2, 'Install Chrome and Edge to run this two-browser smoke test.');
  fs.mkdirSync(artifactPath, { recursive: true });
  const host = createLanServer({ host: '0.0.0.0', port: 0 });
  const clients = [];
  try {
    await host.start();
    const url = 'http://127.0.0.1:' + host.server.address().port + '/';
    for (const [name, executable] of browsers.slice(0, 2)) clients.push(await launch(name, executable, url));
    const [first, second] = clients;
    await first.evaluate("document.getElementById('lan-name').value='Host scientist';document.getElementById('lan-create').click();");
    await first.wait("LyricDefense.app.mode==='lan' && Boolean(LyricDefense.app.transport && LyricDefense.app.transport.roomCode)");
    const code = await first.evaluate('LyricDefense.app.transport.roomCode');
    await second.evaluate("document.getElementById('lan-room-code').value='000000';document.getElementById('lan-join').click();");
    await second.wait("document.getElementById('lan-status').textContent.includes('Room not found') && !document.getElementById('lan-join').disabled");
    await second.evaluate("document.getElementById('lan-name').value='Guest scientist';document.getElementById('lan-room-code').value=" + JSON.stringify(code) + ";document.getElementById('lan-join').click();");
    await second.wait("LyricDefense.app.mode==='lan' && LyricDefense.app.state && LyricDefense.app.state.phase==='playing'", 9000);
    await first.wait("LyricDefense.app.state && LyricDefense.app.state.phase==='playing'", 9000);
    assert(await first.evaluate("LyricDefense.app.playerId==='p1' && LyricDefense.app.game===null && document.getElementById('sandbox-panel').hidden"), 'Host is not using a server-owned p1 match');
    assert(await second.evaluate("LyricDefense.app.playerId==='p2' && LyricDefense.app.game===null && document.getElementById('sandbox-panel').hidden"), 'Guest is not using a server-owned p2 match');
    const room = host.rooms.get(code);
    assert(room && room.game, 'No authoritative match was created');
    room.game.state.naturalEnabled = false;
    const originalMatch = room.matchId;

    for (let index = 0; index < 2; index++) {
      const client = clients[index], own = room.game.state.players[index];
      assert(own.clue.kind === 'trivia', 'The LAN host is still serving crossword clues');
      const clue = { ...own.clue }, balance = own.wallet['igg' + clue.tier];
      assert(await client.evaluate("!('answer' in LyricDefense.app.state.players.find(p=>p.id===LyricDefense.app.playerId).clue)"), 'Live clue answer leaked to a browser');
      await client.evaluate("document.getElementById('answer-input').focus()");
      await client.protocol.send('Input.insertText', { text: clue.answer.toLowerCase() }, client.session);
      await client.protocol.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, client.session);
      await client.protocol.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, client.session);
      await client.wait("LyricDefense.app.state.players.find(p=>p.id===LyricDefense.app.playerId).clue.id!==" + JSON.stringify(clue.id));
      assert(own.wallet['igg' + clue.tier] === balance + 1, 'Keyboard clue reward changed the wrong wallet');
      Object.keys(own.wallet).forEach(key => { own.wallet[key] = 12; });
    }
    const numeric = room.game.state.players[1];
    numeric.clue = { id: 'lan-numeric-trivia', text: 'In what year did Apollo 11 first land on the Moon?', kind: 'trivia', answer: '1969', acceptedAnswers: ['1969'], tier: 2, length: 4 };
    await second.wait("LyricDefense.app.state.players.find(p=>p.id==='p2').clue.id==='lan-numeric-trivia'");
    await second.evaluate("document.getElementById('answer-input').focus()");
    await second.protocol.send('Input.insertText', { text: '1969' }, second.session);
    await second.protocol.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, second.session);
    await second.protocol.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, second.session);
    await second.wait("LyricDefense.app.state.players.find(p=>p.id==='p2').clue.id!=='lan-numeric-trivia'");
    assert(numeric.wallet.igg2 === 13, 'LAN numeric trivia input was rejected or rewarded incorrectly');
    numeric.wallet.igg2 = 12;
    await first.wait("LyricDefense.app.state.players.find(p=>p.id===LyricDefense.app.playerId).wallet.igg1===12");
    await second.wait("LyricDefense.app.state.players.find(p=>p.id===LyricDefense.app.playerId).wallet.igg1===12");
    await buy(first, 'OFFENSE', 'send-basic');
    await second.wait("LyricDefense.app.state.players.find(p=>p.id==='p2').enemies.some(e=>e.type==='basic')");
    await buy(second, 'OFFENSE', 'send-fast');
    await first.wait("LyricDefense.app.state.players.find(p=>p.id==='p1').enemies.some(e=>e.type==='fast')");
    assert(room.game.state.players[0].wallet.igg1 === 11 && room.game.state.players[1].wallet.igg2 === 11, 'Offensive costs were not charged to the correct seats');

    await clickCanvas(first, 320, 180);
    await first.wait("LyricDefense.app.state.players.find(p=>p.id==='p1').walls.length===1");
    await buy(second, 'LASER', 'image-grid');
    await second.wait("LyricDefense.app.state.players.find(p=>p.id==='p2').polymerImage==='grid3x3'");
    await clickCanvas(second, 450, 180);
    await second.wait("LyricDefense.app.state.players.find(p=>p.id==='p2').walls.length===9");
    await buy(second, 'OFFENSE', 'send-ecoli');
    await first.wait("LyricDefense.app.state.players.find(p=>p.id==='p1').enemies.some(e=>e.type==='ecoli')");
    assert(room.game.state.players[1].wallet.igg4 === 11, 'LAN E. coli cost was not one IgG4');
    await buy(first, 'CLUES', 'buy-skip');
    await first.wait("LyricDefense.app.state.players.find(p=>p.id==='p1').skipCharges===3 && document.getElementById('skip-count').textContent==='3 / 2'");
    assert(await second.evaluate("LyricDefense.app.renderer.playerId==='p2' && LyricDefense.app.opponentRenderer.playerId==='p1'"), 'Guest renderers have the wrong player identity');
    await second.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;");
    assert(room.game.state.phase === 'playing', 'Hidden tab paused an active LAN match');
    for (const client of clients) {
      assert(await client.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), 'LAN UI overflows horizontally');
      const shot = await client.protocol.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, client.session);
      fs.writeFileSync(path.join(artifactPath, client.name + '-lan.png'), Buffer.from(shot.data, 'base64'));
    }

    await second.protocol.send('Page.reload', {}, second.session);
    await second.wait("Boolean(window.LyricDefense && LyricDefense.app && LyricDefense.app.mode==='lan' && LyricDefense.app.playerId==='p2' && LyricDefense.app.state && LyricDefense.app.state.phase==='playing')", 12000);
    assert(host.rooms.get(code).matchId === originalMatch, 'Reload replaced the existing match');
    assert(room.game.state.players[1].walls.length === 9, 'Reload lost the guest reactor');

    const loser = room.game.state.players[0];
    loser.contamination = 99;
    const breach = room.game._spawn(loser, 'basic', 1, 100);
    breach.x = globalThis.LyricDefense.Config.cultureX + 2;
    await first.wait("LyricDefense.app.state.phase==='ended' && LyricDefense.app.state.winner==='p2'");
    await second.wait("LyricDefense.app.state.phase==='ended' && LyricDefense.app.state.winner==='p2'");
    assert(await second.evaluate("document.getElementById('overlay-title').textContent.toLowerCase().includes('secured')"), 'Guest did not see their victory');
    await first.evaluate("document.getElementById('restart-button').click()");
    await delay(150);
    assert(room.game.state.phase === 'ended', 'One player reset the match unilaterally');
    await second.evaluate("document.getElementById('restart-button').click()");
    await first.wait("LyricDefense.app.state.matchId!==" + JSON.stringify(originalMatch) + " && LyricDefense.app.state.phase==='countdown'");
    assert(room.game.state.players.every(p => p.walls.length === 0 && p.enemies.length === 0 && Object.values(p.wallet).every(value => value === 0)), 'Mutual rematch retained previous-round state');
    await second.evaluate("document.getElementById('leave-button').click()");
    await first.wait("!document.getElementById('welcome-screen').hidden && LyricDefense.app.transport===null");
    await second.wait("!document.getElementById('welcome-screen').hidden && LyricDefense.app.transport===null");
    assert(!host.rooms.has(code), 'Leaving did not release the room');

    // Storage is optional: a player can still create/join/play for this page session.
    await second.protocol.send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window,'sessionStorage',{get:function(){throw new Error('Storage denied by LAN smoke test');}});" }, second.session);
    await second.protocol.send('Page.reload', {}, second.session);
    await second.wait("Boolean(window.LyricDefense && LyricDefense.app && document.readyState==='complete')");
    await first.evaluate("document.getElementById('lan-create').click()");
    await first.wait("LyricDefense.app.mode==='lan' && Boolean(LyricDefense.app.transport)");
    const fallbackCode = await first.evaluate('LyricDefense.app.transport.roomCode');
    await second.evaluate("document.getElementById('lan-room-code').value=" + JSON.stringify(fallbackCode) + ";document.getElementById('lan-join').click();");
    await second.wait("LyricDefense.app.mode==='lan' && LyricDefense.app.playerId==='p2' && LyricDefense.app.state && LyricDefense.app.state.phase==='playing'", 9000);
    await second.evaluate("document.getElementById('leave-button').click()");
    await first.wait("!document.getElementById('welcome-screen').hidden");
    for (const client of clients) assert(client.errors.length === 0, client.name + ' uncaught errors: ' + JSON.stringify(client.errors));
    console.log('PASS Chrome versus Edge: room join/errors, trivia and numeric rewards, banked skips, E. coli/other attacks, ring/grid mouse casts, hidden tabs, reload recovery, outcome, mutual rematch, leave, and denied storage.');
  } catch (error) {
    for (const client of clients) {
      fs.writeFileSync(path.join(artifactPath, client.name + '-lan-stderr.txt'), client.stderr ? client.stderr() : '');
      try {
        const shot = await client.protocol.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, client.session);
        fs.writeFileSync(path.join(artifactPath, client.name + '-lan-failure.png'), Buffer.from(shot.data, 'base64'));
      } catch (_) {}
    }
    throw error;
  } finally {
    for (const client of clients) await closeClient(client);
    await host.close();
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
