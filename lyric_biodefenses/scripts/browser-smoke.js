'use strict';
// Development-only browser checks. No npm packages or web server are needed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const rootPath = path.resolve(__dirname, '..');
const artifactPath = path.join(rootPath, 'tests', 'artifacts');
const browsers = [
  ['chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
  ['edge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
].filter((entry) => fs.existsSync(entry[1]));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(condition, message) { if (!condition) throw new Error(message); }

class Protocol {
  constructor(url) {
    this.counter = 0; this.pending = new Map(); this.listeners = new Set();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
      } else this.listeners.forEach((listener) => listener(message));
    });
  }
  async send(method, params, sessionId) {
    await this.ready; const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Browser command timed out: ' + method)); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    });
  }
  async evaluate(expression, sessionId) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception));
    return result.result.value;
  }
  close() { this.pending.forEach((entry) => clearTimeout(entry.timer)); this.ws.close(); }
}

async function waitFor(protocol, session, expression, timeout) {
  const deadline = Date.now() + (timeout || 15000);
  while (Date.now() < deadline) {
    if (await protocol.evaluate(expression, session)) return;
    await delay(80);
  }
  throw new Error('Condition timed out: ' + expression);
}

function waitForDebuggingEndpoint(child, profile, name) {
  // Windows Edge can hand its profile to a new process and exit successfully.
  // The profile's endpoint file belongs to this test, even after that handoff.
  return new Promise((resolve, reject) => {
    let stderr = '', settled = false;
    const timer = setTimeout(() => finish(new Error(name + ' did not expose a debug endpoint. ' + stderr.slice(-1000))), 15000);
    const poll = setInterval(readEndpoint, 100);
    function finish(error, endpoint) {
      if (settled) return;
      settled = true; clearTimeout(timer); clearInterval(poll);
      child.stderr.removeListener('data', onData);
      child.removeListener('error', onError); child.removeListener('exit', onExit);
      if (error) reject(error); else resolve(endpoint);
    }
    function onData(chunk) {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) finish(null, match[1]);
    }
    function onError(error) { finish(error); }
    function onExit(code) { if (code !== 0) finish(new Error(name + ' exited before debugging started: ' + code)); }
    function readEndpoint() {
      try {
        const lines = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/);
        const port = Number(lines[0]);
        if (Number.isInteger(port) && port > 0 && port < 65536 && /^\/devtools\/browser\/[\w-]+$/.test(lines[1] || '')) finish(null, 'ws://127.0.0.1:' + port + lines[1]);
      } catch (_) { /* Chromium has not written its endpoint yet. */ }
    }
    child.stderr.on('data', onData); child.once('error', onError); child.once('exit', onExit);
    readEndpoint();
  });
}

