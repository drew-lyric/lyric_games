(function (root) {
  'use strict';
  const LG = root.LyricGalaga, TAU = Math.PI * 2;
  const IVIG_COLORS = ['#8df2b1','#66c7ff','#cc90ff','#ffe18d'];
  function text(ctx,value,x,y,ink,size,align) {
    ctx.font=(size||10)+'px "Consolas", monospace';ctx.fillStyle=ink;ctx.textAlign=align||'left';ctx.fillText(value,Math.round(x),Math.round(y));
  }
  function pixelRing(ctx,x,y,radius,ink,size,dashed,rotation) {
    const count=Math.max(20,Math.ceil(radius*1.8));ctx.fillStyle=ink;
    for(let i=0;i<count;i++) {
      if(dashed&&i%8>4)continue;const a=i/count*TAU+(rotation||0);
      const px=Math.round((x+Math.cos(a)*radius)/2)*2,py=Math.round((y+Math.sin(a)*radius)/2)*2;
      ctx.fillRect(px-size/2,py-size/2,size,size);
    }
  }
  function circle(ctx,x,y,r,ink,alpha) {ctx.save();ctx.globalAlpha*=alpha==null?1:alpha;ctx.fillStyle=ink;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();}

  class Renderer {
    constructor(canvas) {
      this.canvas=canvas;this.ctx=canvas.getContext('2d');this.time=0;this.effects=[];this.random=LG.makeRandom(73451);this.shake=0;
      this.ctx.imageSmoothingEnabled=false;
      this.reducedMotion=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.stars=Array.from({length:80},() => ({x:this.random()*960,y:this.random()*720,size:this.random()>.8?2:1,speed:4+this.random()*11,alpha:.2+this.random()*.5}));
    }
    reset() {this.effects=[];this.shake=0;this.time=0;}
    burst(event,count,delay,speed) {
      const ink=LG.Assets.color(event.color);
      const particles=Array.from({length:count},() => {
        const a=this.random()*TAU,v=(speed||90)*(.3+this.random());
        return {vx:Math.cos(a)*v,vy:Math.sin(a)*v,size:2+Math.floor(this.random()*3),ink:event.color==='rainbow'?IVIG_COLORS[Math.floor(this.random()*4)]:this.random()<.2?'#f1f8ff':ink};
      });
      this.effects.push({type:'burst',x:event.x,y:event.y,age:0,duration:.62,delay:delay||0,particles:particles});
    }
    handleEvent(event) {
      if(!Number.isFinite(event.x)||!Number.isFinite(event.y))return;
      const ink=LG.Assets.color(event.color);
      if(event.type==='fire')this.effects.push({type:'muzzle',x:event.x,y:event.y,ink:ink,age:0,duration:.09});
      else if(event.type==='bind')this.effects.push({type:'bind',x:event.x,y:event.y,color:event.color,ink:ink,radius:event.radius||17,age:0,duration:.18});
      else if(event.type==='destroy') {
        this.burst(event,event.source==='boss'?80:event.source==='macrophage'?14:18,.14,event.source==='boss'?220:95);
        if(event.source==='boss'&&!this.reducedMotion)this.shake=.32;
      }else if(event.type==='mismatch') {
        this.effects.push({type:'mismatch',x:event.x,y:event.y,ink:ink,age:0,duration:.16});
      }else if(event.type==='pickup') {
        this.burst(event,14,0,55);this.effects.push({type:'label',x:event.x,y:event.y,value:'+1 OPSONIN',ink:'#eef7ff',age:0,duration:1.1});
      }else if(event.type==='ivig') {
        this.burst({x:event.x,y:event.y,color:'rainbow'},36,0,110);
        this.effects.push({type:'label',x:event.x,y:event.y,value:'IVIG!',ink:'#f0f7ff',age:0,duration:1.3});
      }else if(event.type==='orb-settle')this.effects.push({type:'ring',x:event.x,y:event.y,ink:'#d7efff',radius:22,age:0,duration:.45});
      else if(event.type==='hurt') {
        this.burst(event,22,0,130);this.effects.push({type:'hurt',x:event.x,y:event.y,age:0,duration:.32});
        if(!this.reducedMotion)this.shake=.18;
      }else if(event.type==='boss-warning')this.effects.push({type:'ring',x:event.x,y:event.y,ink:LG.Assets.color(event.nextColor),radius:100,age:0,duration:.6});
    }
    render(state,dt) {
      dt=Math.max(0,Math.min(.1,dt||0));this.time+=dt;this.shake=Math.max(0,this.shake-dt);
      const ctx=this.ctx;ctx.save();ctx.clearRect(0,0,960,720);
      if(this.shake>0){const amp=this.shake*13;ctx.translate(Math.sin(this.time*100)*amp,Math.cos(this.time*85)*amp);}
      this.drawEnvironment(state);
      (state.macrophages||[]).forEach(cell => this.drawMacrophage(cell));
      (state.orbs||[]).forEach(orb => this.drawOrb(orb));
      (state.pickups||[]).forEach(pickup => this.drawPickup(pickup));
      (state.antigens||[]).forEach(enemy => this.drawAntigen(enemy));
      if(state.boss&&state.boss.health>0)this.drawBoss(state.boss);
      (state.shots||[]).forEach(shot => {
        const ink=LG.Assets.color(shot.color),vy=Number.isFinite(shot.vy)?shot.vy:-(shot.speed||1);
        const rotation=Math.atan2(shot.vx||0,-vy);
        ctx.save();ctx.translate(shot.x,shot.y);ctx.rotate(rotation);
        ctx.fillStyle=ink+'35';ctx.fillRect(-2,9,4,15);ctx.restore();
        LG.Assets.draw(ctx,'antibody-'+shot.color,shot.x-8,shot.y-12,16,24,this.time,{color:shot.color,rotation:rotation});
      });
      (state.enemyShots||[]).forEach(shot => LG.Assets.draw(ctx,'enemy-shot',shot.x-7,shot.y-7,14,14,this.time,{color:shot.color}));
      this.drawPlayer(state);
      if(state.status==='ready')this.drawIdleFormation();
      this.effects=this.effects.filter(effect => {
        effect.age+=dt;
        if(effect.age>(effect.delay||0)+effect.duration)return false;
        if(effect.age>=(effect.delay||0))this.drawEffect(effect);return true;
      });
      if(state.charge)this.drawCharge(state.player,state.charge);
      // Keep the activation callout readable above the moving antigens.
      (state.macrophages||[]).forEach(cell => this.drawMacrophageLabel(cell));
      ctx.restore();ctx.imageSmoothingEnabled=false;
    }
    drawEnvironment(state) {
      const ctx=this.ctx;ctx.fillStyle='#101c2e';ctx.fillRect(0,0,960,720);
      const grd=ctx.createRadialGradient(480,250,70,480,320,570);grd.addColorStop(0,'#14283c');grd.addColorStop(1,'#0b1728');ctx.fillStyle=grd;ctx.fillRect(0,0,960,720);
      ctx.fillStyle='#263b50';
      for(let x=30;x<960;x+=40)for(let y=22;y<680;y+=40)ctx.fillRect(x,y,1,1);
      this.stars.forEach(star => {ctx.globalAlpha=star.alpha;ctx.fillStyle='#64849d';ctx.fillRect(Math.round(star.x),Math.round((star.y+this.time*star.speed)%672),star.size,star.size);});ctx.globalAlpha=1;
      ctx.fillStyle='#284058';for(let y=18;y<676;y+=26){ctx.fillRect(9,y,3,5);ctx.fillRect(948,y,3,5);}
      ctx.fillStyle='#233c54';ctx.fillRect(0,679,960,1);ctx.fillStyle='#142638';ctx.fillRect(0,680,960,40);
      for(let x=35;x<960;x+=78){ctx.fillStyle='#25435b';ctx.fillRect(x,691,22,2);ctx.fillRect(x+19,688,3,8);}
      text(ctx,'LYRIC / B-CELL CULTURE',24,708,'#63829a',9);text(ctx,'DEFENSE ARRAY ONLINE',936,708,'#63829a',9,'right');
      if(!state.boss){text(ctx,'ANTIGEN INGRESS',27,31,'#4b6a86',9);text(ctx,'↓',930,33,'#4b6a86',15);}
      // Quiet cell silhouettes anchor the arena in a culture without obscuring fire.
      ctx.save();ctx.globalAlpha=.045;
      LG.Assets.draw(ctx,'antigen-green',-32,135,145,145,this.time*.2);
      LG.Assets.draw(ctx,'antigen-blue',875,416,134,134,this.time*.2);
      LG.Assets.draw(ctx,'antigen-purple',849,40,95,95,this.time*.2);
      ctx.restore();
    }
    drawPlayer(state) {
      const p=state.player;if(!p||state.status==='gameover')return;
      const ctx=this.ctx,blink=p.invulnerable>0&&Math.floor(this.time*12)%2;
      const ink=LG.Assets.color(state.weapon);
      circle(ctx,p.x,p.y+17,34,'#336987',.09);
      if(state.ivigRemaining>0)this.drawIvigAura(p,blink);
      if(p.invulnerable>0){ctx.save();ctx.globalAlpha=.3+.2*Math.sin(this.time*12);pixelRing(ctx,p.x,p.y,40,'#91c8e8',2,true,this.time*.3);ctx.restore();}
      LG.Assets.draw(ctx,'ship',p.x-42,p.y-43,84,84,this.time,{animation:state.status==='playing'?'fly':'idle',color:state.weapon,alpha:blink?.4:1});
      // These glows also apply to replacement artwork, so equipped color stays clear.
      ctx.save();ctx.shadowBlur=14;ctx.shadowColor=ink;ctx.fillStyle=ink;
      ctx.globalAlpha=blink?.4:.85;
      [p.x-21,p.x+16].forEach(function (x) {
        if(state.ivigRemaining>0&&state.weapon!=='white') {
          const rainbow=ctx.createLinearGradient(x,p.y-26,x+5,p.y-23);
          IVIG_COLORS.forEach(function (color,i) {rainbow.addColorStop(i/3,color);});
          ctx.fillStyle=rainbow;ctx.shadowColor='#c8e6ff';
        }
        ctx.fillRect(Math.round(x),Math.round(p.y-26),5,3);
      });ctx.restore();
    }
    drawIvigAura(player,blink) {
      const ctx=this.ctx,phase=this.reducedMotion?0:this.time*.7;
      ctx.save();ctx.globalAlpha=blink?.2:.42;
      IVIG_COLORS.forEach(function (ink,i) {
        const a=i/4*TAU+phase,x=player.x+Math.cos(a)*23,y=player.y+Math.sin(a)*20;
        const halo=ctx.createRadialGradient(x,y,2,x,y,37);
        halo.addColorStop(0,ink+'90');halo.addColorStop(.45,ink+'48');halo.addColorStop(1,ink+'00');
        ctx.fillStyle=halo;ctx.fillRect(x-37,y-37,74,74);
        ctx.strokeStyle=ink;ctx.shadowColor=ink;ctx.shadowBlur=12;ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(player.x,player.y,40,a-.34,a+.34);ctx.stroke();
      });
      ctx.restore();
    }
    drawAntigen(enemy) {
      const r=enemy.radius||17,tilt=Math.sin(this.time*2+(enemy.id||0))*.06;
      LG.Assets.draw(this.ctx,enemy.sprite||'antigen-'+enemy.color,enemy.x-r*1.35,enemy.y-r*1.35,r*2.7,r*2.7,this.time+(enemy.id||0)*.17,{color:enemy.color,rotation:tilt});
    }
    drawPickup(orb) {
      const ctx=this.ctx,r=orb.radius||15;
      if(orb.kind==='ivig') {
        ctx.save();ctx.globalAlpha=.6;ctx.lineWidth=1.5;
        IVIG_COLORS.forEach((ink,i) => {
          const a=i/4*TAU+(this.reducedMotion?0:this.time*.9);
          ctx.strokeStyle=ink;ctx.beginPath();ctx.arc(orb.x,orb.y,r+6,a,a+.7);ctx.stroke();
        });ctx.restore();
        LG.Assets.draw(ctx,'ivig',orb.x-r*1.25,orb.y-r*1.25,r*2.5,r*2.5,this.time);
        text(ctx,'IVIG',orb.x,orb.y+r+15,'#e2ecff',8,'center');
      }else {
        ctx.save();ctx.globalAlpha=.5;pixelRing(ctx,orb.x,orb.y,r+9,'#98b7ca',2,true,-this.time*.8);ctx.restore();
        LG.Assets.draw(ctx,'opsonin',orb.x-r,orb.y-r,r*2,r*2,this.time);
        text(ctx,'OPSONIN',orb.x,orb.y+r+17,'#bacfdd',8,'center');
      }
    }
    drawOrb(orb) {
      const ctx=this.ctx,r=orb.radius||10;
      if(orb.status==='flying') {ctx.fillStyle='#a8cadc40';ctx.fillRect(orb.x-2,orb.y+9,4,18);}
      else {
        ctx.save();ctx.globalAlpha=.45;pixelRing(ctx,orb.x,orb.y,r+9+Math.sin(this.time*2)*2,'#afccdc',2,true,this.time*.2);ctx.restore();
        text(ctx,'X',orb.x,orb.y+r+17,'#90afc4',9,'center');
      }
      LG.Assets.draw(ctx,'opsonin',orb.x-r*1.2,orb.y-r*1.2,r*2.4,r*2.4,this.time,{animation:orb.status==='settled'?'settled':'idle'});
    }
    drawMacrophage(cell) {
      const ctx=this.ctx,r=cell.radius,windup=cell.phase==='windup';
      const duration=windup?LG.Config.opsonin.windup:LG.Config.opsonin.aftermath;
      const progress=Math.max(0,Math.min(1,1-cell.remaining/duration));
      const eased=progress*progress*(3-2*progress),fade=windup?1:1-eased;
      const rise=this.reducedMotion?1:eased;
      const size=r*2.25*(windup?.67+.33*rise:1+(this.reducedMotion?0:.07*Math.sin(progress*Math.PI)));
      const y=windup?cell.y+(720+r*1.2-cell.y)*(1-rise):cell.y;
      ctx.save();
      ctx.beginPath();ctx.rect(0,0,960,720);ctx.clip();
      // The thin circle stays at the actual attack radius while the cell rises.
      circle(ctx,cell.x,cell.y,r,'#d3eefa',(windup?.035+.045*eased:.12*fade));
      ctx.strokeStyle='#d8f2ff';ctx.lineWidth=windup?1.5:2;ctx.globalAlpha=(windup?.22+.25*eased:.65*fade);
      ctx.beginPath();ctx.arc(cell.x,cell.y,r,0,TAU);ctx.stroke();ctx.globalAlpha=1;
      const halo=ctx.createRadialGradient(cell.x,y,size*.2,cell.x,y,size*.58);
      halo.addColorStop(0,'#d9f3ff28');halo.addColorStop(.65,'#d9f3ff15');halo.addColorStop(1,'#d9f3ff00');
      ctx.fillStyle=halo;ctx.globalAlpha=(windup?eased:fade);
      ctx.fillRect(cell.x-size*.6,y-size*.6,size*1.2,size*1.2);ctx.globalAlpha=1;
      LG.Assets.draw(ctx,'macrophage',cell.x-size/2,y-size/2,size,size,this.time,{
        animation:windup?'windup':'engulf',alpha:windup?.15+.75*eased:.9*fade
      });
      if(!windup&&!this.reducedMotion) {
        ctx.strokeStyle='#f0fbff';ctx.lineWidth=2;ctx.globalAlpha=.6*fade;
        ctx.beginPath();ctx.arc(cell.x,cell.y,r*(.86+.22*progress),0,TAU);ctx.stroke();
      }
      ctx.restore();
    }
    drawMacrophageLabel(cell) {
      const ctx=this.ctx,windup=cell.phase==='windup';
      const duration=windup?LG.Config.opsonin.windup:LG.Config.opsonin.aftermath;
      const progress=Math.max(0,Math.min(1,1-cell.remaining/duration));
      const x=Math.max(158,Math.min(802,cell.x)),y=Math.max(54,Math.min(646,cell.y));
      ctx.save();ctx.globalAlpha=windup?.65+.35*progress:1-progress*progress;
      ctx.font='bold 32px "Consolas", monospace';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineJoin='round';ctx.lineWidth=6;ctx.strokeStyle='#11283c';
      ctx.shadowColor='#0b1a2b';ctx.shadowBlur=12;ctx.strokeText('OPSONIZED!',x,y);
      ctx.shadowBlur=0;ctx.fillStyle='#ffffff';ctx.fillText('OPSONIZED!',x,y);
      ctx.restore();
    }
    drawBoss(boss) {
      const ctx=this.ctx,ink=LG.Assets.color(boss.color),r=boss.radius||83;
      circle(ctx,boss.x,boss.y,r+24,ink,.045);
      LG.Assets.draw(ctx,'boss',boss.x-r*1.18,boss.y-r*1.18,r*2.36,r*2.36,this.time,{color:boss.color,phase:boss.phase,animation:'idle'});
      pixelRing(ctx,boss.x,boss.y,boss.coreRadius||34,ink,2,true,this.time*.22);
      text(ctx,'ADAPTIVE ANTIGEN / PHASE '+boss.phase,28,25,'#a0b6c8',10);
      text(ctx,Math.ceil(boss.health)+' / '+boss.maxHealth,932,25,ink,10,'right');
      ctx.fillStyle='#26394e';ctx.fillRect(28,35,904,6);ctx.fillStyle=ink;ctx.fillRect(28,35,904*Math.max(0,boss.health/boss.maxHealth),6);
      for(let i=1;i<3;i++){ctx.fillStyle='#0d1c2d';ctx.fillRect(28+904*i/3,35,2,6);}
      if(boss.nextColor) {
        const next=LG.Assets.color(boss.nextColor);ctx.save();ctx.globalAlpha=.5+.4*Math.sin(this.time*11);
        pixelRing(ctx,boss.x,boss.y,r+14,next,3,true,-this.time*.3);ctx.restore();
        text(ctx,'CORE SHIFT → '+boss.nextColor.toUpperCase(),boss.x,boss.y+r+27,next,11,'center');
      }else text(ctx,boss.color.toUpperCase()+' CORE',boss.x,boss.y+r+24,ink,9,'center');
    }
    drawCharge(player,charge) {
      const ctx=this.ctx,x=player.x>865?player.x-58:player.x+48,y=player.y-51,w=10,h=70,power=Math.max(0,Math.min(1,charge.power));
      ctx.fillStyle='#0d1b2c';ctx.fillRect(x-5,y-8,56,h+18);ctx.strokeStyle='#557a94';ctx.strokeRect(x-.5,y-.5,w+1,h+1);
      ctx.fillStyle='#21394e';ctx.fillRect(x+2,y+2,w-4,h-4);ctx.fillStyle='#edf7fc';ctx.fillRect(x+2,y+h-2-(h-4)*power,w-4,(h-4)*power);
      for(let i=1;i<5;i++){ctx.fillStyle='#12283b';ctx.fillRect(x+2,y+i*h/5,w-4,1);}
      text(ctx,Math.round(power*100)+'%',x+17,y+35,'#e6f3fa',10);text(ctx,'POWER',x+17,y+47,'#9bbbd0',7);
    }
    drawIdleFormation() {
      const ctx=this.ctx;ctx.save();ctx.globalAlpha=.25;
      for(let i=0;i<10;i++) {const c=LG.Colors[i%4];LG.Assets.draw(ctx,'antigen-'+c.id,120+i%5*164,115+Math.floor(i/5)*130,55,55,this.time+i*.2);}
      ctx.restore();
    }
    drawEffect(effect) {
      const ctx=this.ctx,age=effect.age-(effect.delay||0),p=age/effect.duration;
      ctx.save();
      if(effect.type==='burst') {
        effect.particles.forEach(dot => {ctx.globalAlpha=1-p;ctx.fillStyle=dot.ink;ctx.fillRect(Math.round(effect.x+dot.vx*age),Math.round(effect.y+dot.vy*age+age*age*30),dot.size,dot.size);});
        if(p<.15){ctx.globalAlpha=(1-p/.15)*.8;circle(ctx,effect.x,effect.y,13,'#e9f9ff');}
      } else if(effect.type==='bind') {
        const r=effect.radius;
        LG.Assets.draw(ctx,'antigen-'+effect.color,effect.x-r*1.3,effect.y-r*1.3,r*2.6,r*2.6,this.time,{animation:'bind',color:effect.color,alpha:1-p*.4});
        ctx.globalAlpha=1-p;pixelRing(ctx,effect.x,effect.y,r*(1.35-p*.4),'#e1f9ff',2,false);
        for(let i=0;i<3;i++){const a=i/3*TAU-.8,dist=r*(1.8-p*.6);LG.Assets.draw(ctx,'antibody-'+effect.color,effect.x+Math.cos(a)*dist-7,effect.y+Math.sin(a)*dist-9,14,18,this.time,{rotation:a+Math.PI/2,color:effect.color});}
      } else if(effect.type==='mismatch') {
        ctx.globalAlpha=1-p;ctx.fillStyle=effect.ink;ctx.fillRect(effect.x-15-p*14,effect.y-3,4,4);ctx.fillRect(effect.x+11+p*14,effect.y+3,4,4);pixelRing(ctx,effect.x,effect.y,11+p*9,'#8ca4b6',1,true);
      }else if(effect.type==='muzzle') {
        ctx.globalAlpha=1-p;ctx.fillStyle=effect.ink;ctx.fillRect(effect.x-23,effect.y-6,8,7);ctx.fillRect(effect.x+15,effect.y-6,8,7);
      }else if(effect.type==='ring') {ctx.globalAlpha=1-p;pixelRing(ctx,effect.x,effect.y,effect.radius*(.6+p*.6),effect.ink,2,false);}
      else if(effect.type==='label') {ctx.globalAlpha=1-p;text(ctx,effect.value,effect.x,effect.y-15-age*22,effect.ink,10,'center');}
      else if(effect.type==='hurt') {ctx.globalAlpha=(1-p)*.09;ctx.fillStyle='#ee8f85';ctx.fillRect(0,0,960,720);}
      ctx.restore();
    }
    drawWelcome(canvas,time) {
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
      const colors=LG.Colors;
      for(let i=0;i<4;i++) {
        const x=70+i*100,y=17+Math.sin(time*1.2+i)*4;
        ctx.fillStyle='#2c465f';ctx.fillRect(x-20,67,40,1);
        LG.Assets.draw(ctx,'antigen-'+colors[i].id,x-24,y,48,48,time+i);
      }
      LG.Assets.draw(ctx,'ship',188,69,64,64,time,{animation:'fly',color:'green'});
      LG.Assets.draw(ctx,'antibody-green',196,48-Math.floor(time*50)%40,11,20,time,{color:'green'});
      LG.Assets.draw(ctx,'antibody-green',232,48-Math.floor(time*50)%40,11,20,time,{color:'green'});
      ctx.fillStyle='#587e97';ctx.fillRect(160,114,17,1);ctx.fillRect(263,114,17,1);
      text(ctx,'LYRIC / AA—01',220,136,'#6c91a9',7,'center');
    }
  }
  LG.Renderer=Renderer;
})(typeof globalThis !== 'undefined' ? globalThis : window);
