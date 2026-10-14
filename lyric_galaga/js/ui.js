(function (root) {
  'use strict';
  const LG=root.LyricGalaga;
  const $=id => document.getElementById(id);
  const canvas=$('game-canvas'),dialog=$('instructions-dialog'),settings=$('settings-dialog');
  const seed=(Date.now()^(typeof performance==='object'?Math.round(performance.now()*1000):0))>>>0;
  const game=new LG.Game({seed:seed}),renderer=new LG.Renderer(canvas);
  const input={left:false,right:false,up:false,down:false,moveX:0,moveY:0,fire:false,fireTap:false,cycle:false,detonate:false};
  const mobileQuery=matchMedia('(any-pointer: coarse)');
  const embedded=root.parent!==root&&new URLSearchParams(location.search).has('launcher');
  function phoneLayout() {return mobileQuery.matches&&Math.min(innerWidth,innerHeight)<=600;}
  let controls=null,isMobile=phoneLayout(),landscape=innerWidth>innerHeight;
  let raf=0,last=0,lastPaint=0,exiting=false,suspended=false,renderDirty=true,uiStatus=null,hudSignature='',toastUntil=0,dialogPaused=false,dialogFocus=null,controlOperation=0;
  let controlMessage='Drag the joystick to steer. Tap or hold the arena to fire.';
  let announcement='';
  function isBossStage(state) {return !!state.boss||state.level>game.levels.length;}
  function clock(time) {const seconds=Math.floor(time||0);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
  function clearInput(cancelCharge) {
    Object.keys(input).forEach(key => {input[key]=false;});
    if(controls)controls.clear(!!cancelCharge);
    if(cancelCharge)game.cancelCharge();
    game.resetMovement();renderDirty=true;
  }
  function focusArena() {if(!exiting&&!dialog.open)canvas.focus({preventScroll:true});}
  function announce(value) {if(value!==announcement){announcement=value;$('status-region').textContent=value;}}
  function toast(value,duration) {$('toast').textContent=value;$('toast').hidden=false;toastUntil=performance.now()+(duration||2300);}
  function textValue(id,value) {const node=$(id),next=String(value);if(node&&node.textContent!==next)node.textContent=next;}
  function hide(id,value) {const node=$(id);if(node&&node.hidden!==!!value)node.hidden=!!value;}
  function setControlMessage(value) {controlMessage=value;textValue('welcome-control-status',value);textValue('mobile-control-status',value);}
  function refreshControls() {
    if(exiting)return;
    document.body.classList.toggle('mobile-game',isMobile);
    document.body.classList.toggle('embedded-mobile-game',isMobile&&embedded);
    document.body.dataset.controlMode=controls?controls.mode:'joystick';
    hide('rotate-prompt',!isMobile||landscape);
    hide('touch-controls',!isMobile||!landscape||game.state.status!=='playing'||dialog.open||settings.open);
    hide('welcome-mobile-controls',game.state.status!=='ready');
    const calibration=controls&&controls.mode==='tilt';
    textValue('mobile-tilt-button',calibration?'Recalibrate tilt':'Enable tilt');
    textValue('welcome-tilt-button',calibration?'Recalibrate tilt':'Enable tilt');
    $('mobile-response').checked=game.state.antigenResponse;
    $('mobile-resume-button').disabled=game.state.status!=='paused'||(isMobile&&!landscape);
    $('touch-activate').disabled=!game.state.orbs.some(orb=>orb.status==='settled');
    $('touch-cycle').style.setProperty('--equipped-color',LG.Assets.color(game.state.weapon));
    $('touch-cycle').setAttribute('aria-label','Cycle weapon. Equipped: '+(game.state.weapon==='white'?'opsonin':game.state.weapon+' antibody'));
    $('touch-activate').setAttribute('aria-label','Activate '+game.state.orbs.filter(orb=>orb.status==='settled').length+' settled opsonins');
    textValue('welcome-control-status',controlMessage);textValue('mobile-control-status',controlMessage);
    renderDirty=true;
  }
  function viewportChanged() {
    const previous=landscape,wasMobile=isMobile;landscape=innerWidth>innerHeight;isMobile=phoneLayout();
    if(controls&&wasMobile!==isMobile){clearInput(true);controls.setMode(isMobile?'joystick':'keyboard');}
    if(isMobile&&previous!==landscape){pause('Flight paused after rotating the screen.');if(controls)controls.invalidateCalibration();}
    refreshControls();
  }
  function library() {
    pause();
    if(embedded)root.parent.postMessage({type:'lyric-games:library'},location.protocol==='file:'?'*':location.origin);
    else location.href='../index.html';
  }
  async function withReadyControls(action) {
    if(exiting||(isMobile&&!landscape))return;
    if(controls&&controls.mode==='tilt'&&controls.needsCalibration){
      const operation=++controlOperation;setControlMessage('Hold the phone still in your comfortable playing position.');
      const ready=await controls.calibrate();
      if(exiting||operation!==controlOperation)return;
      if(!ready){refreshControls();return;}
      setControlMessage('Tilt to steer. Tap or hold the arena to fire.');
    }
    if(!exiting&&(!isMobile||landscape))action();
  }
  async function enableTilt() {
    if(exiting||!controls||(isMobile&&!landscape))return;
    pause();const operation=++controlOperation;setControlMessage('Allow motion, then hold the phone still to calibrate.');
    // Called immediately from this button gesture, before any asynchronous work.
    const ready=await (controls.mode==='tilt'?controls.calibrate():controls.enableTilt());
    if(exiting||operation!==controlOperation)return;
    if(ready)setControlMessage('Tilt to steer. Tap or hold the arena to fire.');
    refreshControls();
  }
  function useJoystick() {
    if(exiting||!controls)return;++controlOperation;clearInput(true);controls.setMode('joystick');
    setControlMessage('Drag the left joystick to steer. Weapon and Activate are on the right.');refreshControls();
  }
  function overlayNote(value) {const note=$('overlay-note');if(note)note.textContent=value;}
  function processEvents() {
    game.drainEvents().forEach(function(event) {
      renderDirty=true;
      renderer.handleEvent(event);
      if(event.type==='pickup')toast('OPSONIN COLLECTED  ·  Z TO EQUIP WHITE');
      else if(event.type==='ivig')toast('IVIG ACTIVE  ·  ALL FOUR COLORS  ·  '+Math.round(event.duration||game.config.ivig.duration)+'s',2600);
      else if(event.type==='level'&&event.level>1)toast(event.level>game.levels.length?'FINAL RESPONSE  ·  MATCH THE BOSS CORE':'SECTOR '+String(event.level).padStart(2,'0')+'  ·  '+event.title.toUpperCase(),3100);
      else if(event.type==='boss-warning')toast('CORE SHIFT  ·  '+event.nextColor.toUpperCase(),1200);
      else if(event.type==='boss-phase')toast('BOSS PHASE '+event.phase+'  ·  PRESSURE INCREASING',1800);
      else if(event.type==='hurt'&&event.lives>0)toast('HULL LOST  ·  TEMPORARY SHIELD ACTIVE',1400);
    });
  }
  function start() {
    return withReadyControls(function(){clearInput(false);game.start();processEvents();updateHUD();refreshControls();focusArena();last=performance.now();});
  }
  function pause(reason) {
    if(exiting)return false;clearInput(true);
    const changed=game.pause();if(changed){processEvents();updateHUD();if(reason)announce(reason);}refreshControls();
    return changed;
  }
  function resume() {
    if(exiting||dialog.open)return;if(settings.open)settings.close();
    return withReadyControls(function(){clearInput(false);game.resume();processEvents();updateHUD();refreshControls();focusArena();last=performance.now();});
  }
  function restart() {
    if(exiting)return;if(settings.open)settings.close();
    return withReadyControls(function(){clearInput(false);renderer.reset();game.restart();uiStatus=null;hudSignature='';toastUntil=0;$('toast').hidden=true;processEvents();updateHUD();refreshControls();focusArena();last=performance.now();});
  }
  function stop() {
    if(exiting)return;exiting=true;++controlOperation;cancelAnimationFrame(raf);clearInput(true);game.pause();if(dialog.open)dialog.close();if(settings.open)settings.close();
    if(controls)controls.destroy();
  }
  function makeWeapons() {
    const list=$('weapon-list');
    LG.Colors.concat([{id:'white',name:'White',color:'#eef7ff',unlock:0}]).forEach(function(color) {
      const chip=document.createElement('div');chip.className='weapon-chip';chip.dataset.weapon=color.id;chip.style.setProperty('--weapon-color',color.color);
      const icon=document.createElement('canvas');icon.width=44;icon.height=44;icon.setAttribute('aria-hidden','true');
      const label=document.createElement('strong');label.textContent=color.id==='white'?'OPSONIN':color.name.toUpperCase();
      const hint=document.createElement('small');chip.append(icon,label,hint);list.appendChild(chip);
      LG.Assets.draw(icon.getContext('2d'),color.id==='white'?'opsonin':'antigen-'+color.id,0,0,44,44,0,{color:color.id});
    });
  }
  function updateWeapons() {
    const s=game.state;
    document.querySelectorAll('.weapon-chip').forEach(function(chip) {
      const id=chip.dataset.weapon,enabled=id==='white'?s.opsonins>0:s.unlocked.includes(id);
      chip.classList.toggle('locked',!enabled);chip.classList.toggle('active',s.weapon===id);
      chip.setAttribute('aria-label',(id==='white'?'Opsonin':id+' antibody')+(s.weapon===id?', equipped':enabled?', available':', locked'));
      const color=LG.Colors.find(c => c.id===id);
      chip.querySelector('small').textContent=s.weapon===id?'':id==='white'?(s.opsonins>0?'×'+s.opsonins:'COLLECT'):enabled?'READY':'SECTOR '+color.unlock;
    });
    const ivig=s.ivigRemaining>0;
    $('weapon-value').textContent=s.weapon==='white'?'WHITE / OPSONIN':ivig?'IVIG / ALL FOUR COLORS':s.weapon.toUpperCase()+' ANTIBODY';
    $('weapon-value').style.color=ivig&&s.weapon!=='white'?'#eef7ff':LG.Assets.color(s.weapon);
    $('ivig-readout').classList.toggle('active',ivig);
    $('ivig-value').textContent=ivig?Math.ceil(s.ivigRemaining)+'s':'INACTIVE';
    $('ivig-timer').hidden=!ivig;$('ivig-timer').max=game.config.ivig.duration;$('ivig-timer').value=s.ivigRemaining||0;
    $('stock-value').textContent=s.opsonins;
    $('placed-value').textContent=s.orbs.filter(orb => orb.status==='settled').length;
    $('arena-hint').textContent=s.weapon==='white'?'HOLD SPACE · RELEASE TO PLACE · X TO ACTIVATE':ivig?'IVIG ACTIVE · FOUR-COLOR SPRAY':'MATCH ANTIBODY TO ANTIGEN';
  }
  function updateOverlay() {
    const s=game.state,status=s.status,overlayKey=status+':'+game.levels.length;if(uiStatus===overlayKey)return;uiStatus=overlayKey;
    const overlay=$('game-overlay'),welcome=status==='ready';
    overlay.hidden=!['ready','paused','gameover','victory'].includes(status);
    overlay.classList.toggle('compact',!welcome);
    $('welcome-flow').hidden=!welcome;$('welcome-art').hidden=!welcome;
    $('welcome-mobile-controls').hidden=!welcome;
    $('overlay-title').style.whiteSpace='pre-line';
    if(welcome) {
      $('overlay-kicker').textContent='A LYRIC GAMES CAMPAIGN';$('overlay-badge').textContent='01—'+String(game.levels.length+1).padStart(2,'0');$('overlay-title').textContent='ANTIGEN\nASSAULT';
      $('overlay-description').textContent='The bloodstream is clogged with antigens. Only Lyric polyclonal antibody blasters can destroy them and save the day!';
      $('overlay-action').innerHTML='Start campaign <span aria-hidden="true">→</span>';
    }else if(status==='paused') {
      $('overlay-kicker').textContent='CULTURE DEFENSE ON HOLD';$('overlay-badge').textContent='PAUSED';$('overlay-title').textContent='FLIGHT\nPAUSED';
      $('overlay-description').textContent='Resume when you are ready.';
      $('overlay-action').innerHTML='Resume flight <span aria-hidden="true">→</span>';overlayNote('P or Escape resumes · A cancelled charge costs no opsonin');
    }else if(status==='gameover') {
      $('overlay-kicker').textContent='DEFENSE ARRAY OFFLINE';$('overlay-badge').textContent='END OF RUN';$('overlay-title').textContent='SIGNAL\nLOST';
      $('overlay-description').textContent='Your last hull is down. Score: '+s.score.toLocaleString()+' — '+clock(s.time)+'s';
      $('overlay-action').innerHTML='Try again <span aria-hidden="true">↻</span>';overlayNote('A new campaign starts with three lives and green antibodies.');
    }else if(status==='victory') {
      $('overlay-kicker').textContent='B-CELL CULTURE SECURED';$('overlay-badge').textContent='VICTORY';$('overlay-title').textContent='CULTURE\nSECURED';
      $('overlay-description').textContent='The adaptive antigen is neutralized. Score '+s.score.toLocaleString()+' · '+clock(s.time)+' in flight. Your antibody array has won the day.';
      $('overlay-action').innerHTML='Fly another campaign <span aria-hidden="true">↻</span>';overlayNote('Specificity wins. A strong culture starts with a precise response.');
    }
    if(!overlay.hidden&&!dialog.open&&!exiting)$('overlay-action').focus({preventScroll:true});
    announce(status==='ready'?'Antigen Assault is ready. Start campaign to play.':status==='paused'?'Flight paused.':status==='gameover'?'Game over. Final score '+s.score:status==='victory'?'Victory. Final score '+s.score:'Sector '+s.level+', '+s.title+'.');
  }
  function updateHUD() {
    const s=game.state;
    const settled=s.orbs.filter(orb=>orb.status==='settled').length;
    const signature=[s.status,s.level,s.wave,s.title,s.score,s.lives,Math.floor(s.time),s.weapon,s.opsonins,settled,Math.ceil(s.ivigRemaining),Math.ceil(s.intermission),s.antigenResponse,s.unlocked.join(','),isMobile,landscape,controls&&controls.mode].join('|');
    if(signature===hudSignature)return;hudSignature=signature;
    $('mission-title').textContent=s.title||'Antigen interception';
    const label=s.status==='playing'?'LIVE RESPONSE':s.status==='intermission'?'SECTOR CLEAR':s.status==='paused'?'FLIGHT PAUSED':s.status==='victory'?'CULTURE SECURED':s.status==='gameover'?'ARRAY OFFLINE':'SYSTEM READY';
    $('mission-state').innerHTML='<i class="status-dot"></i> '+label;
    const bossStage=isBossStage(s),stage=game.levels[s.level-1],waveCount=stage&&stage.waves?stage.waves.length:0;
    $('stage-value').innerHTML=bossStage?'BOSS <span>/ '+String(game.levels.length+1).padStart(2,'0')+'</span>':String(s.level).padStart(2,'0')+' <span>/ '+String(game.levels.length).padStart(2,'0')+'</span>';
    $('wave-value').textContent=bossStage?'FINAL RESPONSE':'WAVE '+String(Math.max(1,s.wave)).padStart(2,'0')+' / '+String(waveCount).padStart(2,'0');
    $('score-value').textContent=String(s.score).padStart(6,'0');$('time-value').textContent=clock(s.time);
    const lives=$('lives-value');lives.setAttribute('aria-label',s.lives+' '+(s.lives===1?'life':'lives'));
    Array.from(lives.children).forEach((hull,index) => hull.classList.toggle('lost',index>=s.lives));
    const active=['playing','intermission','paused'].includes(s.status);
    $('pause-button').disabled=!active;$('pause-button').innerHTML=(s.status==='paused'?'Resume':'Pause')+' <kbd>P</kbd>';
    $('restart-button').disabled=s.status==='ready';
    $('antigen-response').checked=s.antigenResponse;
    textValue('mobile-lives',s.lives);textValue('mobile-score',s.score);
    textValue('mobile-weapon',s.weapon==='white'?'WHITE':s.ivigRemaining>0?'IVIG':s.weapon.toUpperCase());
    $('mobile-weapon').style.color=LG.Assets.color(s.weapon);
    textValue('mobile-stock',s.opsonins);textValue('mobile-settled',settled);
    textValue('mobile-ivig',s.ivigRemaining>0?Math.ceil(s.ivigRemaining)+'s':'—');
    $('stage-banner').hidden=s.status!=='intermission';
    if(s.status==='intermission') {
      const next=s.level+1;$('stage-kicker').textContent='SECTOR '+String(s.level).padStart(2,'0')+' CLEAR';
      $('stage-banner-title').textContent=next>game.levels.length?'Adaptive antigen':game.levels[next-1].title;
      $('stage-countdown').textContent='NEXT RESPONSE IN '+Math.max(1,Math.ceil(s.intermission));
    }
    updateWeapons();updateOverlay();refreshControls();
  }
  function openInstructions() {
    if(exiting||dialog.open)return;
    if(settings.open)settings.close();
    const count=game.levels.length;
    dialog.querySelector('p:not(.mobile-instructions)').textContent='Clear '+(count===5?'five':count)+' '+(count===1?'sector':'sectors')+', then defeat a boss whose vulnerable core switches between four antigen colors. You have '+game.config.lives+' '+(game.config.lives===1?'life':'lives')+'. After a hit, your ship is protected for '+game.config.invulnerability+' seconds.';
    dialogFocus=document.activeElement;dialogPaused=pause();dialog.showModal();refreshControls();$('close-instructions').focus({preventScroll:true});
  }
  function openSettings() {
    if(exiting||dialog.open||settings.open)return;pause();settings.showModal();refreshControls();$('close-settings').focus({preventScroll:true});
  }
  function interrupt(reason) {
    dialogPaused=false;pause(reason);last=0;lastPaint=0;
    if(controls&&controls.mode==='tilt'){controls.invalidateCalibration();setControlMessage('Hold the phone still when resuming to recalibrate tilt.');}
  }
  function pageHide(event) {
    if(event.persisted){interrupt('Flight paused while the page is suspended.');suspended=true;cancelAnimationFrame(raf);raf=0;}
    else stop();
  }
  function pageShow(event) {
    if(!event.persisted||exiting)return;suspended=false;last=0;lastPaint=0;clearInput(true);hudSignature='';renderDirty=true;updateHUD();
    if(!raf)raf=requestAnimationFrame(frame);
  }
  function frame(now) {
    if(exiting||suspended)return;const dt=last?Math.min(.1,(now-last)/1000):0;last=now;
    Object.assign(input,controls.sample(dt));
    game.step(dt,input);input.cycle=false;input.detonate=false;input.fireTap=false;processEvents();
    const animated=['playing','intermission','ready'].includes(game.state.status);
    if(!lastPaint||(animated?now-lastPaint>=1000/60-.1:renderDirty)){
      const cosmeticDt=animated&&lastPaint?Math.min(.1,(now-lastPaint)/1000):0;
      renderer.render(game.state,cosmeticDt);lastPaint=now;renderDirty=false;
      if(game.state.status==='ready')renderer.drawWelcome($('welcome-art'),renderer.time);
    }
    updateHUD();
    if(toastUntil&&now>toastUntil){$('toast').hidden=true;toastUntil=0;}
    raf=requestAnimationFrame(frame);
  }
  $('overlay-action').addEventListener('click',function(){const s=game.state.status;if(s==='ready')start();else if(s==='paused')resume();else restart();});
  $('pause-button').addEventListener('click',function(){if(game.state.status==='paused')resume();else pause();});
  $('restart-button').addEventListener('click',restart);
  $('instructions-button').addEventListener('click',openInstructions);
  $('mobile-menu-button').addEventListener('click',openSettings);
  $('close-settings').addEventListener('click',()=>settings.close());
  settings.addEventListener('close',()=>{refreshControls();if(!exiting&&game.state.status==='paused')$('overlay-action').focus({preventScroll:true});});
  $('mobile-resume-button').addEventListener('click',resume);
  $('mobile-instructions-button').addEventListener('click',openInstructions);
  $('mobile-restart-button').addEventListener('click',restart);
  $('mobile-library-button').addEventListener('click',library);
  $('rotate-library-button').addEventListener('click',library);
  $('mobile-tilt-button').addEventListener('click',enableTilt);
  $('welcome-tilt-button').addEventListener('click',enableTilt);
  $('mobile-joystick-button').addEventListener('click',useJoystick);
  $('welcome-joystick-button').addEventListener('click',useJoystick);
  $('mobile-response').addEventListener('change',function(){clearInput(true);game.setAntigenResponse(this.checked);updateHUD();});
  $('antigen-response').addEventListener('change',function(){
    if(exiting)return;clearInput(true);game.setAntigenResponse(this.checked);processEvents();updateHUD();
    announce(this.checked?'Antigen response on. Enemy shots enabled.':'Antigen response off. No enemy shots; spawning is 50 percent faster.');
    if(game.state.status==='playing')focusArena();
  });
  $('close-instructions').addEventListener('click',() => dialog.close());$('instructions-done').addEventListener('click',() => dialog.close());
  dialog.addEventListener('click',function(event){if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  dialog.addEventListener('close',function(){if(exiting)return;if(dialogPaused){dialogPaused=false;resume();}else if(dialogFocus&&typeof dialogFocus.focus==='function')dialogFocus.focus({preventScroll:true});refreshControls();});
  controls=new LG.Controls({mode:isMobile?'joystick':'keyboard',surface:$('play-surface'),joystick:$('touch-joystick'),stick:$('touch-stick'),cycleButton:$('touch-cycle'),activateButton:$('touch-activate'),
    isPlaying:()=>!exiting&&game.state.status==='playing'&&!dialog.open&&!settings.open&&(!isMobile||landscape),
    onPause:()=>{if(dialog.open||settings.open)return false;if(game.state.status==='paused')resume();else pause();return true;},
    onCancel:()=>game.cancelCharge(),onChange:()=>{if(controls)refreshControls();},
    onUnavailable:message=>{if(exiting)return;pause();setControlMessage(message+' Use the joystick to steer.');refreshControls();},
    onOrientationChange:()=>{if(exiting)return;interrupt('Flight paused after rotating the screen.');viewportChanged();}
  });
  root.addEventListener('resize',viewportChanged);mobileQuery.addEventListener('change',viewportChanged);
  root.addEventListener('blur',()=>{if(!exiting)interrupt('Flight paused because the game lost focus.');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!exiting)interrupt('Flight paused because the game is hidden.');});
  root.addEventListener('pagehide',pageHide);root.addEventListener('pageshow',pageShow);
  root.addEventListener('message',function(event) {
    const data=event.data;if(root.parent===root||event.source!==root.parent||!data||data.type!=='lyric-games:prepare-exit'||typeof data.requestId!=='string')return;
    if(location.protocol!=='file:'&&event.origin!==location.origin)return;
    stop();root.parent.postMessage({type:'lyric-games:exit-ready',requestId:data.requestId},location.protocol==='file:'?'*':location.origin);
  });
  LG.app={game:game,renderer:renderer,input:input,controls:controls,start:start,pause:pause,resume:resume,restart:restart,updateHUD:updateHUD,stop:stop,openInstructions:openInstructions,openSettings:openSettings,isStopped:() => exiting};
  makeWeapons();
  function drawIVIGIcon(){const icon=$('ivig-icon');icon.getContext('2d').clearRect(0,0,48,48);LG.Assets.draw(icon.getContext('2d'),'ivig',0,0,48,48,0);}
  drawIVIGIcon();
  LG.Assets.subscribe(function(){document.querySelectorAll('.weapon-chip').forEach(chip => {const id=chip.dataset.weapon,icon=chip.querySelector('canvas');icon.getContext('2d').clearRect(0,0,44,44);LG.Assets.draw(icon.getContext('2d'),id==='white'?'opsonin':'antigen-'+id,0,0,44,44,0,{color:id});});drawIVIGIcon();renderDirty=true;});
  LG.Assets.load();viewportChanged();updateHUD();renderer.render(game.state,0);renderer.drawWelcome($('welcome-art'),0);raf=requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : window);
