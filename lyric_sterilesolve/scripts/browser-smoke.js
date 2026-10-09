'use strict';
// Real browser input, physical staging builds, and collection lifecycle checks.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launch, close } = require('../../scripts/browser-smoke.js');
const { browsers, delay, assert } = require('../../lyric_biodefenses/scripts/browser-smoke.js');
const gameRoot = path.resolve(__dirname, '..'), collection = path.resolve(gameRoot, '..');
const fixtures = fs.readFileSync(path.join(gameRoot, 'tests/reference-solutions.js'), 'utf8');
const evaluate = (client, fn, ...args) => client.evaluate('(' + fn.toString() + ')(' + args.map(a => JSON.stringify(a)).join(',') + ')');

async function open(client, url) {
  await client.protocol.send('Page.navigate', { url }, client.session);
  await client.wait("document.readyState==='complete'&&Boolean(window.LyricSterileSolver&&LyricSterileSolver.App)");
}
async function mouse(client, type, x, y) {
  await client.protocol.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1 }, client.session);
}
async function click(client, x, y) {
  await mouse(client, 'mouseMoved', x, y); await mouse(client, 'mousePressed', x, y); await mouse(client, 'mouseReleased', x, y); await delay(45);
}
async function logical(client, x, y) {
  return evaluate(client, (x, y) => { const r = LyricSterileSolver.App.renderer.rect(); return { x: r.x + x * r.scaleX, y: r.y + y * r.scaleY }; }, x, y);
}
async function gesture(client, a, b) {
  await mouse(client, 'mouseMoved', a.x, a.y); await mouse(client, 'mousePressed', a.x, a.y);
  await mouse(client, 'mouseMoved', b.x, b.y); await delay(45); await mouse(client, 'mouseReleased', b.x, b.y); await delay(60);
}
async function rackDrag(client, id, x, y) {
  const a = await evaluate(client, id => { const card = document.querySelector('[data-rack-id="' + id + '"]'); if (!card) throw new Error('Missing rack item: ' + id); const r = card.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; }, id);
  await gesture(client, a, await logical(client, x, y));
}
async function componentDrag(client, id, x, y) {
  const c = await evaluate(client, id => { const c = LyricSterileSolver.App.getState().components.find(c => c.id === id); return { x: c.x, y: c.y }; }, id);
  await gesture(client, await logical(client, c.x, c.y), await logical(client, x, y));
}
async function port(client, id, portId) {
  const p = await evaluate(client, (id, portId) => { const p=LyricSterileSolver.RenderUtils.portPoint(LyricSterileSolver.App.getState(),{componentId:id,portId});return {x:p.x,y:p.y}; }, id, portId);
  return logical(client, p.x, p.y);
}
async function endDrag(client, id, end, componentId, portId) {
  const p = await evaluate(client, (id, end) => { const G = LyricSterileSolver, s = G.App.getState(), t = G.RenderUtils.allTubes(s).find(t => t.id === id); return G.RenderUtils.tubeEnds(s, t)[end]; }, id, end);
  await gesture(client, await logical(client, p.x, p.y), await port(client, componentId, portId));
}
async function checkPointer(client) {
  await client.evaluate("document.getElementById('campaign-button').click()");
  assert(await client.evaluate("Array.from(document.querySelector('.hud').children).map(c=>c.id).join(',')==='level-title,elapsed,reset-button,go-button'"), 'HUD contains extra controls');
  assert(await client.evaluate("!document.querySelector('[data-tool],#drop-warning,#prepare-tube,#process-targets')"), 'Old tool controls or dirty warning remain');
  await delay(100);
  assert(await client.evaluate("LyricSterileSolver.App.renderer.stations.filter(s=>s.type==='vat').map(s=>s.media).join(',')==='blue'"), 'Level 1 shows unnecessary media');
  const blank = await logical(client, 80, 70);
  await mouse(client, 'mousePressed', blank.x, blank.y); assert(await client.evaluate('LyricSterileSolver.App.view.handDown'), 'Hand did not close');
  await mouse(client, 'mouseReleased', blank.x, blank.y); assert(await client.evaluate('!LyricSterileSolver.App.view.handDown'), 'Hand did not open');
  await rackDrag(client, 'f1', 55, 724);
  assert(await client.evaluate("document.getElementById('fill-dialog').open&&LyricSterileSolver.App.getState().components.find(c=>c.id==='f1').location==='staging'"), 'Vat drop did not stage flask and open fill dialog');
  await client.evaluate("document.getElementById('fill-amount').value='200';document.getElementById('confirm-fill').click()");
  assert(await client.evaluate("LyricSterileSolver.App.getState().components.find(c=>c.id==='f1').volume===200&&!LyricSterileSolver.App.getState().components.find(c=>c.id==='f1').sterile"), 'Dirty staging flask did not fill');
  assert(await client.evaluate("document.querySelectorAll('[data-rack-type=flask]').length===1&&document.querySelector('[data-rack-type=flask]').textContent.includes('1')"), 'Flask stack did not decrement');
  await rackDrag(client, 'p1', 300, 320);
  assert(await client.evaluate("LyricSterileSolver.App.getState().phase==='failed'&&!document.getElementById('result-overlay').hidden"), 'Dirty incubator entry did not immediately fail');
  await client.evaluate("document.getElementById('result-retry').click()");
  assert(await client.evaluate("LyricSterileSolver.App.getState().phase==='setup'&&LyricSterileSolver.App.getState().components.find(c=>c.id==='f1').volume===200"), 'Dirty retry discarded preparation');
  await rackDrag(client, 'p1', 435, 705); await rackDrag(client, 'f2', 660, 705);
  for (const x of [300, 460, 620]) await rackDrag(client, 'tube', x, 770);
  await rackDrag(client, 'clamp', 775, 710);
  assert(await client.evaluate("(()=>{const s=LyricSterileSolver.App.getState();return s.looseTubes.length===3&&s.clamps.length===1&&s.phase==='setup';})()"), 'Physical rack items failed');
  const spray = await logical(client, 903, 724); await click(client, spray.x, spray.y);
  assert(await client.evaluate("(()=>{const G=LyricSterileSolver,s=G.App.getState();return s.resources.ethanol===86&&s.components.filter(c=>c.location==='staging').concat(G.RenderUtils.allTubes(s),s.clamps).every(c=>c.sterile);})()"), 'Bottle did not sterilize all seven staged items');
  for (const [id,x,y] of [['f1',100,320],['p1',300,320],['f2',850,320]]) await componentDrag(client, id, x, y);
  const tubes = await client.evaluate('LyricSterileSolver.RenderUtils.allTubes(LyricSterileSolver.App.getState()).map(t=>t.id)');
  const links = [['f1','out','p1','in'],['p1','out','r1','in1'],['r1','out1','f2','in']];
  for (let i=0;i<links.length;i++) { await endDrag(client,tubes[i],'a',links[i][2],links[i][3]); await endDrag(client,tubes[i],'b',links[i][0],links[i][1]); }
  assert(await client.evaluate("(()=>{const s=LyricSterileSolver.App.getState();return s.phase==='setup'&&s.tubes.length===3&&!s.looseTubes.length&&s.tubes.every(t=>t.from&&t.to);})()"), 'Dragging physical tube ends did not connect');
  const clampStart = await logical(client,775,710);
  const clampPoint = await evaluate(client, id => { const G=LyricSterileSolver,s=G.App.getState(),t=s.tubes.find(t=>t.id===id); return G.RenderUtils.along(G.RenderUtils.route(s,t),.5); }, tubes[0]);
  const clampTarget = await logical(client,clampPoint.x,clampPoint.y); await gesture(client,clampStart,clampTarget);
  assert(await evaluate(client,id=>LyricSterileSolver.App.getState().tubes.find(t=>t.id===id).clamped,tubes[0]), 'Sterile clamp drag did not close tube');
  await click(client,clampTarget.x,clampTarget.y);
  assert(await evaluate(client,id=>!LyricSterileSolver.App.getState().tubes.find(t=>t.id===id).clamped,tubes[0]), 'Installed clamp click did not reopen');
  await client.screenshot('sterile-hand-setup');
  await client.evaluate("document.getElementById('go-button').click()"); await client.wait("LyricSterileSolver.App.getState().phase==='running'");
  await client.screenshot('sterile-hand-running');
  await client.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))");
  assert(await client.evaluate("LyricSterileSolver.App.getState().phase==='suspended'"), 'Hidden tab did not suspend');
  const elapsed=await client.evaluate('LyricSterileSolver.App.getState().elapsed'); await delay(100);
  assert(await client.evaluate('LyricSterileSolver.App.getState().elapsed==='+elapsed), 'Suspension consumed time');
  await client.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
  assert(await client.evaluate("LyricSterileSolver.App.getState().phase==='suspended'"), 'Tab resumed without explicit confirmation');
  await client.evaluate("document.getElementById('resume-button').click();for(let i=0;i<9;i++)LyricSterileSolver.App.getSimulation().step(5);LyricSterileSolver.App.refresh()");
  assert(await client.evaluate("LyricSterileSolver.App.getState().phase==='won'&&!document.getElementById('result-overlay').hidden"), 'Pointer-built level failed');
  await client.screenshot('sterile-pointer-victory');
}
async function checkLevels(client) {
  await client.evaluate(fixtures);
  for(let id=1;id<=5;id++) {
    const result=await evaluate(client,id=>{const G=LyricSterileSolver;G.App.start({levelId:id,practice:true});G.ReferenceSolutions.buildPhysical(G.App.getSimulation(),id);const s=G.ReferenceSolutions.run(G.App.getSimulation(),id);G.App.refresh();return {phase:s.phase,time:s.elapsed,consumed:s.stats.freshMediaConsumed};},id);
    assert(result.phase==='won','Browser physical solution failed level '+id);
    assert(Math.abs(result.time-[40,10,20,20,20][id-1])<1e-5,'Wrong time level '+id);
    assert(Math.abs(result.consumed-[200,100,120,100,400][id-1])<1e-5,'Wrong consumption level '+id);
  }
  await client.evaluate("LyricSterileSolver.App.start({levelId:5,practice:true});LyricSterileSolver.ReferenceSolutions.buildPhysical(LyricSterileSolver.App.getSimulation(),5);LyricSterileSolver.App.submit({type:'go'});LyricSterileSolver.App.getSimulation().step(10);LyricSterileSolver.App.refresh()");
  await delay(100); await client.screenshot('sterile-mixed-reuse');
  await client.evaluate('LyricSterileSolver.App.showWelcome()');
}
async function checkCampaign(client) {
  await client.evaluate("document.getElementById('campaign-button').click()");
  const ethanol=[];
  for(let id=1;id<=3;id++) {
    ethanol.push(await client.evaluate('LyricSterileSolver.App.getState().resources.ethanol'));
    await evaluate(client,id=>{const G=LyricSterileSolver;G.ReferenceSolutions.buildPhysical(G.App.getSimulation(),id);G.ReferenceSolutions.run(G.App.getSimulation(),id);G.App.refresh();},id);
    assert(await client.evaluate("!document.getElementById('result-overlay').hidden"),'Campaign result missing');
    await client.evaluate("document.getElementById('next-button').click()");
  }
  assert(ethanol[0]===100&&ethanol[1]<100&&ethanol[2]<ethanol[1],'Campaign ethanol failed to carry');
  assert(await client.evaluate('LyricSterileSolver.App.getState().level.id===4&&LyricSterileSolver.App.getState().resources.ethanol===100'),'Level 4 did not refresh ethanol');
  const before=await client.evaluate('localStorage.getItem(LyricSterileSolver.Config.storageKey)');
  await client.evaluate('LyricSterileSolver.App.start({sandbox:true})');
  assert(await client.evaluate('localStorage.getItem(LyricSterileSolver.Config.storageKey)')===before,'Sandbox changed campaign save');
  await client.evaluate('LyricSterileSolver.App.showWelcome()');
  assert(await client.evaluate("!document.getElementById('continue-button').hidden&&document.getElementById('continue-button').textContent.includes('Live Diversion')"),'Saved campaign resume missing');
}
async function checkSandboxAndArt(client) {
  await client.evaluate("LyricSterileSolver.App.start({sandbox:true});document.getElementById('grant-component').click();document.getElementById('grant-red').click();document.getElementById('sandbox-ethanol').value='40';document.getElementById('set-ethanol').click()");
  assert(await client.evaluate("(()=>{const s=LyricSterileSolver.App.getState();return s.sandbox&&s.components.length===5&&s.resources.red===250&&s.resources.ethanol===40&&!document.getElementById('sandbox-panel').hidden;})()"),'Sandbox controls failed');
  await client.evaluate("LyricSterileSolver.App.submit({type:'fill',id:'f1',media:'red',amount:20,passage:2});LyricSterileSolver.App.submit({type:'configureReactor',id:'r1',requiredRate:10,recipe:{red:.5,blue:.5}})");
  assert(await client.evaluate("(()=>{const s=LyricSterileSolver.App.getState();return s.components.find(c=>c.id==='f1').contents['red:2']===20&&s.components.find(c=>c.id==='r1').requiredRate===10;})()"),'Aged media or recipe controls failed');
  assert(await client.evaluate("(()=>{const a=LyricSterileSolver.App,s=a.getState(),before=JSON.stringify(s);a.renderer.render(s,a.view,2);return JSON.stringify(s)===before;})()"),'Rendering mutated state');
  await client.evaluate("(async()=>{const G=LyricSterileSolver,c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.fillStyle='rgb(10,240,20)';x.fillRect(0,0,16,16);window.originalPump=G.AssetManifest.pump;G.AssetManifest.pump=Object.assign({},originalPump,{src:c.toDataURL(),frameWidth:16,frameHeight:16,animations:{idle:[0]}});await G.App.renderer.assets.load();})()");
  assert(await client.evaluate("(()=>{const c=document.createElement('canvas');c.width=c.height=16;LyricSterileSolver.App.renderer.assets.draw(c.getContext('2d'),'pump',0,0,16,16,0,{});const p=c.getContext('2d').getImageData(8,8,1,1).data;return p[0]===10&&p[1]===240&&p[2]===20;})()"),'Replacement sprite failed');
  await client.evaluate("(async()=>{LyricSterileSolver.AssetManifest.pump.src='assets/missing-test.png';await LyricSterileSolver.App.renderer.assets.load();})()");
  assert(await client.evaluate("(()=>{const c=document.createElement('canvas');c.width=c.height=32;const kind=LyricSterileSolver.App.renderer.assets.draw(c.getContext('2d'),'pump',0,0,32,32,0,{});return kind==='fallback'&&c.getContext('2d').getImageData(0,0,32,32).data.some((v,i)=>i%4===3&&v>0);})()"),'Missing art lost fallback');
  await client.evaluate("(async()=>{LyricSterileSolver.AssetManifest.pump=originalPump;await LyricSterileSolver.App.renderer.assets.load();})()"); await client.screenshot('sterile-sandbox');
}
async function checkLayouts(client) {
  for(const [width,height] of [[1366,768],[1440,1080],[740,1000]]) {
    await client.protocol.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},client.session); await delay(70);
    assert(await client.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Horizontal overflow at '+width);
    assert(await client.evaluate("(()=>{const r=LyricSterileSolver.App.renderer.rect();return r.scale>0&&r.x>=0&&r.x+r.width<=innerWidth+1&&r.y+r.height<=innerHeight+1&&r.height>=innerHeight-60;})()"),'Workspace did not fill viewport');
    if(width===1366) await client.screenshot('sterile-laptop');
  }
  await client.protocol.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false},client.session);
}
async function checkLauncher(client,url) {
  await client.protocol.send('Page.navigate',{url},client.session);await client.wait('Boolean(window.LyricGames)');
  const sizes=await client.evaluate("Array.from(document.querySelectorAll('[data-game]')).map(c=>{const r=c.getBoundingClientRect(),a=c.querySelector('.card-art').getBoundingClientRect();return {x:r.x,y:r.y,height:r.height,artWidth:a.width,artHeight:a.height};})");
  assert(sizes.length===3,'Third preview absent');assert(sizes[2].y>sizes[0].y&&Math.abs(sizes[2].x-sizes[0].x)<1,'Wrong preview row');
  assert(sizes.every(s=>Math.abs(s.artWidth-sizes[0].artWidth)<1&&Math.abs(s.artHeight-sizes[0].artHeight)<1&&Math.abs(s.height-sizes[0].height)<1),'Preview sizes differ');
  await client.evaluate("LyricGames.select('sterile-solver');document.getElementById('instructions-button').click()");
  assert(await client.evaluate("document.getElementById('instructions-content').textContent.includes('two seconds')"),'Launcher rules missing');
  await client.evaluate("document.getElementById('dialog-play').click()"); await client.gameWait('Boolean(window.LyricSterileSolver&&LyricSterileSolver.App)');
  assert(await client.evaluate("getComputedStyle(document.querySelector('.arcade-header')).display==='none'"),'Collection header takes workspace space');
  assert(await client.gameEvaluate("!document.getElementById('welcome').hidden&&!document.getElementById('library-button').hidden"),'Welcome or collection exit missing');
  await client.gameEvaluate("document.getElementById('sandbox-button').click()");assert(await client.gameEvaluate('LyricSterileSolver.App.getState().sandbox'),'Hosted sandbox failed');
  await client.gameEvaluate('LyricSterileSolver.App.showWelcome();document.getElementById("library-button").click()');
  await client.wait("!document.getElementById('game-frame')",14000);assert(!await client.gameContext(),'Exit retained game context');
  assert(await client.evaluate("getComputedStyle(document.querySelector('.arcade-header')).display!=='none'"),'Return did not restore collection header');
}
async function main() {
  const {createGamesServer}=require('../../server.js');const host=createGamesServer({host:'127.0.0.1',port:0});await host.start();
  const address='http://127.0.0.1:'+host.server.address().port+'/';fs.mkdirSync(path.join(collection,'tests/artifacts'),{recursive:true});
  try { for(const [name,exe] of browsers) { const client=await launch(name,exe);try {
    await open(client,pathToFileURL(path.join(gameRoot,'index.html')).href);await client.screenshot('sterile-welcome');
    await checkPointer(client);await checkLevels(client);await checkCampaign(client);await checkSandboxAndArt(client);await checkLayouts(client);
    await client.protocol.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new Error('Storage denied for smoke test');}});"},client.session);
    await open(client,address+'lyric_sterilesolve/index.html');await client.evaluate('document.getElementById("sandbox-button").click()');
    assert(await client.evaluate('LyricSterileSolver.App.getState().sandbox'),'Storage denial blocked startup');await checkLevels(client);
    await checkLauncher(client,address);await checkLauncher(client,pathToFileURL(path.join(collection,'index.html')).href);
    assert(client.errors.length===0,'Browser exceptions: '+JSON.stringify(client.errors));
    console.log(name+': physical pointer workflow, all five levels, campaign, hidden resume, sandbox, sprites, storage denial, file/HTTP launcher passed.');
  }catch(error){try{await client.screenshot('sterile-failure');}catch(_){}throw error;}finally{await close(client);} }}finally{await host.close();}
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});module.exports={main};
