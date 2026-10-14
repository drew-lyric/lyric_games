'use strict';
// Shared-launcher integration checks. Uses the existing dependency-free CDP helper.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { Protocol, waitForDebuggingEndpoint, browsers, delay, assert } = require('../lyric_biodefenses/scripts/browser-smoke.js');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'tests', 'artifacts');

async function launch(name, executable) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-games-' + name + '-'));
  const processHandle = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const client = { name, profile, processHandle, contexts: new Map(), errors: [], stderr: '', protocol: null };
  processHandle.stderr.on('data', chunk => { client.stderr += chunk.toString(); });
  try {
    const endpoint = await waitForDebuggingEndpoint(processHandle, profile, name);
    const protocol = client.protocol = new Protocol(endpoint);
    await protocol.ready;
    const target = await protocol.send('Target.createTarget', { url: 'about:blank' });
    client.session = (await protocol.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    protocol.listeners.add(message => {
      if (message.sessionId !== client.session) return;
      if (message.method === 'Runtime.executionContextCreated') client.contexts.set(message.params.context.id, message.params.context);
      if (message.method === 'Runtime.executionContextDestroyed') client.contexts.delete(message.params.executionContextId);
      if (message.method === 'Runtime.executionContextsCleared') client.contexts.clear();
      if (message.method === 'Runtime.exceptionThrown') client.errors.push(message.params.exceptionDetails);
    });
    await protocol.send('Runtime.enable', {}, client.session);
    await protocol.send('Page.enable', {}, client.session);
    await protocol.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false }, client.session);
    client.evaluate = expression => protocol.evaluate(expression, client.session);
    client.gameContext = async () => {
      const tree = await protocol.send('Page.getFrameTree', {}, client.session);
      const frame = tree.frameTree.childFrames && tree.frameTree.childFrames[0];
      if (!frame) return null;
      return Array.from(client.contexts.values()).find(context => context.auxData && context.auxData.isDefault && context.auxData.frameId === frame.frame.id);
    };
    client.gameEvaluate = async expression => {
      const context = await client.gameContext();
      if (!context) throw new Error('Game frame context not ready');
      const result = await protocol.send('Runtime.evaluate', { expression, contextId: context.id, returnByValue: true, awaitPromise: true }, client.session);
      if (result.exceptionDetails) throw new Error('Game evaluation failed: ' + JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    client.wait = (expression, timeout) => waitCondition(() => client.evaluate(expression), expression, timeout);
    client.gameWait = (expression, timeout) => waitCondition(async () => {
      if (!await client.gameContext()) return false;
      return client.gameEvaluate(expression);
    }, expression, timeout);
    client.key = async (key, code, down) => {
      const codes = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, ' ': 32, z: 90, x: 88, p: 80, Escape: 27 };
      await protocol.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', key, code, windowsVirtualKeyCode: codes[key] }, client.session);
    };
    client.tap = async (key, code) => { await client.key(key, code, true); await delay(45); await client.key(key, code, false); };
    client.screenshot = async label => {
      const shot = await protocol.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, client.session);
      fs.writeFileSync(path.join(artifacts, name + '-' + label + '.png'), Buffer.from(shot.data, 'base64'));
    };
    return client;
  } catch (error) { await close(client); throw error; }
}

async function waitCondition(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await check()) return; }
    catch (error) { if (!/context.*(ready|destroy|find)|Cannot find context|Inspected target navigated/i.test(error.message)) throw error; }
    await delay(80);
  }
  throw new Error('Condition timed out: ' + label);
}

async function close(client) {
  if (client.protocol) { try { await client.protocol.send('Browser.close'); } catch (_) {} client.protocol.close(); }
  client.processHandle.kill();
  await delay(200);
  const resolved = path.resolve(client.profile);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('lyric-games-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* Chromium may briefly retain a profile lock. */ }
  }
}

async function navigate(client, url) {
  await client.protocol.send('Page.navigate', { url }, client.session);
  await client.wait("document.readyState==='complete' && Boolean(window.LyricGames)");
}

