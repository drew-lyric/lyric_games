(function (root) {
  'use strict';
  const LG = root.LyricGalaga;
  // Local sprite sheets are optional. Frames run left-to-right, then top-to-bottom.
  // Keep semantic keys stable; replace src, frame dimensions, fps and animations.
  LG.AssetManifest = {
    ship: { src: null, frameWidth: 64, frameHeight: 64, fps: 8, animations: { idle: [0], fly: [0, 1, 2, 1], hurt: [0] }, fallback: 'ship' },
    'antigen-green': { src: null, frameWidth: 32, frameHeight: 32, fps: 6, animations: { idle: [0, 1, 2, 1], bind: [0, 3] }, fallback: 'antigen', color: 'green' },
    'antigen-blue': { src: null, frameWidth: 32, frameHeight: 32, fps: 7, animations: { idle: [0, 1, 2, 1], bind: [0, 3] }, fallback: 'antigen', color: 'blue' },
    'antigen-purple': { src: null, frameWidth: 32, frameHeight: 32, fps: 5, animations: { idle: [0, 1, 2, 1], bind: [0, 3] }, fallback: 'antigen', color: 'purple' },
    'antigen-gold': { src: null, frameWidth: 32, frameHeight: 32, fps: 8, animations: { idle: [0, 1, 2, 1], bind: [0, 3] }, fallback: 'antigen', color: 'gold' },
    'antibody-green': { src: null, frameWidth: 12, frameHeight: 20, fps: 8, animations: { idle: [0] }, fallback: 'antibody', color: 'green' },
    'antibody-blue': { src: null, frameWidth: 12, frameHeight: 20, fps: 8, animations: { idle: [0] }, fallback: 'antibody', color: 'blue' },
    'antibody-purple': { src: null, frameWidth: 12, frameHeight: 20, fps: 8, animations: { idle: [0] }, fallback: 'antibody', color: 'purple' },
    'antibody-gold': { src: null, frameWidth: 12, frameHeight: 20, fps: 8, animations: { idle: [0] }, fallback: 'antibody', color: 'gold' },
    'enemy-shot': { src: null, frameWidth: 12, frameHeight: 12, fps: 8, animations: { idle: [0, 1] }, fallback: 'enemy-shot' },
    opsonin: { src: null, frameWidth: 32, frameHeight: 32, fps: 6, animations: { idle: [0, 1, 2, 1], settled: [0, 1] }, fallback: 'opsonin' },
    ivig: { src: null, frameWidth: 32, frameHeight: 32, fps: 8, animations: { idle: [0, 1, 2, 3] }, fallback: 'ivig' },
    macrophage: { src: null, frameWidth: 64, frameHeight: 64, fps: 8, animations: { idle: [0, 1, 2, 1], windup: [0, 1], engulf: [2, 3, 4] }, fallback: 'macrophage' },
    boss: { src: null, frameWidth: 128, frameHeight: 128, fps: 8, animations: { idle: [0, 1, 2, 1], attack: [2, 3], hurt: [4] }, fallback: 'boss' }
  };

  function color(id) {
    const item = LG.Colors.find(function (entry) { return entry.id === id; });
    return item ? item.color : id === 'white' ? '#eef7ff' : '#6caff0';
  }
  function polygon(ctx, points, fill, stroke) {
    ctx.beginPath();
    points.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke(); }
  }
  function ring(ctx, x, y, radius, fill, size, segments, offset) {
    ctx.fillStyle = fill;
    for (let i = 0; i < (segments || 28); i++) {
      const a = i / (segments || 28) * Math.PI * 2 + (offset || 0);
      ctx.fillRect(Math.round(x + Math.cos(a) * radius - size / 2), Math.round(y + Math.sin(a) * radius - size / 2), size, size);
    }
  }
  function glow(ctx, fill, blur, draw) {
    ctx.save(); ctx.shadowColor = fill; ctx.shadowBlur = blur; draw(); ctx.restore();
  }

  const fallback = {
    ship: function (ctx, t, options) {
      const ink = color(options.color || 'green');
      // Keep the wing assembly; the fuselage follows the upright Lyric mark.
      polygon(ctx, [[32,4],[37,20],[54,43],[58,54],[43,49],[34,45],[26,51],[7,55],[10,44],[23,22],[27,7]], '#10283a', '#6a98b3');
      polygon(ctx, [[15,29],[20,28],[23,44],[17,48],[12,48]], '#2e536f', '#81b5ce');
      polygon(ctx, [[43,28],[48,29],[51,48],[46,48],[40,44]], '#2e536f', '#81b5ce');
      // Three curved ribbon sections trace the supplied symbol. Dark seams
      // preserve its negative space at the ship's small on-screen size. Keep
      // the mark inset so the wing/body outline frames it on every side.
      ctx.save();ctx.translate(32.5,34);ctx.scale(.62,.62);ctx.translate(-32,-29);
      const ribbon = ctx.createLinearGradient(20, 4, 42, 49);
      ribbon.addColorStop(0, '#81d5ff');
      ribbon.addColorStop(.32, '#36a8ef');
      ribbon.addColorStop(.66, '#168bda');
      ribbon.addColorStop(1, '#2878bc');
      ctx.fillStyle = ribbon; ctx.strokeStyle = '#071726'; ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.moveTo(19.5, 3);
      ctx.lineTo(41.8, 12.5);
      ctx.bezierCurveTo(43.6, 15.8, 40.1, 18.1, 30.9, 21.3);
      ctx.bezierCurveTo(26.6, 20.5, 22.2, 18.2, 20.3, 15.3);
      ctx.bezierCurveTo(19.2, 13.2, 19.5, 7.5, 19.5, 3);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(42.6, 13.1);
      ctx.bezierCurveTo(46.6, 17.3, 47.2, 24.4, 43.1, 28.2);
      ctx.bezierCurveTo(38.8, 32.2, 30.1, 34.7, 26.1, 37.8);
      ctx.bezierCurveTo(23.1, 40.9, 21.2, 47.4, 19.5, 54);
      ctx.lineTo(19.5, 34.3);
      ctx.bezierCurveTo(19.3, 29.5, 22.9, 26, 27.5, 23.5);
      ctx.bezierCurveTo(32.6, 21.1, 43.3, 19.3, 42.6, 13.1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(30.9, 37.2);
      ctx.bezierCurveTo(31.1, 42.1, 31.1, 46.4, 28.8, 48.7);
      ctx.bezierCurveTo(26.9, 51.1, 23.2, 53.1, 19.5, 54);
      ctx.bezierCurveTo(21.8, 45.4, 24.3, 39.6, 30.9, 37.2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#102236'; ctx.fillRect(15,14,6,18); ctx.fillRect(43,14,6,18);
      ctx.fillStyle = '#688fa8'; ctx.fillRect(15,17,2,11); ctx.fillRect(47,17,2,11);
      glow(ctx, ink, 10, function () { ctx.fillStyle = ink; ctx.fillRect(15,13,6,4); ctx.fillRect(43,13,6,4); });
      ctx.fillStyle = '#e6f6fb'; ctx.fillRect(17,13,2,2); ctx.fillRect(45,13,2,2);
      if (options.animation === 'fly') {
        const flame = 4 + Math.floor(t * 20) % 4 * 2;
        ctx.fillStyle = '#23465e'; ctx.fillRect(25,51,4,flame+4); ctx.fillRect(36,48,3,flame+3);
        ctx.fillStyle = '#69afcc'; ctx.fillRect(26,51,2,flame); ctx.fillRect(36,49,2,flame-1);
      }
    },
    antigen: function (ctx, t, options, entry) {
      const id = options.color || entry.color, ink = color(id), pulse = Math.floor(t * 5) % 2;
      ctx.fillStyle = '#10273b';
      if (id === 'green') {
        polygon(ctx, [[22,6],[38,6],[42,13],[54,17],[59,30],[52,40],[45,44],[41,56],[24,58],[18,49],[8,44],[5,28],[11,17],[20,16]], '#1d4945', ink);
        ring(ctx,32,32,24,ink,4,9,t*.15);
        polygon(ctx, [[24,19],[38,17],[46,26],[43,40],[32,46],[20,37],[18,27]], '#3b8d79');
        ctx.fillStyle = '#95ead0'; ctx.fillRect(23,22,7,5); ctx.fillRect(37,35,5,6); ctx.fillRect(29,30,4,4);
      } else if (id === 'blue') {
        polygon(ctx, [[16,12],[23,5],[32,14],[44,6],[52,13],[49,22],[59,30],[50,39],[53,51],[41,56],[32,48],[20,57],[11,48],[14,38],[5,31],[13,21]], '#284962', ink);
        polygon(ctx, [[23,16],[41,17],[47,29],[42,44],[23,45],[17,32]], '#5484ae');
        polygon(ctx, [[26,23],[37,20],[43,31],[37,41],[25,38],[20,30]], '#99c8ed');
        ctx.fillStyle = '#d7edff'; ctx.fillRect(24,23,5,5); ctx.fillStyle = '#467093'; ctx.fillRect(32,31,8,6);
      } else if (id === 'purple') {
        polygon(ctx, [[17,5],[29,7],[34,13],[42,8],[53,16],[54,28],[45,34],[56,45],[50,56],[35,53],[28,47],[17,53],[7,44],[10,31],[17,26],[9,15]], '#45395c', ink);
        polygon(ctx, [[17,15],[25,13],[37,24],[43,16],[48,22],[43,32],[50,43],[43,47],[32,39],[21,47],[15,41],[22,30],[13,23]], '#9470b7');
        ctx.fillStyle = '#e5c8f8'; ctx.fillRect(19,17,5,5); ctx.fillRect(39,39,7,4); ctx.fillStyle = '#503c6e'; ctx.fillRect(27,28,9,8);
      } else {
        polygon(ctx, [[28,3],[37,3],[43,16],[56,13],[61,24],[50,33],[60,44],[55,55],[41,52],[36,62],[25,60],[21,49],[8,53],[3,40],[14,32],[5,21],[12,10],[24,16]], '#5d492c', ink);
        polygon(ctx, [[28,17],[38,17],[47,29],[44,42],[32,48],[19,40],[17,28]], '#c29550');
        polygon(ctx, [[27,23],[36,22],[41,31],[35,40],[26,39],[22,31]], '#f4d399');
        ctx.fillStyle = '#fff1c6'; ctx.fillRect(25,25,5,5); ctx.fillStyle = '#ac7c3c'; ctx.fillRect(33,32,5,5);
      }
      if (pulse) { ctx.fillStyle = '#edf8ff99'; ctx.fillRect(17,15,3,3); }
      if (options.animation === 'bind') ring(ctx,32,32,28,'#eff8ff',3,18,t*2);
    },
    antibody: function (ctx, t, options, entry) {
      const ink = color(options.color || entry.color);
      glow(ctx,ink,9,function () {
        ctx.fillStyle = ink; ctx.fillRect(16,6,8,8);ctx.fillRect(40,6,8,8);ctx.fillRect(22,14,8,8);ctx.fillRect(34,14,8,8);ctx.fillRect(28,22,8,32);
      });
      ctx.fillStyle = '#f0f9ff';ctx.fillRect(28,26,3,13);
    },
    'enemy-shot': function (ctx, t, options) {
      const ink = options.color ? color(options.color) : '#eaa79a';
      glow(ctx,ink,9,function () { polygon(ctx,[[32,11],[43,31],[32,52],[21,31]],ink); });
      ctx.fillStyle = '#fff0dc';ctx.fillRect(29,26,6,12);
    },
    opsonin: function (ctx, t) {
      glow(ctx,'#d9f1ff',8,function () { polygon(ctx,[[23,12],[41,12],[51,22],[51,40],[41,51],[23,51],[13,41],[13,22]],'#90acbd'); });
      polygon(ctx,[[24,16],[40,16],[47,24],[47,39],[39,47],[25,47],[17,39],[17,25]],'#d2e4ec');
      ctx.fillStyle = '#f5fbff'; ctx.fillRect(24,20,16,20);ctx.fillRect(20,26,24,10); ctx.fillStyle = '#b4cedd';ctx.fillRect(34,36,7,5);
      if (Math.floor(t * 5) % 3 === 0) { ctx.fillStyle = '#eef7ff';ctx.fillRect(7,14,3,3);ctx.fillRect(53,47,3,3); }
    },
    ivig: function (ctx, t) {
      const rainbow=ctx.createLinearGradient(13,10,49,52);
      rainbow.addColorStop(0,'#8df2b1');rainbow.addColorStop(.3,'#66c7ff');
      rainbow.addColorStop(.62,'#cc90ff');rainbow.addColorStop(1,'#ffe18d');
      const halo=ctx.createRadialGradient(32,31,7,32,31,29);
      halo.addColorStop(0,'#f0f5ff65');halo.addColorStop(.55,'#bfa8ff25');halo.addColorStop(1,'#a8cfff00');
      ctx.fillStyle=halo;ctx.fillRect(1,1,62,62);
      glow(ctx,'#bce0ff',10,function () {
        polygon(ctx,[[13,8],[22,8],[32,23],[42,8],[51,8],[51,17],[37,35],[37,55],[27,55],[27,35],[13,17]],rainbow,'#f0f8ff');
      });
      ctx.fillStyle='#f5fbff';ctx.fillRect(29,35,2,14);
      const flicker=Math.floor(t*7)%4;
      [[8,26],[53,35],[18,53],[43,3]].forEach(function (point,i) {
        ctx.fillStyle=['#8df2b1','#66c7ff','#cc90ff','#ffe18d'][i];
        ctx.globalAlpha=i===flicker?1:.35;ctx.fillRect(point[0],point[1],3,3);
      });
    },
    macrophage: function (ctx, t, options) {
      // A soft, continuous membrane makes the emerging cell feel organic even
      // while the rest of the arcade artwork keeps its square-particle style.
      const points = [], count = 48, phase = t * .85;
      for (let i = 0; i < count; i++) {
        const a = i / count * Math.PI * 2;
        const radius = 27.7 + Math.sin(a * 5 + phase) * .85 + Math.cos(a * 3 - phase * .6) * .5;
        points.push([32 + Math.cos(a) * radius,32 + Math.sin(a) * radius]);
      }
      const first = points[0], last = points[count - 1];
      ctx.beginPath();ctx.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);
      points.forEach(function (point, i) {
        const next = points[(i + 1) % count];
        ctx.quadraticCurveTo(point[0],point[1],(point[0]+next[0])/2,(point[1]+next[1])/2);
      });
      ctx.closePath();
      const cytoplasm = ctx.createRadialGradient(23,20,3,34,35,31);
      cytoplasm.addColorStop(0,'#ffffff');cytoplasm.addColorStop(.5,'#f0f8fc');
      cytoplasm.addColorStop(.86,'#dbeaf1');cytoplasm.addColorStop(1,'#8cb2c8');
      ctx.shadowColor='#d1efff';ctx.shadowBlur=2.8;ctx.fillStyle=cytoplasm;ctx.fill();
      ctx.shadowBlur=0;ctx.strokeStyle='#f6fcff';ctx.lineWidth=.65;ctx.stroke();

      // Pale, rounded nucleus and granules stay visible through the membrane.
      const nucleus = ctx.createRadialGradient(28,27,2,35,34,18);
      nucleus.addColorStop(0,'#b5c9dc');nucleus.addColorStop(.7,'#8eabc3');nucleus.addColorStop(1,'#bad1e1');
      ctx.beginPath();ctx.moveTo(20,25);
      ctx.bezierCurveTo(20,15,33,13,41,21);ctx.bezierCurveTo(48,28,45,41,35,45);
      ctx.bezierCurveTo(24,48,17,41,20,34);ctx.bezierCurveTo(22,30,24,31,25,28);
      ctx.bezierCurveTo(26,24,22,27,20,25);ctx.closePath();
      ctx.fillStyle=nucleus;ctx.fill();ctx.strokeStyle='#dcecf5';ctx.lineWidth=.8;ctx.stroke();
      ctx.fillStyle='#ffffff';ctx.globalAlpha*=.4;
      [[16,20,1.2],[47,25,1],[16,40,1.5],[42,47,1.25],[34,11,1]].forEach(function (granule) {
        ctx.beginPath();ctx.arc(granule[0],granule[1],granule[2],0,Math.PI*2);ctx.fill();
      });
      ctx.strokeStyle='#ffffff';ctx.lineWidth=1.25;ctx.lineCap='round';
      ctx.beginPath();ctx.arc(32,32,24,3.65,4.65);ctx.stroke();
    },
    boss: function (ctx, t, options) {
      const ink = color(options.color || 'green'), phase = options.phase || 1;
      const points = [];
      for (let i = 0; i < 48; i++) {const a = i/48*Math.PI*2; const r=25 + Math.sin(a*8+t*.9)*2;points.push([32+Math.cos(a)*r,32+Math.sin(a)*r]);}
      polygon(ctx,points,'#263449','#7790a5');
      for (let i=0;i<10;i++) {
        const a=i/10*Math.PI*2+t*.13;const x=32+Math.cos(a)*24,y=32+Math.sin(a)*24;
        ctx.save();ctx.translate(x,y);ctx.rotate(a);polygon(ctx,[[-3,-3],[3,-3],[6,1],[5,5],[1,7],[-4,4]],i%3===0?ink:'#557b8d','#94a9b4');ctx.restore();
      }
      ring(ctx,32,32,20,'#436277',2,30,-t*.24);
      ring(ctx,32,32,15,ink,2,15,t*.2);
      for(let i=0;i<6;i++){const a=i/6*Math.PI*2-t*.18;ctx.fillStyle='#536378';ctx.fillRect(30+Math.cos(a)*17,30+Math.sin(a)*17,4,4);}
      glow(ctx,ink,10+phase*2,function(){polygon(ctx,[[28,23],[36,23],[42,29],[42,36],[36,42],[28,42],[22,36],[22,29]],'#243c4d',ink);});
      polygon(ctx,[[29,26],[35,26],[39,30],[39,35],[35,39],[29,39],[25,35],[25,30]],ink);
      ctx.fillStyle='#e9f5fe';ctx.fillRect(29,28,3,4);ctx.fillStyle='#142b43';ctx.fillRect(32,32,4,4);
    }
  };

  LG.Assets = {
    images: {}, listeners: new Set(),
    subscribe: function (callback) {this.listeners.add(callback);return () => this.listeners.delete(callback);},
    load: function () {
      const assets = this;
      return Promise.all(Object.keys(LG.AssetManifest).map(function(key) {
        const entry=LG.AssetManifest[key];
        if (!entry.src || typeof Image === 'undefined') {assets.images[key]=null;return Promise.resolve(false);}
        return new Promise(function(resolve) {
          const img=new Image();
          img.onload=function(){assets.images[key]=img;assets.listeners.forEach(fn => fn(key,true));resolve(true);};
          img.onerror=function(){assets.images[key]=null;assets.listeners.forEach(fn => fn(key,false));resolve(false);};
          img.src=entry.src;
        });
      }));
    },
    draw: function (ctx,key,x,y,width,height,time,options) {
      options=options||{}; const entry=LG.AssetManifest[key]||LG.AssetManifest.opsonin;
      const animation=options.animation||'idle', frames=(entry.animations&&(entry.animations[animation]||entry.animations.idle))||[0];
      const frame=frames[Math.floor((time||0)*(entry.fps||6))%frames.length];
      const img=this.images[key];let source='fallback';
      ctx.save();ctx.imageSmoothingEnabled=false;
      if(options.alpha!=null)ctx.globalAlpha*=options.alpha;
      ctx.translate(x+width/2,y+height/2);
      if(options.rotation)ctx.rotate(options.rotation);
      if(img&&img.width>=entry.frameWidth&&img.height>=entry.frameHeight){
        const columns=Math.floor(img.width/entry.frameWidth),total=columns*Math.floor(img.height/entry.frameHeight);
        const safe=Number.isInteger(frame)&&frame>=0&&frame<total?frame:0;
        const scale=Math.min(width/entry.frameWidth,height/entry.frameHeight);
        const dw=entry.frameWidth*scale,dh=entry.frameHeight*scale;
        ctx.drawImage(img,(safe%columns)*entry.frameWidth,Math.floor(safe/columns)*entry.frameHeight,entry.frameWidth,entry.frameHeight,-dw/2,-dh/2,dw,dh);
        source='image';
      }else{
        ctx.translate(-width/2,-height/2);ctx.scale(width/64,height/64);
        (fallback[entry.fallback]||fallback.opsonin)(ctx,time||0,options,entry);
      }
      ctx.restore();return source;
    },
    color: color
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
