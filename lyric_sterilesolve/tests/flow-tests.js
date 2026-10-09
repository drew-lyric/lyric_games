'use strict';
const assert = require('node:assert/strict');
require('../js/config.js');
require('../js/flow.js');
const G = globalThis.LyricSterileSolver;
function component(id, type, extra) {
  extra = extra || {};
  return Object.assign({ id, type, inIncubator: true,
    ports: type === 'reactor' ? G.makePorts(extra.inputs || 1, extra.outputs || 1) : G.ComponentCatalog[type].ports }, extra);
}
function network(components, connections) {
  return { components, tubes: connections.map((ends, i) => ({ id: 't' + i,
    from: { componentId: ends[0], portId: ends[1] },
    to: ends[2] ? { componentId: ends[2], portId: ends[3] } : null })) };
}
const close = (value, expected) => assert(Math.abs(value - expected) < 1e-4, value + ' != ' + expected);
function runFlowTests() {
  const results = [];
  function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (error) { results.push({ name, ok: false, error: error.stack }); } }
  test('upstream default stays 5/5 despite downstream 1/4 split', () => {
    const state = network([component('s','flask'),component('p','pump',{rate:10}),component('a','reactor',{outputs:2}),component('b','reactor',{outputs:2}),component('p1','pump',{rate:1}),component('w1','flask'),component('w2','flask'),component('w3','flask')],
      [['s','out','p','in'],['p','out','a','in1'],['a','out1','w1','in'],['a','out2','b','in1'],['b','out1','p1','in'],['p1','out','w2','in'],['b','out2','w3','in']]);
    const flow = G.solveFlow(state); assert(flow.feasible); close(flow.rates.t2,5);close(flow.rates.t3,5);close(flow.rates.t4,1);close(flow.rates.t6,4);
  });
  test('upstream 5/5 default precedes a residual fresh draw of 1', () => {
    const state = network([component('s','flask'),component('p','pump',{rate:10}),component('a','reactor',{outputs:2}),component('b','reactor',{inputs:2}),component('p6','pump',{rate:6}),component('fresh','flask'),component('w1','flask'),component('w2','flask')],
      [['s','out','p','in'],['p','out','a','in1'],['a','out1','w1','in'],['a','out2','b','in1'],['fresh','out','b','in2'],['b','out1','p6','in'],['p6','out','w2','in']]);
    const flow = G.solveFlow(state); assert(flow.feasible); close(flow.rates.t2,5);close(flow.rates.t3,5);close(flow.rates.t4,1);close(flow.rates.t5,6);
  });
  test('downstream pumps force reactor outlets to 6 and 4', () => {
    const state = network([component('s','flask'),component('p','pump',{rate:10}),component('a','reactor',{outputs:2}),component('p6','pump',{rate:6}),component('p4','pump',{rate:4}),component('w1','flask'),component('w2','flask')],
      [['s','out','p','in'],['p','out','a','in1'],['a','out1','p6','in'],['a','out2','p4','in'],['p6','out','w1','in'],['p4','out','w2','in']]);
    const flow = G.solveFlow(state); assert(flow.feasible);close(flow.rates.t2,6);close(flow.rates.t3,4);
  });
  test('passive source inlets share a downstream demand equally', () => {
    const state = network([component('s1','flask'),component('s2','flask'),component('r','reactor',{inputs:2}),component('p','pump',{rate:10}),component('w','flask')],
      [['s1','out','r','in1'],['s2','out','r','in2'],['r','out1','p','in'],['p','out','w','in']]);
    const flow = G.solveFlow(state); assert(flow.feasible);close(flow.rates.t0,5);close(flow.rates.t1,5);
  });
  test('two passive sources divide the residual demand rather than total flow', () => {
    const state = network([component('s1','flask'),component('s2','flask'),component('s3','flask'),component('p5','pump',{rate:5}),component('r','reactor',{inputs:3}),component('p6','pump',{rate:6}),component('w','flask')],
      [['s1','out','p5','in'],['p5','out','r','in1'],['s2','out','r','in2'],['s3','out','r','in3'],['r','out1','p6','in'],['p6','out','w','in']]);
    const flow = G.solveFlow(state);assert(flow.feasible);close(flow.rates.t1,5);close(flow.rates.t2,.5);close(flow.rates.t3,.5);
  });
  test('rate conflicts in series produce zero flow and pump diagnostics', () => {
    const state = network([component('s','flask'),component('p5','pump',{rate:5}),component('p4','pump',{rate:4}),component('w','flask')],
      [['s','out','p5','in'],['p5','out','p4','in'],['p4','out','w','in']]);
    const flow = G.solveFlow(state);assert(!flow.feasible);assert.equal(flow.faults.length,2);assert(flow.faults.every(f=>f.code==='rate-conflict'));assert(Object.values(flow.rates).every(q=>q===0));
  });
  test('a blocked circuit leaves an independent pump circuit running', () => {
    const state = network([component('s1','flask'),component('p1','pump',{rate:5}),component('s2','flask'),component('p2','pump',{rate:4}),component('w','flask')],
      [['s1','out','p1','in'],['s2','out','p2','in'],['p2','out','w','in']]);
    const flow = G.solveFlow(state);assert(!flow.feasible);close(flow.rates.t0,0);close(flow.rates.t1,4);close(flow.rates.t2,4);assert(flow.faults.every(f=>f.componentId==='p1'));
  });
  test('an open tube spills as an open sink; a clamp preserves zero flow', () => {
    const state = network([component('s','flask'),component('p','pump',{rate:5})], [['s','out','p','in'],['p','out']]);
    const flow = G.solveFlow(state);assert(flow.feasible);close(flow.rates.t1,5);
    state.tubes[1].clamped = true;const blocked=G.solveFlow(state);assert(!blocked.feasible);close(blocked.rates.t1,0);
  });
  test('a pump-free passive network carries zero flow', () => {
    const state = network([component('s','flask'),component('r','reactor'),component('w','flask')], [['s','out','r','in1'],['r','out1','w','in']]);
    const flow=G.solveFlow(state);assert(flow.feasible);assert(Object.values(flow.rates).every(q=>q===0));
  });
  test('flasks break recirculation cycles; bufferless cycles are diagnosed', () => {
    const bad=network([component('p','pump',{rate:5}),component('r','reactor')],[['p','out','r','in1'],['r','out1','p','in']]);
    assert(G.hasBufferlessCycle(bad));assert(!G.solveFlow(bad).feasible);
    const good=network([component('f','flask'),component('p','pump',{rate:5}),component('r','reactor')],[['f','out','p','in'],['p','out','r','in1'],['r','out1','f','in']]);
    assert(!G.hasBufferlessCycle(good));const flow=G.solveFlow(good);assert(flow.feasible);Object.values(flow.rates).forEach(q=>close(q,5));
  });
  test('selector routing carries flow only through its selected outlet', () => {
    const state=network([component('s','flask'),component('p','pump',{rate:5}),component('v','selector',{selectedOutlet:'out1'}),component('w1','flask'),component('w2','flask')],
      [['s','out','p','in'],['p','out','v','in'],['v','out1','w1','in'],['v','out2','w2','in']]);
    let flow=G.solveFlow(state);close(flow.rates.t2,5);close(flow.rates.t3,0);
    state.components.find(c=>c.id==='v').selectedOutlet='out2';flow=G.solveFlow(state);close(flow.rates.t2,0);close(flow.rates.t3,5);
  });
  test('reconverging branches preserve conservation and fixed downstream draws', () => {
    const state=network([component('s','flask'),component('p','pump',{rate:10}),component('a','reactor',{outputs:2}),component('b','reactor',{outputs:2}),component('c','reactor',{outputs:2}),component('d','reactor',{inputs:2}),component('e','reactor',{inputs:2}),component('p4','pump',{rate:4}),component('p6','pump',{rate:6}),component('w1','flask'),component('w2','flask')],
      [['s','out','p','in'],['p','out','a','in1'],['a','out1','b','in1'],['a','out2','c','in1'],['b','out1','d','in1'],['b','out2','e','in1'],['c','out1','d','in2'],['c','out2','e','in2'],['d','out1','p4','in'],['e','out1','p6','in'],['p4','out','w1','in'],['p6','out','w2','in']]);
    const flow=G.solveFlow(state);assert(flow.feasible);close(flow.rates.t2,5);close(flow.rates.t3,5);close(flow.rates.t8,4);close(flow.rates.t9,6);
    state.components.filter(c=>c.type!=='flask').forEach(c=>close(flow.componentRates[c.id].inRate,flow.componentRates[c.id].outRate));
  });
  return results;
}
module.exports={runFlowTests};
if(require.main===module){const results=runFlowTests();results.forEach(r=>console.log((r.ok?'PASS ':'FAIL ')+r.name+(r.error?'\n'+r.error:'')));console.log(results.filter(r=>r.ok).length+'/'+results.length+' flow checks passed.');process.exitCode=results.every(r=>r.ok)?0:1;}