async function exitGame(client) {
  await client.evaluate("document.getElementById('all-games').click()");
  await client.wait("!document.getElementById('game-frame') && !document.getElementById('library-screen').hidden", 14000);
  assert(!await client.gameContext(), 'Exited game still has an execution context');
}

async function play(client, id) {
  await client.evaluate("LyricGames.select(" + JSON.stringify(id) + ");document.getElementById('play-button').click()");
  await client.wait("document.querySelectorAll('iframe').length===1");
}

async function checkShooter(client) {
  await play(client, 'antigen-assault');
  await client.gameWait("Boolean(window.LyricGalaga && LyricGalaga.app && LyricGalaga.app.game)");
  assert(await client.gameEvaluate("LyricGalaga.app.game.state.status==='ready' && LyricGalaga.app.game.state.opsonins===0"), 'Shooter did not open at a fresh zero-stock welcome');
  assert(await client.gameEvaluate("document.getElementById('antigen-response').checked && LyricGalaga.app.game.state.antigenResponse"), 'Antigen response must default on');
  await client.gameEvaluate("document.getElementById('antigen-response').focus()");
  await client.tap(' ', 'Space');
  assert(await client.gameEvaluate("!document.getElementById('antigen-response').checked && !LyricGalaga.app.game.state.antigenResponse"), 'Keyboard could not switch antigen response off');
  for (const [width,height] of [[1440,900],[1366,768]]) {
    await client.protocol.send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false }, client.session);
    await delay(80);
    assert(await client.gameEvaluate("(()=>{const c=document.getElementById('game-canvas').getBoundingClientRect(),b=document.getElementById('overlay-action').getBoundingClientRect();return c.top>=0&&c.bottom<=innerHeight+1&&b.top>=c.top&&b.bottom<=c.bottom+1;})()"), 'Arena or Start button is outside the viewport at '+width+'x'+height);
  }
  await client.screenshot('shooter-laptop');
  await client.protocol.send('Emulation.setDeviceMetricsOverride', { width:1440,height:1080,deviceScaleFactor:1,mobile:false }, client.session);
  await client.screenshot('shooter-welcome');
  await client.gameEvaluate("document.getElementById('overlay-action').click()");
  await client.gameWait("LyricGalaga.app.game.state.status==='playing'", 5000);
  // Input checks should not depend on random enemy fire hitting during a slow
  // browser run. Survival and damage are covered by the simulation suite.
  await client.gameEvaluate('LyricGalaga.app.game.state.player.invulnerable=1000');
  assert(await client.gameEvaluate("!LyricGalaga.app.game.state.antigenResponse"), 'Starting a run discarded the response setting');
  await client.gameEvaluate("LyricGalaga.app.game.state.antigens.forEach(a=>a.shotTimer=0)");
  await delay(100);
  assert(await client.gameEvaluate("LyricGalaga.app.game.state.enemyShots.length===0"), 'Antigens fire when response is disabled');
  await client.gameEvaluate("document.getElementById('antigen-response').focus()");
  await client.tap(' ', 'Space');
  assert(await client.gameEvaluate("LyricGalaga.app.game.state.antigenResponse && document.activeElement.id==='game-canvas'"), 'Response checkbox lost native Space behavior or arena focus');
  await client.gameEvaluate("document.querySelector('canvas').focus()");
  const startX = await client.gameEvaluate('LyricGalaga.app.game.state.player.x');
  await client.key('ArrowLeft', 'ArrowLeft', true); await delay(240); await client.key('ArrowLeft', 'ArrowLeft', false);
  assert(await client.gameEvaluate('LyricGalaga.app.game.state.player.x<' + (startX - 20)), 'Arrow key did not move the ship inside the launcher');
  await client.key(' ', 'Space', true); await delay(180);
  assert(await client.gameEvaluate('LyricGalaga.app.game.state.shots.length>=2'), 'Space did not fire paired antibodies');
  await client.key(' ', 'Space', false);
  await client.gameEvaluate("LyricGalaga.app.game.state.opsonins=2;LyricGalaga.app.game.state.unlocked=['green','blue']");
  const startY=await client.gameEvaluate('LyricGalaga.app.game.state.player.y');
  await client.key('ArrowUp','ArrowUp',true);await delay(240);await client.key('ArrowUp','ArrowUp',false);
  assert(await client.gameEvaluate('LyricGalaga.app.game.state.player.y<'+(startY-20)+" && LyricGalaga.app.game.state.weapon==='green'"), 'Up must move the ship without cycling weapons');
  const upperY=await client.gameEvaluate('LyricGalaga.app.game.state.player.y');
  await delay(80);
  assert(await client.gameEvaluate('LyricGalaga.app.game.state.player.y==='+upperY), 'Releasing Up left vertical movement stuck');
  await client.key('ArrowDown','ArrowDown',true);await delay(450);await client.key('ArrowDown','ArrowDown',false);
  assert(await client.gameEvaluate("(()=>{const g=LyricGalaga.app.game;return Math.abs(g.state.player.y-(g.config.height-g.config.player.bottom))<1e-8&&g.state.weapon==='green';})()"), 'Down must move to the lower band limit without cycling weapons');
  await client.tap('z', 'KeyZ');
  await client.gameWait("LyricGalaga.app.game.state.weapon==='blue'");
  await client.tap('z', 'KeyZ');
  await client.gameWait("LyricGalaga.app.game.state.weapon==='white'");
  await client.key(' ', 'Space', true); await delay(220);
  assert(await client.gameEvaluate('Boolean(LyricGalaga.app.game.state.charge) && LyricGalaga.app.game.state.opsonins===2'), 'Held Space should charge without spending stock: '+JSON.stringify(await client.gameEvaluate('({status:LyricGalaga.app.game.state.status,stock:LyricGalaga.app.game.state.opsonins,charge:LyricGalaga.app.game.state.charge,weapon:LyricGalaga.app.game.state.weapon,fire:LyricGalaga.app.controls.keyboard.sample().fire})')));
  await client.key(' ', 'Space', false);
  await client.gameWait('LyricGalaga.app.game.state.opsonins===1 && LyricGalaga.app.game.state.orbs.length===1');
  await client.gameWait("LyricGalaga.app.game.state.orbs[0].status==='settled'", 5000);
  await client.tap('x', 'KeyX');
  assert(await client.gameEvaluate('LyricGalaga.app.game.state.orbs.length===0 && LyricGalaga.app.game.state.macrophages.length>0'), 'X did not start a delayed macrophage attack');
  await client.screenshot('macrophage');
  await delay(650);
  await client.gameEvaluate("(()=>{const g=LyricGalaga.app.game,s=g.state;s.weapon='green';s.charge=null;s.shots=[];s.antigens=[];s.player.cooldown=0;g._previousFire=false;g._requireFireRelease=false;s.pickups.push({id:++g._entityId,kind:'ivig',color:'rainbow',x:s.player.x-19,y:s.player.y-55,radius:g.config.ivig.pickupRadius,vx:70,direction:1,age:0,lifetime:5,phase:0});})()");
  await client.key(' ', 'Space', true);
  await client.gameWait('LyricGalaga.app.game.state.ivigRemaining>29');
  await client.key(' ', 'Space', false);
  await delay(180);
  await client.gameEvaluate('LyricGalaga.app.game.state.shots=[];LyricGalaga.app.game.state.player.cooldown=0');
  await client.key(' ', 'Space', true);await delay(70);await client.key(' ', 'Space', false);
  assert(await client.gameEvaluate("(()=>{const shots=LyricGalaga.app.game.state.shots;return shots.length===8&&['green','blue','purple','gold'].every(c=>shots.filter(s=>s.color===c).length===2);})()"), 'IVIG must fire two antibodies of each color per volley');
  assert(await client.gameEvaluate("!document.getElementById('ivig-timer').hidden && document.getElementById('ivig-value').textContent.endsWith('s')"), 'IVIG countdown missing');
  assert(await client.gameEvaluate("(()=>{const a=LyricGalaga.app,before=JSON.stringify(a.game.state);a.renderer.render(a.game.state,0);return JSON.stringify(a.game.state)===before;})()"), 'IVIG renderer mutated combat state');
  await client.screenshot('ivig-active');
  await client.tap('p', 'KeyP');
  await client.gameWait("LyricGalaga.app.game.state.status==='paused'");
  const ivigPaused=await client.gameEvaluate('LyricGalaga.app.game.state.ivigRemaining');
  await delay(120);
  assert(await client.gameEvaluate('LyricGalaga.app.game.state.ivigRemaining==='+ivigPaused), 'Pause consumed IVIG time');
  const pixels = await client.gameEvaluate("(()=>{const c=document.querySelector('canvas');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);})()");
  assert(pixels, 'Shooter canvas was blank');
  await client.gameEvaluate("document.getElementById('game-overlay').style.visibility='hidden'");
  await client.screenshot('shooter-playing');
  await client.gameEvaluate("document.getElementById('game-overlay').style.visibility='';document.getElementById('overlay-action').focus()");
  await client.tap(' ', 'Space');
  await client.gameWait("LyricGalaga.app.game.state.status==='playing'");
  await client.tap('p', 'KeyP');
  await client.gameWait("LyricGalaga.app.game.state.status==='paused'");
  await client.protocol.send('Emulation.setDeviceMetricsOverride', { width: 740, height: 1000, deviceScaleFactor: 1, mobile: false }, client.session);
  assert(await client.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Launcher overflows at narrow width');
  assert(await client.gameEvaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Shooter overflows at narrow width');
  await client.screenshot('shooter-narrow');
  await client.protocol.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false }, client.session);
  await client.gameEvaluate("(async()=>{const L=LyricGalaga,c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.fillStyle='rgb(10,240,20)';x.fillRect(0,0,16,16);window.originalShipArt=L.AssetManifest.ship;L.AssetManifest.ship=Object.assign({},originalShipArt,{src:c.toDataURL(),frameWidth:16,frameHeight:16,animations:{idle:[0]}});await L.Assets.load();})()");
  assert(await client.gameEvaluate("(()=>{const c=document.createElement('canvas');c.width=c.height=16;LyricGalaga.Assets.draw(c.getContext('2d'),'ship',0,0,16,16,0);const p=c.getContext('2d').getImageData(8,8,1,1).data;return p[0]===10&&p[1]===240&&p[2]===20;})()"), 'Custom shooter sprite failed to load');
  await client.gameEvaluate("(async()=>{LyricGalaga.AssetManifest.ship.src='assets/intentionally-missing-smoke-test.png';await LyricGalaga.Assets.load();})()");
  assert(await client.gameEvaluate("(()=>{const c=document.createElement('canvas');c.width=c.height=32;const kind=LyricGalaga.Assets.draw(c.getContext('2d'),'ship',0,0,32,32,0);return kind==='fallback'&&c.getContext('2d').getImageData(0,0,32,32).data.some((v,i)=>i%4===3&&v>0);})()"), 'Missing shooter artwork did not retain a procedural fallback');
  await client.gameEvaluate("(async()=>{LyricGalaga.AssetManifest.ship=originalShipArt;await LyricGalaga.Assets.load();})()");
  await client.gameEvaluate("document.getElementById('restart-button').click()");
  await client.gameWait("LyricGalaga.app.game.state.level===1 && LyricGalaga.app.game.state.opsonins===0 && LyricGalaga.app.game.state.orbs.length===0 && LyricGalaga.app.game.state.ivigRemaining===0");
  await client.gameEvaluate("window.dispatchEvent(new Event('blur'))");
  await client.gameWait("LyricGalaga.app.game.state.status==='paused'");
  await client.gameEvaluate("(()=>{const a=LyricGalaga.app,g=a.game;g._enterLevel(6);g.state.boss.color='purple';g.state.boss.phase=2;g.state.boss.health=g.state.boss.maxHealth*.55;g.state.weapon='purple';g._spawnAntigen('purple','zigzag',{x:245,y:300,homeX:245,homeY:300});g._spawnAntigen('gold','flank',{x:720,y:270,homeX:720,homeY:270});g.pause();a.updateHUD();document.getElementById('game-overlay').style.visibility='hidden';})()");
  await delay(100);
  assert(await client.gameEvaluate("(()=>{const a=LyricGalaga.app,before=JSON.stringify(a.game.state);a.renderer.render(a.game.state,.016);return before===JSON.stringify(a.game.state);})()"), 'Rendering mutated combat state');
  await client.screenshot('boss');
  await client.gameEvaluate("(()=>{const a=LyricGalaga.app;a.game.resume();a.game._damageBoss(a.game.state.boss.health);a.updateHUD();document.getElementById('game-overlay').style.visibility='';})()");
  assert(await client.gameEvaluate("LyricGalaga.app.game.state.status==='victory' && document.getElementById('overlay-title').textContent.includes('SECURED')"), 'Victory screen did not show campaign completion');
  await delay(250);
  await client.screenshot('victory');
  await client.gameEvaluate("document.getElementById('overlay-action').click()");
  await client.gameWait("LyricGalaga.app.game.state.status==='playing' && LyricGalaga.app.game.state.level===1 && LyricGalaga.app.game.state.lives===3");
  await client.gameEvaluate("(()=>{const a=LyricGalaga.app;a.game.state.lives=1;a.game.state.player.invulnerable=0;a.game._hurt();a.updateHUD();})()");
  assert(await client.gameEvaluate("LyricGalaga.app.game.state.status==='gameover' && document.getElementById('overlay-title').textContent.includes('LOST')"), 'Game-over screen did not show the loss');
  await client.gameEvaluate("document.getElementById('overlay-action').click()");
  await client.gameWait("LyricGalaga.app.game.state.status==='playing' && LyricGalaga.app.game.state.opsonins===0 && LyricGalaga.app.game.state.lives===3");
  await exitGame(client);
}