async function checkBrowser(name, executable) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-defense-' + name + '-'));
  const child = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', protocol, session;
  try {
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const url = await waitForDebuggingEndpoint(child, profile, name);
    protocol = new Protocol(url); await protocol.ready;
    const target = await protocol.send('Target.createTarget', { url: 'about:blank' });
    const attached = await protocol.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    session = attached.sessionId;
    const errors = [];
    protocol.listeners.add((message) => { if (message.sessionId === session && message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails); });
    await protocol.send('Runtime.enable', {}, session);
    await protocol.send('Page.enable', {}, session);
    await protocol.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, session);
    if (name === 'edge') await protocol.send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window,'localStorage',{get:function(){throw new Error('Storage intentionally denied by smoke test');}});" }, session);
    await protocol.send('Page.navigate', { url: pathToFileURL(path.join(rootPath, 'tests', 'browser.html')).href }, session);
    await waitFor(protocol, session, "document.body && Boolean(document.body.dataset.result)", 20000);
    const suite = await protocol.evaluate("({result:document.body.dataset.result,output:document.getElementById('results').textContent})", session);
    assert(suite.result === 'pass', suite.output);
    fs.writeFileSync(path.join(artifactPath, name + '-tests.txt'), suite.output);
    console.log(name + ': browser simulation suite passed');
    if (process.argv.includes('--tests-only')) { await protocol.send('Browser.close'); return; }

    await protocol.send('Page.navigate', { url: pathToFileURL(path.join(rootPath, 'index.html')).href }, session);
    await waitFor(protocol, session, "Boolean(window.LyricDefense && LyricDefense.Renderer && document.getElementById('start-sandbox')) && document.readyState === 'complete'");
    assert(await protocol.evaluate("(()=>{const logo=document.querySelector('.brand img');return logo&&logo.complete&&logo.naturalWidth===1024;})()", session), 'Supplied Lyric logo did not load');
    await protocol.evaluate("document.getElementById('start-sandbox').click()", session);
    await waitFor(protocol, session, "Boolean(LyricDefense.app && LyricDefense.app.game && LyricDefense.app.game.state.phase === 'playing')", 7000);
    assert(await protocol.evaluate("LyricDefense.app.game.state.players[0].clue.kind==='trivia' && LyricDefense.TriviaBank.length===5000 && LyricDefense.TriviaBankInfo.count===5000 && Boolean(LyricDefense.ClueBank)", session), 'Expanded trivia bank is not active or the crossword bank was removed');
    await protocol.evaluate("document.getElementById('debug-grant').click(); document.getElementById('buy-button').click(); document.getElementById('debug-natural').click();", session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.players[0].owned['ethanol-1'] === true", session), 'Shop purchase failed');
    const typed = await protocol.evaluate("({answer:LyricDefense.app.game.state.players[0].clue.answer, tier:LyricDefense.app.game.state.players[0].clue.tier, id:LyricDefense.app.game.state.players[0].clue.id, balance:LyricDefense.app.game.state.players[0].wallet['igg'+LyricDefense.app.game.state.players[0].clue.tier]})", session);
    await protocol.evaluate("document.getElementById('answer-input').focus()", session);
    await protocol.send('Input.insertText', { text: typed.answer.toLowerCase() }, session);
    await protocol.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, session);
    await protocol.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, session);
    await waitFor(protocol, session, "LyricDefense.app.game.state.players[0].clue.id !== " + JSON.stringify(typed.id), 2000);
    assert(await protocol.evaluate("LyricDefense.app.game.state.players[0].wallet['igg'+" + typed.tier + "] === " + (typed.balance + 1), session), 'Keyboard answer did not reward');
    await protocol.evaluate("(()=>{const app=LyricDefense.app;app.game.state.players[0].clue={id:'browser-numeric-answer',text:'In what year did Apollo 11 first land on the Moon?',answer:'1969',acceptedAnswers:['1969'],kind:'trivia',tier:2,length:4};app.transport.publish();document.getElementById('answer-input').focus();})()", session);
    await protocol.send('Input.insertText', { text: '1969' }, session);
    await protocol.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, session);
    await protocol.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, session);
    await waitFor(protocol, session, "LyricDefense.app.game.state.players[0].clue.id!=='browser-numeric-answer'", 2000);
    await protocol.evaluate("document.getElementById('craft-button').click()", session);
    await protocol.evaluate("document.getElementById('debug-grant').click()", session);
    await protocol.evaluate("document.getElementById('debug-spawn').click()", session);
    const partialAnswer = await protocol.evaluate("LyricDefense.app.game.state.players[0].clue.answer[0]", session);
    await protocol.evaluate("document.getElementById('answer-input').focus()", session);
    await protocol.send('Input.insertText', { text: partialAnswer }, session);
    const click = await protocol.evaluate("(()=>{const r=document.getElementById('reactor-canvas').getBoundingClientRect();return{x:r.left+r.width*0.30,y:r.top+r.height*0.5}})()", session);
    await protocol.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: click.x, y: click.y }, session);
    await protocol.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: click.x, y: click.y, button: 'left', clickCount: 1 }, session);
    await protocol.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: click.x, y: click.y, button: 'left', clickCount: 1 }, session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.players[0].walls.length === 1", session), 'Mouse did not cast a wall');
    assert(await protocol.evaluate("document.activeElement.id === 'answer-input' && document.getElementById('answer-input').value === " + JSON.stringify(partialAnswer), session), 'Casting interrupted trivia typing');
    await protocol.evaluate("document.querySelector('[data-tab=OFFENSE]').click();", session);
    await protocol.evaluate("document.querySelector('[data-item-id=send-basic], [data-item=send-basic]').click(); document.getElementById('buy-button').click();", session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.players[1].enemies.length > 0", session), 'Attack was not dispatched');
    await protocol.evaluate("document.querySelector('[data-tab=LASER]').click()", session);
    await protocol.evaluate("document.getElementById('pause-button').click()", session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.phase === 'paused'", session), 'Pause failed');
    const canvasInfo = await protocol.evaluate("(()=>{const c=document.getElementById('reactor-canvas');return{pixels:c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v=>v>0),overflow:document.documentElement.scrollWidth>window.innerWidth+1}})()", session);
    assert(canvasInfo.pixels && !canvasInfo.overflow, 'Blank canvas or desktop horizontal overflow');
    await protocol.evaluate("document.getElementById('pause-button').click(); document.getElementById('debug-grant').click(); LyricDefense.app.send('buy',{itemId:'culture-1'}); LyricDefense.app.send('buy',{itemId:'culture-2'}); const scene=LyricDefense.app.game.state.players[0];scene.enemies[0].x=240;scene.enemies[0].y=180; LyricDefense.app.send('debug',{action:'spawn',target:'p1',enemyType:'fast'});scene.enemies[1].x=400;scene.enemies[1].y=120;", session);
    assert(await protocol.evaluate("document.getElementById('debug-enemy').options.length === 5", session), 'Sandbox does not expose the five microbes');
    await protocol.evaluate("LyricDefense.app.game.state.players[0].enemies[1].x=630;LyricDefense.app.game.state.players[0].enemies[1].y=300;document.querySelector('[data-item-id=image-grid]').click();document.getElementById('buy-button').click();", session);
    await waitFor(protocol, session, "LyricDefense.app.game.state.players[0].laserCooldown <= 0.001", 3000);
    const gridClick = await protocol.evaluate("(()=>{const r=document.getElementById('reactor-canvas').getBoundingClientRect();return{x:r.left+r.width*500/800,y:r.top+r.height/2}})()", session);
    await protocol.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gridClick.x, y: gridClick.y }, session);
    await protocol.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gridClick.x, y: gridClick.y, button: 'left', clickCount: 1 }, session);
    await protocol.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gridClick.x, y: gridClick.y, button: 'left', clickCount: 1 }, session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.players[0].walls.length === 10 && LyricDefense.app.game.state.players[0].polymerImage === 'grid3x3'", session), 'Image shop purchase/mouse cast did not produce nine new rings');
    await protocol.evaluate("document.querySelector('[data-tab=OFFENSE]').click();document.querySelector('[data-item-id=send-slow]').click();document.getElementById('buy-button').click();document.querySelector('[data-item-id=send-elite]').click();document.getElementById('buy-button').click();", session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.players[1].enemies.some(e=>e.type==='slow') && LyricDefense.app.game.state.players[1].enemies.some(e=>e.type==='elite')", session), 'New offensive microbes did not dispatch');
    await protocol.evaluate("document.querySelector('[data-item-id=send-ecoli]').click();document.getElementById('buy-button').click();", session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.players[1].enemies.some(e=>e.type==='ecoli')", session), 'E. coli shop dispatch failed');
    await protocol.evaluate("document.querySelector('[data-tab=CLUES]').click();document.querySelector('[data-item-id=buy-skip]').click();const app=LyricDefense.app;app.game.state.players[0].wallet.igg1=30;app.transport.publish();for(let i=0;i<30;i++)document.getElementById('buy-button').click();", session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.players[0].skipCharges===32 && document.getElementById('skip-count').textContent==='32 / 2' && LyricDefense.app.game.state.players[0].wallet.igg1===0", session), 'Paid skips did not bank above the automatic limit');
    await protocol.evaluate("(()=>{for(const type of ['slow','elite','fast','ecoli']){document.getElementById('debug-enemy').value=type;document.getElementById('debug-spawn').click();}const scene=LyricDefense.app.game.state.players[0];const slow=scene.enemies.find(e=>e.type==='slow'),elite=scene.enemies.find(e=>e.type==='elite'),fast=scene.enemies.filter(e=>e.type==='fast').at(-1),ecoli=scene.enemies.find(e=>e.type==='ecoli');slow.x=500;slow.y=180;elite.x=620;elite.y=80;fast.x=120;fast.y=80;ecoli.x=250;ecoli.y=270;document.querySelector('[data-tab=LASER]').click();document.querySelector('[data-item-id=image-grid]').click();LyricDefense.app.renderer.setPointer(null);})()", session);
    await delay(120);
    const shot = await protocol.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, session);
    fs.writeFileSync(path.join(artifactPath, name + '-sandbox.png'), Buffer.from(shot.data, 'base64'));
    await protocol.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1100, deviceScaleFactor: 1, mobile: false }, session);
    assert(await protocol.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1", session), 'Narrow layout overflows');
    const narrow = await protocol.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, session);
    fs.writeFileSync(path.join(artifactPath, name + '-narrow.png'), Buffer.from(narrow.data, 'base64'));
    await protocol.evaluate("(()=>{const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d');ctx.fillStyle='rgb(10,240,20)';ctx.fillRect(0,0,16,16);window._originalArt=Object.assign({},LyricDefense.AssetManifest['enemy-basic']);LyricDefense.AssetManifest['enemy-basic']=Object.assign({},_originalArt,{src:c.toDataURL(),animations:{idle:[0],walk:[0],attack:[0]}});LyricDefense.Assets.load();})()", session);
    await waitFor(protocol, session, "Boolean(LyricDefense.Assets.images['enemy-basic'])");
    assert(await protocol.evaluate("(()=>{const c=document.createElement('canvas');c.width=c.height=16;LyricDefense.Assets.draw(c.getContext('2d'),'enemy-basic',0,0,16,0);const p=c.getContext('2d').getImageData(8,8,1,1).data;return p[0]===10&&p[1]===240&&p[2]===20;})()", session), 'Custom artwork did not load');
    await protocol.evaluate("LyricDefense.AssetManifest['enemy-basic'].src='assets/intentionally-missing-smoke-test.png';LyricDefense.Assets.load()", session);
    await waitFor(protocol, session, "LyricDefense.Assets.images['enemy-basic'] === null");
    assert(await protocol.evaluate("(()=>{const c=document.createElement('canvas');c.width=c.height=16;LyricDefense.Assets.draw(c.getContext('2d'),'enemy-basic',0,0,16,0);return c.getContext('2d').getImageData(0,0,16,16).data.some((v,i)=>i%4===3&&v>0);})()", session), 'Missing artwork did not retain placeholder');
    await protocol.evaluate("LyricDefense.AssetManifest['enemy-basic']=window._originalArt", session);
    await protocol.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;", session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.phase === 'paused' && LyricDefense.app.pausedWhileAway", session), 'Visibility change did not auto-pause');
    await protocol.evaluate("document.getElementById('restart-button').click()", session);
    assert(await protocol.evaluate("LyricDefense.app.game.state.phase === 'countdown' && LyricDefense.app.game.state.players[0].walls.length === 0 && LyricDefense.app.game.state.players[0].wallet.igg1 === 0", session), 'Restart did not clear the match');
    await protocol.evaluate("LyricDefense.app.start('bot')", session);
    await waitFor(protocol, session, "LyricDefense.app.game.state.phase === 'playing'", 7000);
    assert(await protocol.evaluate("LyricDefense.app.game.state.botEnabled && document.getElementById('sandbox-panel').hidden && !LyricDefense.app.send('debug',{action:'grant',target:'p1',amount:10}).ok", session), 'Bot match did not isolate sandbox controls');
    assert(errors.length === 0, 'Uncaught browser errors: ' + JSON.stringify(errors));
    console.log(name + ': direct-file trivia/numeric input, banked skips, five microbes, Lyric logo, 3x3 laser, keyboard, mouse, economy, offense, pause, restart, and layouts passed' + (name === 'edge' ? ' (storage denied)' : ''));
    await protocol.send('Page.navigate', { url: pathToFileURL(path.join(rootPath, 'trivia-review.html')).href }, session);
    await waitFor(protocol, session, "Boolean(window.LyricDefense && LyricDefense.triviaReview) && document.readyState === 'complete'");
    assert(await protocol.evaluate("LyricDefense.triviaReview.rows.length===5000 && document.querySelectorAll('.answer-details').length===50 && document.querySelectorAll('.answer-details[open]').length===0", session), 'Bank browser did not paginate5,000 questions with hidden answers');
    await protocol.evaluate("document.querySelector('[data-tier=\"4\"]').click()", session);
    assert(await protocol.evaluate("document.querySelectorAll('.answer-details').length===50 && LyricDefense.triviaReview.tier==='4' && LyricDefense.triviaReview.matchingCount===LyricDefense.TriviaBankInfo.tierCounts[3]", session), 'Review tier filter failed');
    await protocol.evaluate("(()=>{const toggle=document.getElementById('show-all-answers');toggle.checked=true;toggle.dispatchEvent(new Event('change'));})()", session);
    assert(await protocol.evaluate("document.querySelectorAll('.answer-details[open]').length===50", session), 'Review answer reveal failed');
    const pageOneId = await protocol.evaluate("document.querySelector('.question-card').dataset.questionId", session);
    await protocol.evaluate("document.getElementById('review-next').click()", session);
    assert(await protocol.evaluate("LyricDefense.triviaReview.page===2 && document.querySelectorAll('.answer-details').length===50 && document.querySelector('.question-card').dataset.questionId!=="+JSON.stringify(pageOneId), session), 'Bank pagination failed');
    await protocol.evaluate("document.getElementById('review-prev').click()", session);
    assert(await protocol.evaluate("LyricDefense.triviaReview.page===1 && document.querySelector('.question-card').dataset.questionId==="+JSON.stringify(pageOneId), session), 'Bank previous-page navigation failed');
    await protocol.evaluate("(()=>{document.querySelector('[data-tier=\"all\"]').click();const search=document.getElementById('review-search');search.value=LyricDefense.triviaReview.rows[0].id;search.dispatchEvent(new Event('input'));})()", session);
    assert(await protocol.evaluate("document.querySelectorAll('.answer-details').length===1 && document.documentElement.scrollWidth<=window.innerWidth+1", session), 'Review search failed or layout overflowed');
    await protocol.evaluate("(()=>{const search=document.getElementById('review-search');search.value='';search.dispatchEvent(new Event('input'));const toggle=document.getElementById('show-all-answers');toggle.checked=false;toggle.dispatchEvent(new Event('change'));})()", session);
    await protocol.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, session);
    const reviewShot = await protocol.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, session);
    fs.writeFileSync(path.join(artifactPath, name + '-trivia-review.png'), Buffer.from(reviewShot.data, 'base64'));
    assert(errors.length === 0, 'Uncaught review-page errors: ' + JSON.stringify(errors));
    console.log(name + ': 5,000-question bank browser, pagination, tier/search filters, and answer reveals passed');
    await protocol.send('Browser.close');
  } catch (error) {
    fs.writeFileSync(path.join(artifactPath, name + '-browser-stderr.txt'), stderr);
    if (protocol && session) {
      try {
        const detail = await protocol.evaluate("({ready:document.readyState,hidden:document.hidden,focus:document.activeElement&&document.activeElement.id,input:document.getElementById('answer-input')&&document.getElementById('answer-input').value,hint:document.getElementById('answer-hint')&&document.getElementById('answer-hint').textContent,state:window.LyricDefense&&LyricDefense.app&&LyricDefense.app.state})", session);
        fs.writeFileSync(path.join(artifactPath, name + '-failure.json'), JSON.stringify(detail, null, 2));
        const shot = await protocol.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, session);
        fs.writeFileSync(path.join(artifactPath, name + '-failure.png'), Buffer.from(shot.data, 'base64'));
      } catch (_) { /* The browser may have crashed before diagnostic capture. */ }
    }
    throw error;
  } finally {
    if (protocol) protocol.close();
    child.kill();
    await delay(200);
    // Only delete the exact temporary profile created above, within os.tmpdir().
    const absolute = path.resolve(profile), temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
    if (absolute.startsWith(temporaryRoot) && path.basename(absolute).startsWith('lyric-defense-')) {
      try { fs.rmSync(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* Browser may retain a locked temporary file. */ }
    }
  }
}
async function main() {
  assert(browsers.length > 0, 'No supported Chrome/Edge installation found.');
  fs.mkdirSync(artifactPath, { recursive: true });
  const selectedName = (process.argv.find((arg) => arg.startsWith('--browser=')) || '').split('=')[1];
  const selected = selectedName ? browsers.filter(([name]) => name === selectedName) : browsers;
  assert(selected.length > 0, 'Selected browser is unavailable: ' + selectedName);
  for (const [name, executable] of selected) await checkBrowser(name, executable);
  console.log('Screenshots and browser reports: ' + artifactPath);
}
if (require.main === module) main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
module.exports = { Protocol, waitFor, waitForDebuggingEndpoint, browsers, delay, assert };
