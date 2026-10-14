'use strict';
// Chromium touch emulation and synthetic motion checks; this is not an iPhone
// sensor/performance certification. No dependencies beyond Node and local browsers.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { launch, close, waitCondition } = require('./browser-smoke.js');
const { browsers, delay, assert } = require('../lyric_biodefenses/scripts/browser-smoke.js');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'tests', 'artifacts');
let checks = 0;
function check(value, message) { checks++; assert(value, message); }

async function emulate(client, width, height) {
  await client.protocol.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true }, client.session);
  await client.protocol.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, client.session);
  await delay(100);
}
function evaluate(client, expression) { return client.embedded ? client.gameEvaluate(expression) : client.evaluate(expression); }
function gameWait(client, expression, timeout) { return waitCondition(() => evaluate(client, expression), expression, timeout); }
async function open(client, url, embedded) {
  client.embedded = embedded;
  await emulate(client, 844, 390);
  await client.protocol.send('Page.navigate', { url }, client.session);
  if (embedded) {
    await client.wait("document.readyState==='complete' && Boolean(window.LyricGames)");
    await client.evaluate("LyricGames.play('antigen-assault')");
    await client.gameWait('Boolean(window.LyricGalaga && LyricGalaga.app)');
  } else await client.wait('document.readyState===\'complete\' && Boolean(window.LyricGalaga && LyricGalaga.app)');
  await gameWait(client, "document.body.classList.contains('mobile-game')");
}
async function point(client, id, scroll = false) {
  const value = await evaluate(client, '(()=>{const n=document.getElementById(' + JSON.stringify(id) + ');' + (scroll ? "n.scrollIntoView({block:'nearest',inline:'nearest'});" : '') + 'const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,top:r.top,bottom:r.bottom};})()');
  if (client.embedded) {
    const offset = await client.evaluate("(()=>{const r=document.getElementById('game-frame').getBoundingClientRect();return {x:r.left,y:r.top};})()");
    value.x += offset.x; value.y += offset.y;
  }
  return value;
}
async function touch(client, type, points) {
  await client.protocol.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ id: p.id, x: p.x, y: p.y, radiusX: 3, radiusY: 3, force: 1 })) }, client.session);
}
async function tapButton(client, id) {
  const p = await point(client, id, true);
  await touch(client, 'touchStart', [{ id: 1, x: p.x, y: p.y }]);
  await touch(client, 'touchEnd', []);
  await delay(60);
}
async function start(client) {
  await tapButton(client, 'overlay-action');
  await gameWait(client, "LyricGalaga.app.game.state.status==='playing'");
  await evaluate(client, "(()=>{const a=LyricGalaga.app,s=a.game.state;s.player.invulnerable=1000;s.antigens=[];s.enemyShots=[];a.updateHUD();})()");
}
async function layout(client, label) {
  for (const [width, height] of [[667,375],[844,390],[932,430]]) {
    await emulate(client, width, height);
    const data = await evaluate(client, "(()=>{const c=document.getElementById('game-canvas').getBoundingClientRect(),h=document.getElementById('mobile-hud').getBoundingClientRect(),scale=Math.min(c.width/960,c.height/720);return {canvas:{x:c.left,y:c.top,w:c.width,h:c.height,b:c.bottom},hud:h.height,sceneWidth:960*scale,sceneHeight:720*scale,width:innerWidth,height:innerHeight,mobile:document.body.classList.contains('mobile-game'),embedded:document.body.classList.contains('embedded-mobile-game'),header:getComputedStyle(document.querySelector('.app-header')).display,sidebar:getComputedStyle(document.querySelector('.mission-panel')).display};})()");
    check(data.mobile && data.header==='none' && data.sidebar==='none', label + ': mobile panels not compact');
    check(data.canvas.y>=0 && data.canvas.b<=data.height+1 && data.canvas.x>=0 && data.canvas.w<=data.width+1, label+': canvas exceeds viewport at '+width+'x'+height+' '+JSON.stringify(data));
    check(Math.abs(data.sceneWidth/data.sceneHeight-4/3)<.001 && data.sceneHeight>=height-46, label+': arena not uniformly height-fitted at '+width+'x'+height+' '+JSON.stringify(data));
    check(data.hud>=44, label+': HUD touch target row too small');
    if (client.embedded) {
      check(data.embedded && await client.evaluate("getComputedStyle(document.querySelector('.arcade-header')).display==='none'"), label+': launcher header or double inset remains');
    }
    const p = await point(client, 'overlay-action', true);
    check(p.height>=44 && p.top>=0 && p.bottom<=height+1, label+': Start is not reachable inside the scrollable card');
  }
  await client.screenshot(label+'-welcome');
  await emulate(client, 844, 390);
}
async function touchPlay(client, label) {
  await start(client);
  for (const id of ['touch-cycle','touch-activate','touch-joystick','mobile-menu-button']) {
    const r = await point(client,id);
    check(r.width>=44 && r.height>=44 && r.top>=0 && r.bottom<=390, label+': '+id+' touch bounds '+JSON.stringify(r));
  }
  check(await evaluate(client,"(()=>{const j=document.getElementById('touch-joystick').getBoundingClientRect(),c=document.getElementById('touch-cycle').getBoundingClientRect(),a=document.getElementById('touch-activate').getBoundingClientRect();return j.left<innerWidth/2 && c.left>innerWidth/2 && a.left>innerWidth/2 && a.bottom<c.top;})()"),label+': joystick/action placement');
  const joystick = await point(client,'touch-joystick'), cycle = await point(client,'touch-cycle');
  const surface = await point(client,'play-surface');
  const fire={id:2,x:surface.x,y:surface.y-35}, steer={id:1,x:joystick.x+36,y:joystick.y};
  await evaluate(client,"(()=>{const s=LyricGalaga.app.game.state;s.weapon='green';s.unlocked=['green','blue'];s.opsonins=0;s.shots=[];s.player.cooldown=0;window.testStartX=s.player.x;})()");
  await touch(client,'touchStart',[steer,fire]);
  await delay(240);
  check(await evaluate(client,'LyricGalaga.app.game.state.player.x>testStartX+25 && LyricGalaga.app.game.state.shots.length>=2'),label+': simultaneous joystick and held fire');
  check(await evaluate(client,'Math.abs(LyricGalaga.app.controls.pointer.axis.x)>.5 && LyricGalaga.app.controls.pointer.contacts.size===2'),label+': independent pointer contacts');
  await touch(client,'touchStart',[steer,fire,{id:3,x:cycle.x,y:cycle.y}]);
  await delay(90);
  check(await evaluate(client,"LyricGalaga.app.game.state.weapon==='blue' && LyricGalaga.app.controls.pointer.fireCount()===1"),label+': cycle during held fire');
  await touch(client,'touchEnd',[]);
  await delay(250);
  check(await evaluate(client,'LyricGalaga.app.controls.pointer.contacts.size===0 && Math.abs(LyricGalaga.app.game.state.player.vx)<.01'),label+': release clears touches and momentum settles');
  await evaluate(client,"(()=>{const s=LyricGalaga.app.game.state;s.shots=[];s.player.cooldown=0;window.testFires=0;const r=LyricGalaga.app.renderer,h=r.handleEvent;r.handleEvent=function(e){if(e.type==='fire')window.testFires++;return h.call(this,e);};})()");
  await touch(client,'touchStart',[fire]);await touch(client,'touchEnd',[]);await delay(70);
  check(await evaluate(client,'testFires>=1'),label+': quick tap preserved');
  await evaluate(client,"(()=>{const a=LyricGalaga.app,g=a.game,s=g.state;s.opsonins=2;s.weapon='white';s.orbs=[];s.player.cooldown=0;g._previousFire=false;g._requireFireRelease=false;a.updateHUD();})()");
  await touch(client,'touchStart',[fire]);await delay(200);
  check(await evaluate(client,'Boolean(LyricGalaga.app.game.state.charge)'),label+': touch white charge starts');
  await touch(client,'touchEnd',[]);await delay(80);
  check(await evaluate(client,'LyricGalaga.app.game.state.opsonins===1 && LyricGalaga.app.game.state.orbs.length===1'),label+': release spends one stock and launches');
  await touch(client,'touchStart',[fire]);await delay(90);await touch(client,'touchCancel',[]);await delay(80);
  check(await evaluate(client,'LyricGalaga.app.game.state.opsonins===1 && !LyricGalaga.app.game.state.charge'),label+': touch cancel costs no stock');
  await evaluate(client,"(()=>{const a=LyricGalaga.app,s=a.game.state;s.orbs=[{id:900,x:480,y:300,radius:8,status:'settled',color:'white'}];a.updateHUD();})()");
  await tapButton(client,'touch-activate');
  check(await evaluate(client,'LyricGalaga.app.game.state.orbs.length===0 && LyricGalaga.app.game.state.macrophages.length===1'),label+': activation consumes settled orb');
  await client.screenshot(label+'-play');
  await tapButton(client,'mobile-menu-button');
  check(await evaluate(client,"document.getElementById('settings-dialog').open && LyricGalaga.app.game.state.status==='paused'"),label+': pause opens settings');
  const frozen = await evaluate(client,'({time:LyricGalaga.app.renderer.time,state:LyricGalaga.app.game.state.time,effects:LyricGalaga.app.renderer.effects.map(e=>e.age)})');
  await delay(180);
  check(await evaluate(client,'LyricGalaga.app.renderer.time==='+frozen.time+' && LyricGalaga.app.game.state.time==='+frozen.state+' && JSON.stringify(LyricGalaga.app.renderer.effects.map(e=>e.age))==='+JSON.stringify(JSON.stringify(frozen.effects))),label+': pause freezes rendering/combat');
  await tapButton(client,'mobile-response');
  check(await evaluate(client,'!LyricGalaga.app.game.state.antigenResponse'),label+': mobile response toggle');
  await tapButton(client,'mobile-instructions-button');
  check(await evaluate(client,"document.getElementById('instructions-dialog').open && !document.getElementById('settings-dialog').open"),label+': instructions from paused menu');
  const closePoint = await point(client,'close-instructions',true);
  check(closePoint.height>=44 && closePoint.bottom<=390,label+': instructions Close reachable');
  await tapButton(client,'close-instructions');
  check(await evaluate(client,"LyricGalaga.app.game.state.status==='paused'"),label+': closing paused instructions does not fire/resume');
  await tapButton(client,'overlay-action');
  await gameWait(client,"LyricGalaga.app.game.state.status==='playing'");
  await emulate(client,390,844);
  check(await evaluate(client,"!document.getElementById('rotate-prompt').hidden && LyricGalaga.app.game.state.status==='paused' && !LyricGalaga.app.game.state.charge && LyricGalaga.app.controls.pointer.contacts.size===0"),label+': portrait pauses safely');
  const library = await point(client,'rotate-library-button');
  check(library.width>=44 && library.height>=44 && library.bottom<=844,label+': portrait All games accessible');
  await client.screenshot(label+'-portrait');
  await emulate(client,844,390);
  check(await evaluate(client,"document.getElementById('rotate-prompt').hidden && LyricGalaga.app.game.state.status==='paused'"),label+': rotate back requires explicit resume');
  await emulate(client,844,320);
  check(await evaluate(client,"document.getElementById('game-canvas').getBoundingClientRect().bottom<=innerHeight+1"),label+': changing browser-bar height still fits');
  await emulate(client,844,390);
  await tapButton(client,'overlay-action');
  await gameWait(client,"LyricGalaga.app.game.state.status==='playing'");
  await evaluate(client,"LyricGalaga.app.openInstructions()");
  check(await evaluate(client,"document.getElementById('instructions-dialog').open && LyricGalaga.app.game.state.status==='paused'"),label+': active instructions pause gameplay');
  await evaluate(client,"dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))");
  await delay(70);
  check(await evaluate(client,"!LyricGalaga.app.isStopped() && LyricGalaga.app.game.state.status==='paused'"),label+': persisted pagehide suspends');
  await evaluate(client,"dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
  await delay(100);
  check(await evaluate(client,"!LyricGalaga.app.isStopped() && LyricGalaga.app.game.state.status==='paused'"),label+': pageshow remains paused and alive');
  await tapButton(client,'close-instructions');
  check(await evaluate(client,"LyricGalaga.app.game.state.status==='paused'"),label+': interrupted instructions close requires explicit resume');
  await tapButton(client,'overlay-action');
  await gameWait(client,"LyricGalaga.app.game.state.status==='playing'");
  await evaluate(client,"dispatchEvent(new Event('blur'))");
  check(await evaluate(client,"LyricGalaga.app.game.state.status==='paused' && LyricGalaga.app.game.state.player.vx===0 && LyricGalaga.app.game.state.player.vy===0"),label+': focus interruption resets velocity');
}
async function tilt(client, label) {
  await tapButton(client,'mobile-menu-button');
  await evaluate(client,"(()=>{DeviceOrientationEvent.requestPermission=()=>Promise.resolve('denied');window.motionRequests=0;const old=DeviceOrientationEvent.requestPermission;DeviceOrientationEvent.requestPermission=()=>{motionRequests++;return old();};})()");
  await tapButton(client,'mobile-tilt-button');
  check(await evaluate(client,"motionRequests===1 && LyricGalaga.app.controls.mode==='joystick' && document.getElementById('mobile-control-status').textContent.includes('permission')"),label+': denied permission falls back');
  await evaluate(client,"DeviceOrientationEvent.requestPermission=()=>Promise.resolve('granted')");
  await tapButton(client,'mobile-tilt-button');
  await gameWait(client,"LyricGalaga.app.controls.tiltStatus==='unavailable'",3000);
  check(await evaluate(client,"LyricGalaga.app.controls.mode==='joystick' && !LyricGalaga.app.game.state.charge"),label+': absent sensor readings fall back');
  await evaluate(client,"DeviceOrientationEvent.requestPermission=()=>new Promise(resolve=>{window.pendingMotionPermission=resolve;})");
  await tapButton(client,'mobile-tilt-button');
  await tapButton(client,'mobile-joystick-button');
  await evaluate(client,"pendingMotionPermission('granted')");
  await delay(80);
  check(await evaluate(client,"LyricGalaga.app.controls.mode==='joystick' && document.getElementById('mobile-control-status').textContent.includes('joystick')"),label+': delayed permission cannot undo joystick selection');
  await evaluate(client,"DeviceOrientationEvent.requestPermission=()=>Promise.resolve('granted')");
  for (const angle of [90,270]) {
    await evaluate(client,"(()=>{Object.defineProperty(screen.orientation,'angle',{configurable:true,value:"+angle+"});window.mockBeta=0;window.mockGamma=0;clearInterval(window.mockSensor);window.mockSensor=setInterval(()=>{const e=new Event('deviceorientation');Object.defineProperties(e,{beta:{value:mockBeta},gamma:{value:mockGamma}});dispatchEvent(e);},25);dispatchEvent(new Event('orientationchange'));})()");
    await tapButton(client,'mobile-tilt-button');
    await gameWait(client,"LyricGalaga.app.controls.mode==='tilt' && !LyricGalaga.app.controls.needsCalibration",3000);
    check(await evaluate(client,"(()=>{const c=document.getElementById('touch-cycle').getBoundingClientRect();return document.body.dataset.controlMode==='tilt'&&getComputedStyle(document.getElementById('touch-joystick')).display==='none'&&c.left<innerWidth/2;})()"),label+': tilt action placement '+angle);
    await tapButton(client,'mobile-resume-button');
    await gameWait(client,"LyricGalaga.app.game.state.status==='playing'");
    await evaluate(client,"(()=>{const s=LyricGalaga.app.game.state;s.player.x=480;s.player.y=580;s.player.vx=0;s.player.vy=0;s.player.invulnerable=1000;window.motionStart={x:s.player.x,y:s.player.y};mockBeta="+(angle===90?17:-17)+";mockGamma="+(angle===90?-12:12)+";})()");
    await delay(400);
    check(await evaluate(client,'LyricGalaga.app.game.state.player.x>motionStart.x+25 && LyricGalaga.app.game.state.player.y>motionStart.y+10'),label+': synthetic screen-relative two-axis direction '+angle);
    await tapButton(client,'mobile-menu-button');
    await evaluate(client,'mockBeta=0;mockGamma=0');
  }
  await tapButton(client,'mobile-joystick-button');
  check(await evaluate(client,"LyricGalaga.app.controls.mode==='joystick'"),label+': switch controls in pause menu');
  await evaluate(client,'clearInterval(window.mockSensor)');
  await tapButton(client,'mobile-resume-button');
  await evaluate(client,"LyricGalaga.app.controls.setMode('tilt');LyricGalaga.app.controls.needsCalibration=false;LyricGalaga.app.controls.motion.neutral={x:0,y:0};LyricGalaga.app.controls.motion.latest={x:0,y:0,at:performance.now()-1000}");
  await gameWait(client,"LyricGalaga.app.game.state.status==='paused' && LyricGalaga.app.controls.mode==='joystick'",3000);
  check(await evaluate(client,"!LyricGalaga.app.game.state.charge"),label+': sensor interruption pauses and cancels');
}
async function profile(client) {
  const result=await evaluate(client,"(()=>{const a=LyricGalaga.app,s=a.game.state;s.ivigRemaining=30;s.antigens=[];for(let i=0;i<100;i++)s.antigens.push({id:i+10,x:50+(i%12)*72,y:40+Math.floor(i/12)*55,radius:17,color:['green','blue','purple','gold'][i%4],age:1});s.shots=[];for(let i=0;i<96;i++)s.shots.push({id:i+300,x:20+i%12*75,y:200+Math.floor(i/12)*50,radius:4,color:['green','blue','purple','gold'][i%4]});s.macrophages=[{x:300,y:300,radius:220,phase:'windup',remaining:.25},{x:650,y:300,radius:220,phase:'engulf',remaining:.25}];const start=performance.now();for(let i=0;i<100;i++)a.renderer.render(s,1/60);return {frames:100,ms:performance.now()-start,canvas:[a.renderer.canvas.width,a.renderer.canvas.height]};})()");
  check(result.canvas[0]===960 && result.canvas[1]===720,'Logical canvas resolution remains 960x720');
  console.log(client.name+': synthetic dense-scene render diagnostic '+(result.ms/result.frames).toFixed(2)+' ms/frame (desktop headless; not iPhone performance)');
  await client.screenshot('dense-render-diagnostic');
}
async function exit(client, label) {
  if (client.embedded) {
    await client.evaluate("window.mobileDisposed=null;addEventListener('message',e=>{if(e.data&&e.data.type==='mobile-smoke-disposed')mobileDisposed=e.data;})");
    await evaluate(client,"(()=>{const a=LyricGalaga.app,old=a.controls.destroy;a.controls.destroy=function(){const result=old.call(this);parent.postMessage({type:'mobile-smoke-disposed',stopped:a.isStopped(),destroyed:this.destroyed},'*');return result;};})()");
    await tapButton(client,'mobile-menu-button');
    await tapButton(client,'mobile-library-button');
    await client.wait("!document.getElementById('game-frame') && !document.getElementById('library-screen').hidden",14000);
    check(!await client.gameContext(),label+': exit removes iframe execution context');
    check(await client.evaluate('Boolean(mobileDisposed && mobileDisposed.stopped && mobileDisposed.destroyed)'),label+': child stops and disposes input before iframe removal');
    await client.evaluate("LyricGames.play('antigen-assault')");await client.gameWait('Boolean(window.LyricGalaga && LyricGalaga.app)');
    check(await client.gameEvaluate("LyricGalaga.app.game.state.status==='ready' && !LyricGalaga.app.isStopped()"),label+': repeat entry fresh campaign');
    await client.evaluate('history.back()');await client.wait("!document.getElementById('game-frame')",14000);
    check(await client.evaluate("!document.getElementById('library-screen').hidden"),label+': browser Back exits game');
  } else {
    await evaluate(client,"dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}))");
    check(await evaluate(client,'LyricGalaga.app.isStopped() && LyricGalaga.app.controls.destroyed'),label+': permanent pagehide disposes');
  }
}
async function projectProxy(targetPort) {
  const proxy=http.createServer((request,response)=>{
    if(!['GET','HEAD'].includes(request.method)||!request.url.startsWith('/preview/')){response.writeHead(404);response.end();return;}
    const upstream=http.request({host:'127.0.0.1',port:targetPort,path:request.url.slice('/preview'.length),method:request.method},incoming=>{response.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(response);});
    upstream.on('error',()=>{response.writeHead(502);response.end();});upstream.end();
  });
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  return proxy;
}
async function main() {
  fs.mkdirSync(artifacts,{recursive:true});
  const filter=(process.argv.find(arg=>arg.startsWith('--browser='))||'').slice(10);
  const selected=filter?browsers.filter(([name])=>name===filter):browsers;
  assert(selected.length,'Install the requested Chrome/Edge browser.');
  const host=require('../server.js').createGamesServer({host:'127.0.0.1',port:0});await host.start();
  const proxy=await projectProxy(host.server.address().port),base='http://127.0.0.1:'+proxy.address().port+'/preview/';
  const routes=[['direct-file',pathToFileURL(path.join(root,'lyric_galaga','index.html')).href,false],['iframe-file',pathToFileURL(path.join(root,'index.html')).href,true],['direct-http',base+'lyric_galaga/index.html',false],['iframe-http',base+'index.html',true]];
  try {
    for(const [name,executable] of selected) {
      const client=await launch(name+'-mobile',executable);
      try {
        for(const [label,url,embedded] of routes) {
          console.log(client.name+': '+label);
          await open(client,url,embedded);await layout(client,label);
          if(label==='direct-file'||label==='iframe-http') {
            await touchPlay(client,label);await tilt(client,label);
            if(label==='iframe-http'&&name==='chrome')await profile(client);
            await exit(client,label);
          } else {
            await start(client);await client.screenshot(label+'-play');
          }
        }
        check(client.errors.length===0,'Uncaught browser errors: '+JSON.stringify(client.errors));
        for(const extension of ['txt','png']) {
          const stale=path.join(artifacts,name+'-mobile-failure.'+extension);
          if(fs.existsSync(stale))fs.unlinkSync(stale);
        }
      } catch(error) {
        fs.writeFileSync(path.join(artifacts,name+'-mobile-failure.txt'),error.stack+'\n\n'+client.stderr);
        try{await client.screenshot('failure');}catch(_){}
        throw error;
      } finally {await close(client);}
    }
  } finally {await new Promise(resolve=>proxy.close(resolve));await host.close();}
  console.log('Mobile emulation verification passed: '+checks+' checks. Physical iPhone validation remains necessary.');
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={emulate,open,layout,touchPlay,tilt};