async function checkFile(client) {
  await navigate(client, pathToFileURL(path.join(root, 'index.html')).href);
  await client.screenshot('library');
  assert(await client.evaluate("document.querySelectorAll('[data-game]').length===3"), 'Library does not offer all three games');
  await client.evaluate("document.getElementById('instructions-button').click()");
  assert(await client.evaluate("document.getElementById('instructions-dialog').open"), 'Instructions did not open');
  await client.tap('Escape', 'Escape');
  assert(await client.evaluate("!document.getElementById('instructions-dialog').open && document.activeElement.id==='instructions-button'"), 'Instructions failed Escape/focus restoration');
  await play(client, 'biodefenses');
  await client.gameWait("Boolean(window.LyricDefense && LyricDefense.app)");
  assert(await client.gameEvaluate("!document.getElementById('welcome-screen').hidden && !LyricDefense.app.transport"), 'Biodefenses did not preserve its welcome');
  await client.screenshot('biodefenses-welcome');
  await client.gameEvaluate("document.getElementById('start-bot').click()");
  await client.gameWait("LyricDefense.app.state && LyricDefense.app.state.phase==='playing'", 6000);
  await exitGame(client);
  await checkShooter(client);
  await play(client, 'biodefenses');
  await client.gameWait("Boolean(window.LyricDefense && LyricDefense.app)");
  assert(await client.gameEvaluate("!document.getElementById('welcome-screen').hidden && !LyricDefense.app.transport"), 'Repeated switch retained a running match');
  await exitGame(client);
  console.log(client.name + ': file launcher, welcome screens, instructions, keyboard, opsonins, macrophages, pause, layouts, repeated exit passed');
}

