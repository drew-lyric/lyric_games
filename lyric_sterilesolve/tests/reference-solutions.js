(function (root) {
  'use strict';
  var LSS = root.LyricSterileSolver;
  var fixtures = {
    1: { positions: { f1: [100,320], p1: [300,320], f2: [850,320] }, fills: [['f1','blue',200]], links: [['f1','out','p1','in'],['p1','out','r1','in1'],['r1','out1','f2','in']], duration:40, consumed:200 },
    2: { positions: { f1:[100,190],f2:[100,450],p1:[310,210],p2:[310,430],f3:[850,320] }, fills:[['f1','blue',50],['f2','red',50]], links:[['f1','out','p1','in'],['p1','out','r1','in1'],['f2','out','p2','in'],['p2','out','r1','in3'],['r1','out1','f3','in']], duration:10, consumed:100 },
    3: { positions:{f1:[90,315],p1:[220,315],p2:[565,175],p3:[565,465],f2:[880,175],f3:[880,465]},fills:[['f1','blue',120]],links:[['f1','out','p1','in'],['p1','out','r1','in1'],['r1','out1','p2','in'],['p2','out','r2','in1'],['r2','out1','f2','in'],['r1','out2','p3','in'],['p3','out','r3','in1'],['r3','out1','f3','in']],duration:20,consumed:120 },
    4: { positions:{f1:[90,315],p1:[255,315],v1:[670,315],f2:[860,180],f3:[860,460]},fills:[['f1','blue',100]],links:[['f1','out','p1','in'],['p1','out','r1','in1'],['r1','out1','v1','in'],['v1','out1','f2','in'],['v1','out2','f3','in']],actions:[{at:10,command:{type:'setSelector',id:'v1',outlet:'out2'}}],duration:20,consumed:100 },
    5: { positions:{f1:[65,100],f2:[65,530],s1:[190,100],s2:[190,530],p1:[310,205],p2:[310,430],p3:[485,65],p4:[485,565],f3:[885,165],f4:[885,470]},fills:[['f1','red',200],['f2','blue',200]],links:[['f1','out','s1','in'],['s1','out1','p1','in'],['p1','out','r1','in1'],['s1','out2','p4','in'],['p4','out','r3','in2'],['f2','out','s2','in'],['s2','out1','p2','in'],['p2','out','r1','in2'],['s2','out2','p3','in'],['p3','out','r2','in2'],['r1','out1','r2','in1'],['r1','out2','r3','in1'],['r2','out1','f3','in'],['r3','out1','f4','in']],duration:20,consumed:400 }
  };
  function command(sim, value) {var result=sim.submit(value);if(!result.ok)throw new Error(value.type+': '+result.error);return result;}
  function build(sim,id) {
    var fixture=fixtures[id];fixture.fills.forEach(function(f){command(sim,{type:'fill',id:f[0],media:f[1],amount:f[2]});});
    Object.keys(fixture.positions).forEach(function(id){command(sim,{type:'sterilize',id:id});command(sim,{type:'place',id:id,x:fixture.positions[id][0],y:fixture.positions[id][1]});});
    command(sim,{type:'prepareTube',count:fixture.links.length});fixture.links.forEach(function(l){command(sim,{type:'connect',from:{componentId:l[0],portId:l[1]},to:{componentId:l[2],portId:l[3]}});});return fixture;
  }
  function run(sim,id) {
    var fixture=fixtures[id],actions=(fixture.actions||[]).slice();command(sim,{type:'go'});
    for(var i=0;i<Math.ceil((fixture.duration+1)*30)&&sim.getState().phase==='running';i++){var elapsed=sim.getState().elapsed;while(actions.length&&elapsed+1e-7>=actions[0].at)command(sim,actions.shift().command);sim.step(1/30);}return sim.getState();
  }
  function buildPhysical(sim,id) {
    var fixture=fixtures[id], ids=Object.keys(fixture.positions), tubes=[];
    ids.forEach(function(id,i){command(sim,{type:'stage',id:id,x:50+i*90,y:720});});
    fixture.fills.forEach(function(f){command(sim,{type:'fill',id:f[0],media:f[1],amount:f[2]});});
    fixture.links.forEach(function(link,i){tubes.push(command(sim,{type:'createTube',x:80+i*56,y:770}).id);});
    command(sim,{type:'sprayStaging'});
    ids.forEach(function(id){command(sim,{type:'place',id:id,x:fixture.positions[id][0],y:fixture.positions[id][1]});});
    fixture.links.forEach(function(link,i){
      command(sim,{type:'connectOneEnd',tubeId:tubes[i],endpoint:'a',to:{componentId:link[2],portId:link[3]}});
      command(sim,{type:'connectOneEnd',tubeId:tubes[i],endpoint:'b',to:{componentId:link[0],portId:link[1]}});
    });return fixture;
  }
  LSS.ReferenceSolutions={fixtures:fixtures,build:build,buildPhysical:buildPhysical,run:run};
})(typeof globalThis!=='undefined'?globalThis:this);
