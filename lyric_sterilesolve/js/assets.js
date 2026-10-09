(function (root) {
  'use strict';
  const LSS = root.LyricSterileSolver;
  // Optional sprite sheets. Frames run left to right, then top to bottom.
  // Replace paths and dimensions without changing the component's ports or rules.
  LSS.AssetManifest = {
    reactor: {src:null,frameWidth:64,frameHeight:64,fps:6,animations:{idle:[0],running:[0,1,2,1],fault:[3,4],complete:[5]},fallback:'reactor'},
    flask: {src:null,frameWidth:64,frameHeight:64,fps:5,animations:{idle:[0],running:[0,1],fault:[2,3]},fallback:'flask'},
    pump: {src:null,frameWidth:64,frameHeight:64,fps:8,animations:{idle:[0],running:[0,1,2,3],fault:[4,5]},fallback:'pump'},
    splitter: {src:null,frameWidth:64,frameHeight:64,fps:4,animations:{idle:[0],running:[0,1]},fallback:'splitter'},
    selector: {src:null,frameWidth:64,frameHeight:64,fps:6,animations:{idle:[0],running:[0,1]},fallback:'selector'},
    clamp: {src:null,frameWidth:32,frameHeight:32,fps:4,animations:{open:[0],closed:[1]},fallback:'clamp'},
    tube: {src:null,frameWidth:64,frameHeight:32,fps:6,animations:{idle:[0],running:[0,1,2,3]},fallback:'tube'},
    spray: {src:null,frameWidth:64,frameHeight:64,fps:10,animations:{idle:[0],spray:[1,2,3]},fallback:'spray'},
    vat: {src:null,frameWidth:64,frameHeight:64,fps:4,animations:{idle:[0]},fallback:'vat'},
    glove: {src:null,frameWidth:32,frameHeight:40,fps:6,animations:{idle:[0],grab:[1],spray:[2]},fallback:'glove'}
  };
  function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function stepped(ctx,points,fill,stroke){ctx.beginPath();points.forEach(function(p,i){if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
  function liquid(ctx,x,y,w,h,color,t,level){const height=h*Math.max(0,Math.min(1,level));rect(ctx,x,y+h-height,w,height,color);rect(ctx,x,y+h-height,w,2,'#c6e8f755');for(let i=0;i<4;i++){const bx=x+4+(i*11)%Math.max(10,w-8),by=y+h-((t*7+i*13)%Math.max(3,height));if(by>y+h-height)rect(ctx,bx,by,2,2,'#d7efff77');}}
  const art = {
    reactor:function(ctx,t,o){
      // Horizontal amber resin chamber, with a transparent perfusion channel.
      stepped(ctx,[[12,15],[50,15],[56,21],[58,29],[58,37],[56,45],[50,51],[12,51],[7,45],[5,37],[5,29],[7,21]],'#b85720','#e7a154');
      rect(ctx,13,17,36,3,'#f2bd7477');rect(ctx,10,22,42,8,'#ee8f364a');rect(ctx,10,40,42,7,'#7a321b70');
      ctx.fillStyle='#e4aa6050';ctx.beginPath();ctx.ellipse(12,33,7,16,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#f6c484';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle='#9c4c20';ctx.beginPath();ctx.ellipse(51,33,6,16,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#df9744';ctx.stroke();
      rect(ctx,0,29,64,8,'#d1e7ee8f');rect(ctx,0,31,64,4,o.color||'#7b9cab');rect(ctx,0,29,64,1,'#f0fafdb0');rect(ctx,0,36,64,1,'#1c4b6380');
      rect(ctx,13,22,35,2,'#ffe9c743');rect(ctx,17,46,29,1,'#fac18177');
      if(o.status==='running'){for(let i=0;i<4;i++)rect(ctx,(t*18+i*16)%60,32,3,2,'#ecf8ff');}
      if(o.status==='complete'){rect(ctx,29,18,3,5,'#c1edb4');rect(ctx,32,21,3,3,'#c1edb4');rect(ctx,35,16,3,7,'#c1edb4');}
    },
    flask:function(ctx,t,o){
      stepped(ctx,[[25,6],[39,6],[39,21],[53,46],[53,57],[11,57],[11,46],[25,21]],'#29475c','#94afc0');
      ctx.save();ctx.beginPath();ctx.moveTo(27,13);ctx.lineTo(37,13);ctx.lineTo(37,24);ctx.lineTo(50,47);ctx.lineTo(50,54);ctx.lineTo(14,54);ctx.lineTo(14,47);ctx.lineTo(27,24);ctx.closePath();ctx.clip();
      liquid(ctx,13,14,38,40,o.color||'#639fe2',t,o.fill===undefined?.6:o.fill);ctx.restore();
      rect(ctx,23,3,18,5,'#85a3b8');rect(ctx,26,4,12,2,'#c5d8e4');rect(ctx,17,46,3,7,'#c5e9fa55');rect(ctx,27,16,2,10,'#c5e9fa55');
      rect(ctx,35,44,7,2,'#b5d2e47a');rect(ctx,37,38,5,2,'#b5d2e47a');rect(ctx,36,50,6,2,'#b5d2e47a');
    },
    pump:function(ctx,t,o){
      rect(ctx,4,15,56,36,'#405d74');rect(ctx,8,19,48,29,'#1a2e43');rect(ctx,10,22,20,13,'#081929');rect(ctx,12,24,16,9,'#82b8c5');
      rect(ctx,14,27,5,2,'#14364a');rect(ctx,21,27,5,2,'#14364a');rect(ctx,10,39,7,4,o.status==='running'?'#72d0ad':'#455a6d');rect(ctx,21,39,7,4,'#66869e');
      ctx.strokeStyle='#8badc0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(43,33,10,0,Math.PI*2);ctx.stroke();
      const angle=o.status==='running'?t*4:0;for(let i=0;i<3;i++){let a=angle+i*Math.PI*2/3;rect(ctx,43+Math.cos(a)*6-2,33+Math.sin(a)*6-2,4,4,'#d0e2ec');}rect(ctx,41,31,4,4,'#476f86');
      rect(ctx,0,29,6,6,'#a3becd');rect(ctx,58,29,6,6,'#a3becd');rect(ctx,9,51,6,5,'#27475d');rect(ctx,48,51,6,5,'#27475d');
    },
    splitter:function(ctx,t,o){
      stepped(ctx,[[2,27],[22,27],[39,9],[44,14],[29,31],[44,48],[39,53],[22,36],[2,36]],'#688da6','#b0cedb');
      rect(ctx,23,27,8,9,'#334e66');rect(ctx,1,25,6,13,'#a5becd');rect(ctx,38,6,10,9,'#a5becd');rect(ctx,38,49,10,9,'#a5becd');rect(ctx,24,29,5,5,o.color||'#6dadcc');
    },
    selector:function(ctx,t,o){
      rect(ctx,1,29,25,7,'#8eb0c4');rect(ctx,40,12,22,7,'#8eb0c4');rect(ctx,40,45,22,7,'#8eb0c4');
      ctx.fillStyle='#385a73';ctx.strokeStyle='#a4c5d5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(31,33,16,0,Math.PI*2);ctx.fill();ctx.stroke();
      const top=!(o.outlet===1||o.outlet==='out2');ctx.strokeStyle='#c8e9f3';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(20,33);ctx.lineTo(31,33);ctx.lineTo(43,top?20:45);ctx.stroke();
      rect(ctx,26,28,10,10,'#a4c4d3');rect(ctx,29,31,4,4,'#436a82');rect(ctx,25,6,12,6,'#608ca5');
    },
    clamp:function(ctx,t,o){
      ctx.strokeStyle='#2779be';ctx.lineWidth=3;ctx.beginPath();ctx.arc(8,8,6,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(24,6,5.5,0,Math.PI*2);ctx.stroke();
      stepped(ctx,[[11,11],[15,10],[23,23],[28,29],[24,31],[17,23]],'#3286cc','#65a8d8');stepped(ctx,[[23,11],[20,11],[18,23],[18,29],[21,30],[22,22]],'#2c72b0','#68a3cb');
      rect(ctx,18,20,3,3,'#dbebf2');rect(ctx,19,21,1,1,'#436983');if(o.closed)rect(ctx,20,27,5,2,'#e1b076');
    },
    tube:function(ctx,t,o){
      rect(ctx,3,12,58,8,'#748fa7');rect(ctx,3,14,58,4,o.color||'#4a778e');rect(ctx,1,10,6,12,'#aec6d4');rect(ctx,57,10,6,12,'#aec6d4');
    },
    spray:function(ctx,t,o){
      stepped(ctx,[[22,29],[41,29],[42,39],[48,46],[48,60],[17,60],[17,46],[22,39]],'#dbe3e6','#9bb2bf');rect(ctx,24,31,14,9,'#edf4f4');rect(ctx,20,46,3,11,'#ffffff99');rect(ctx,21,49,23,8,'#c3d0d5');rect(ctx,23,51,19,4,'#dee9ed');
      rect(ctx,22,24,19,6,'#d1343c');rect(ctx,24,25,15,2,'#fa6a65');rect(ctx,26,17,11,7,'#ecf1f0');
      stepped(ctx,[[19,5],[38,5],[42,10],[37,16],[27,18],[22,16],[16,11]],'#e8edef','#b7c5cc');rect(ctx,36,4,11,9,'#d92733');rect(ctx,45,6,5,6,'#ea4548');
      ctx.save();if(o.status==='spray'){const squeeze=(1+Math.sin(t*28))*.5;ctx.translate(-squeeze,squeeze*2);}stepped(ctx,[[35,12],[40,15],[47,29],[45,32],[41,29],[35,20],[31,18]],'#e62e37','#fb6263');ctx.restore();
      if(o.status==='spray'){for(let i=0;i<7;i++)rect(ctx,3+(i*4+t*20)%13,5+(i%3)*5,2,2,'#cfebf3');}
    },
    vat:function(ctx,t,o){
      rect(ctx,11,10,42,44,o.color||'#58aee8');rect(ctx,8,13,3,38,'#557d97');rect(ctx,53,13,3,38,'#557d97');rect(ctx,14,7,36,5,'#bad1de');rect(ctx,14,51,36,6,'#6b879c');rect(ctx,15,14,5,35,'#d6eef83a');rect(ctx,20,25,25,15,'#183b5580');rect(ctx,24,29,18,3,'#d9eefc');rect(ctx,24,34,12,2,'#b0d3e8');rect(ctx,43,16,3,31,'#16395544');
    },
    glove:function(ctx,t,o){
      const g=o.status==='grab';stepped(ctx,g?[[5,16],[7,11],[11,10],[13,12],[16,9],[20,9],[22,12],[25,12],[28,16],[28,26],[22,32],[21,38],[9,38],[9,31],[2,24],[2,18]]:[[7,18],[5,8],[7,5],[10,6],[12,16],[12,3],[15,1],[18,3],[18,15],[19,4],[22,3],[25,5],[25,17],[26,10],[29,9],[31,12],[30,24],[25,31],[23,38],[10,38],[9,31],[2,25],[1,19],[4,17]],'#b4d5e3','#4a829f');
      rect(ctx,11,32,11,5,'#83afc5');rect(ctx,11,35,11,3,'#759fb5');rect(ctx,g?12:14,g?18:7,2,g?8:15,'#e2f2f8');rect(ctx,22,18,2,7,'#91bbd2');
    }
  };
  function AssetManager(){this.images={};this.loadGeneration=0;this.ready=this.load();}
  AssetManager.prototype.load=function(){const self=this,generation=++this.loadGeneration;this.images={};const pending=Object.keys(LSS.AssetManifest).map(function(key){const def=LSS.AssetManifest[key];if(!def||!def.src||typeof Image==='undefined')return Promise.resolve('fallback');return new Promise(function(resolve){const img=new Image();img.onload=function(){if(generation===self.loadGeneration)self.images[key]=img;resolve('image');};img.onerror=function(){if(generation===self.loadGeneration)delete self.images[key];resolve('fallback');};img.src=def.src;});});this.ready=Promise.all(pending);return this.ready;};
  AssetManager.prototype.draw=function(ctx,key,x,y,w,h,time,options){const def=LSS.AssetManifest[key]||{fallback:key},o=options||{},img=this.images[key];let result='fallback';ctx.save();ctx.imageSmoothingEnabled=false;
    const fw=Number(def.frameWidth),fh=Number(def.frameHeight),animations=def.animations||{},candidate=animations[o.status]||animations.idle||[0],sequence=Array.isArray(candidate)&&candidate.length?candidate:[0],fps=Number(def.fps)>0?Number(def.fps):6;
    const frame=sequence[Math.floor(Math.max(0,time||0)*fps)%sequence.length],cols=img&&fw>0?Math.floor(img.naturalWidth/fw):0,rows=img&&fh>0?Math.floor(img.naturalHeight/fh):0;
    if(img&&fw>0&&fh>0&&cols>0&&rows>0&&Number.isInteger(frame)&&frame>=0&&frame<cols*rows){ctx.drawImage(img,(frame%cols)*fw,Math.floor(frame/cols)*fh,fw,fh,Math.round(x),Math.round(y),Math.round(w),Math.round(h));result='image';}
    else{const fallback=def.fallback||key,native=fallback==='glove'?[32,40]:fallback==='clamp'?[32,32]:fallback==='tube'?[64,32]:[64,64];ctx.translate(Math.round(x),Math.round(y));ctx.scale(w/native[0],h/native[1]);(art[fallback]||art.flask)(ctx,time||0,o);}ctx.restore();return result;
  };
  LSS.AssetManager=AssetManager;
})(typeof globalThis!=='undefined'?globalThis:this);