async function checkHTTP(client, address) {
  await navigate(client, address);
  await play(client, 'biodefenses');
  await client.gameWait("Boolean(window.LyricDefense && LyricDefense.app)");
  const credentials = await client.gameEvaluate("LyricDefense.app.createLan('Launcher scientist')");
  await client.gameWait("LyricDefense.app.mode==='lan' && Boolean(LyricDefense.app.transport)");
  assert((await (await fetch(address + 'api/health')).json()).rooms===1, 'LAN room was not created through the launcher');
  const previousContext = (await client.gameContext()).id;
  await client.protocol.send('Page.reload', {}, client.session);
  await client.wait("document.readyState==='complete' && Boolean(window.LyricGames) && document.querySelectorAll('iframe').length===1");
  await waitCondition(async () => { const context = await client.gameContext(); return context && context.id!==previousContext; }, 'Reload creates a new game document');
  await client.gameWait("Boolean(window.LyricDefense && LyricDefense.app && LyricDefense.app.mode==='lan' && LyricDefense.app.transport && LyricDefense.app.transport.roomCode===" + JSON.stringify(credentials.roomCode) + ')', 10000);
  await exitGame(client);
  await waitCondition(async () => (await (await fetch(address + 'api/health')).json()).rooms===0, 'Explicit launcher exit deletes the room', 5000);
  await play(client, 'biodefenses');
  await client.gameWait("Boolean(window.LyricDefense && LyricDefense.app)");
  await client.gameEvaluate("(()=>{const L=LyricDefense,create=L.LanTransport.create;L.LanTransport.create=name=>create(name).then(credentials=>new Promise(resolve=>setTimeout(()=>resolve(credentials),250)));window.pendingRoom=L.app.createLan('Late response');return true;})()");
  await exitGame(client);
  await waitCondition(async () => (await (await fetch(address + 'api/health')).json()).rooms===0, 'Late room creation cleans up instead of reopening', 5000);
  assert(await client.evaluate("sessionStorage.getItem('lyric-defense.lan-session.v1')===null"), 'Exit kept saved LAN credentials');
  await checkShooter(client);
  await client.evaluate("location.hash='#antigen-assault'");
  await client.gameWait("Boolean(window.LyricGalaga && LyricGalaga.app)");
  await client.evaluate("history.back()");
  await client.wait("!document.getElementById('game-frame')", 14000);
  console.log(client.name + ': HTTP shooter, hash navigation, LAN refresh restoration and explicit leave passed');
}

