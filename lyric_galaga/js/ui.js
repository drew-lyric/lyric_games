(function (root) {
  'use strict';
  const LG=root.LyricGalaga;
  const $=id => document.getElementById(id);
  const canvas=$('game-canvas'),dialog=$('instructions-dialog');
  const seed=(Date.now()^(typeof performance==='object'?Math.round(performance.now()*1000):0))>>>0;
  const game=new LG.Game({seed:seed}),renderer=new LG.Renderer(canvas);
  const input={left:false,right:false,up:false,down:false,fire:false,cycle:false,detonate:false};
  let raf=0,last=0,exiting=false,uiStatus=null,toastUntil=0,dialogPaused=false,dialogFocus=null;
  let announcement='';
  function isBossStage(state) {return !!state.boss||state.level>game.levels.length;}
  function clock(time) {const seconds=Math.floor(time||0);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
  function clearInput(cancelCharge) {
    Object.keys(input).forEach(key => {input[key]=false;});
    if(cancelCharge)game.cancelCharge();
  }
  function focusArena() {if(!exiting&&!dialog.open)canvas.focus({preventScroll:true});}
  function announce(value) {if(value!==announcement){announcement=value;$('status-region').textContent=value;}}
  function toast(value,duration) {$('toast').textContent=value;$('toast').hidden=false;toastUntil=performance.now()+(duration||2300);}
  function overlayNote(value) {const note=$('overlay-note');if(note)note.textContent=value;}
  function processEvents() {
    game.drainEvents().forEach(function(event) {
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
    if(exiting)return;clearInput(false);game.start();processEvents();updateHUD();focusArena();
  }
  function pause(reason) {
    if(exiting)return false;clearInput(true);
    const changed=game.pause();if(changed){processEvents();updateHUD();if(reason)announce(reason);}
    return changed;
  }
  function resume() {
    if(exiting||dialog.open)return;clearInput(false);game.resume();processEvents();updateHUD();focusArena();last=performance.now();
  }
  function restart() {
    if(exiting)return;clearInput(false);renderer.reset();game.restart();uiStatus=null;toastUntil=0;$('toast').hidden=true;processEvents();updateHUD();focusArena();last=performance.now();
  }
  function stop() {
    if(exiting)return;exiting=true;cancelAnimationFrame(raf);clearInput(true);game.pause();if(dialog.open)dialog.close();
    document.removeEventListener('keydown',onKeyDown);document.removeEventListener('keyup',onKeyUp);
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
    $('stage-banner').hidden=s.status!=='intermission';
    if(s.status==='intermission') {
      const next=s.level+1;$('stage-kicker').textContent='SECTOR '+String(s.level).padStart(2,'0')+' CLEAR';
      $('stage-banner-title').textContent=next>game.levels.length?'Adaptive antigen':game.levels[next-1].title;
      $('stage-countdown').textContent='NEXT RESPONSE IN '+Math.max(1,Math.ceil(s.intermission));
    }
    updateWeapons();updateOverlay();
  }
  const controlled=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyZ','KeyX','KeyP','Escape']);
  function onKeyDown(event) {
    if(exiting||dialog.open||event.altKey||event.ctrlKey||event.metaKey||!controlled.has(event.code))return;
    if(event.code==='Space'&&document.activeElement&&['BUTTON','INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
    const active=['playing','intermission','paused'].includes(game.state.status);
    if(!active)return;event.preventDefault();
    if(event.code==='KeyP'||event.code==='Escape') {if(!event.repeat){if(game.state.status==='paused')resume();else pause();}return;}
    if(game.state.status!=='playing')return;
    if(event.code==='ArrowLeft')input.left=true;
    else if(event.code==='ArrowRight')input.right=true;
    else if(event.code==='Space')input.fire=true;
    else if(event.code==='ArrowUp')input.up=true;
    else if(event.code==='ArrowDown')input.down=true;
    else if(event.code==='KeyZ'&&!event.repeat)input.cycle=1;
    else if(event.code==='KeyX'&&!event.repeat)input.detonate=true;
  }
  function onKeyUp(event) {
    if(event.code==='ArrowLeft')input.left=false;
    else if(event.code==='ArrowRight')input.right=false;
    else if(event.code==='ArrowUp')input.up=false;
    else if(event.code==='ArrowDown')input.down=false;
    else if(event.code==='Space')input.fire=false;
    if(event.code==='Space'&&document.activeElement&&['BUTTON','INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
    if(!dialog.open&&controlled.has(event.code)&&game.state.status==='playing')event.preventDefault();
  }
  function openInstructions() {
    if(exiting||dialog.open)return;
    const count=game.levels.length;
    dialog.querySelector('p').textContent='Clear '+(count===5?'five':count)+' '+(count===1?'sector':'sectors')+', then defeat a boss whose vulnerable core switches between four antigen colors. You have '+game.config.lives+' '+(game.config.lives===1?'life':'lives')+'. After a hit, your ship is protected for '+game.config.invulnerability+' seconds.';
    dialogFocus=document.activeElement;dialogPaused=pause();dialog.showModal();$('close-instructions').focus({preventScroll:true});
  }
  function frame(now) {
    if(exiting)return;const dt=last?Math.min(.1,(now-last)/1000):0;last=now;
    game.step(dt,input);input.cycle=false;input.detonate=false;processEvents();
    const cosmeticDt=game.state.status==='paused'?0:dt;renderer.render(game.state,cosmeticDt);
    if(game.state.status==='ready')renderer.drawWelcome($('welcome-art'),renderer.time);
    updateHUD();
    if(toastUntil&&now>toastUntil){$('toast').hidden=true;toastUntil=0;}
    raf=requestAnimationFrame(frame);
  }
  $('overlay-action').addEventListener('click',function(){const s=game.state.status;if(s==='ready')start();else if(s==='paused')resume();else restart();});
  $('pause-button').addEventListener('click',function(){if(game.state.status==='paused')resume();else pause();});
  $('restart-button').addEventListener('click',restart);
  $('instructions-button').addEventListener('click',openInstructions);
  $('antigen-response').addEventListener('change',function(){
    if(exiting)return;clearInput(true);game.setAntigenResponse(this.checked);processEvents();updateHUD();
    announce(this.checked?'Antigen response on. Enemy shots enabled.':'Antigen response off. No enemy shots; spawning is 50 percent faster.');
    if(game.state.status==='playing')focusArena();
  });
  $('close-instructions').addEventListener('click',() => dialog.close());$('instructions-done').addEventListener('click',() => dialog.close());
  dialog.addEventListener('click',function(event){if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  dialog.addEventListener('close',function(){if(exiting)return;if(dialogPaused){dialogPaused=false;resume();}else if(dialogFocus&&typeof dialogFocus.focus==='function')dialogFocus.focus({preventScroll:true});});
  document.addEventListener('keydown',onKeyDown);document.addEventListener('keyup',onKeyUp);
  root.addEventListener('blur',function(){if(!exiting)pause('Flight paused because the game lost focus.');});
  document.addEventListener('visibilitychange',function(){if(document.hidden&&!exiting)pause('Flight paused because the game is hidden.');});
  root.addEventListener('pagehide',stop);
  root.addEventListener('message',function(event) {
    const data=event.data;if(root.parent===root||event.source!==root.parent||!data||data.type!=='lyric-games:prepare-exit'||typeof data.requestId!=='string')return;
    if(location.protocol!=='file:'&&event.origin!==location.origin)return;
    stop();root.parent.postMessage({type:'lyric-games:exit-ready',requestId:data.requestId},location.protocol==='file:'?'*':location.origin);
  });
  LG.app={game:game,renderer:renderer,input:input,start:start,pause:pause,resume:resume,restart:restart,updateHUD:updateHUD,stop:stop,openInstructions:openInstructions,isStopped:() => exiting};
  makeWeapons();
  function drawIVIGIcon(){const icon=$('ivig-icon');icon.getContext('2d').clearRect(0,0,48,48);LG.Assets.draw(icon.getContext('2d'),'ivig',0,0,48,48,0);}
  drawIVIGIcon();
  LG.Assets.subscribe(function(){document.querySelectorAll('.weapon-chip').forEach(chip => {const id=chip.dataset.weapon,icon=chip.querySelector('canvas');icon.getContext('2d').clearRect(0,0,44,44);LG.Assets.draw(icon.getContext('2d'),id==='white'?'opsonin':'antigen-'+id,0,0,44,44,0,{color:id});});drawIVIGIcon();});
  LG.Assets.load();updateHUD();renderer.render(game.state,0);renderer.drawWelcome($('welcome-art'),0);raf=requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : window);