async function main() {
  assert(browsers.length>0, 'Install Chrome or Edge for browser verification.');
  fs.mkdirSync(artifacts, { recursive: true });
  const filter = (process.argv.find(arg => arg.startsWith('--browser=')) || '').slice(10);
  const selected = filter ? browsers.filter(([name]) => name===filter) : browsers;
  assert(selected.length>0, 'Requested browser unavailable: ' + filter);
  const { createGamesServer } = require('../server.js');
  const host = createGamesServer({ host: '127.0.0.1', port: 0 });
  await host.start();
  const address = 'http://127.0.0.1:' + host.server.address().port + '/';
  try {
    for (const [name, executable] of selected) {
      const client = await launch(name, executable);
      try {
        await checkFile(client);
        await checkHTTP(client, address);
        assert(client.errors.length===0, 'Uncaught browser errors: ' + JSON.stringify(client.errors));
      } catch (error) {
        fs.writeFileSync(path.join(artifacts, name + '-failure.txt'), error.stack + '\n\n' + client.stderr);
        try { await client.screenshot('failure'); } catch (_) {}
        throw error;
      } finally { await close(client); }
    }
  } finally { await host.close(); }
  console.log('Shared browser verification passed. Screenshots: ' + artifacts);
}
if (require.main===module) main().catch(error => { console.error(error.stack); process.exitCode=1; });
module.exports = { launch, close, navigate, waitCondition };
