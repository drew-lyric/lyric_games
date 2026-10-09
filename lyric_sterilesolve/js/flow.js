(function (root) {
  'use strict';
  const LSS = root.LyricSterileSolver = root.LyricSterileSolver || {};
  const EPS = 1e-8, FIXED = 2e-6;
  const cache = new WeakMap();
  const kind = c => {
    const handler = (LSS.ComponentCatalog && LSS.ComponentCatalog[c.type] || {}).handler || c.type;
    return (LSS.ComponentBehaviors && LSS.ComponentBehaviors[handler] || {}).category || handler;
  };
  const active = state => state.components.filter(c => c.inIncubator || kind(c) === 'reactor');
  function selected(c) {
    const outs = c.ports.filter(p => p.direction === 'out');
    const value = c.selectedOutlet != null ? c.selectedOutlet : c.outlet != null ? c.outlet : 'out1';
    return typeof value === 'number' ? (outs[value] || outs[0] || {}).id : value;
  }
  function topology(state, tubes) {
    const components = active(state), byId = Object.fromEntries(components.map(c => [c.id, c]));
    const nodes = components.filter(c => kind(c) !== 'flask');
    const children = Object.fromEntries(nodes.map(c => [c.id, []]));
    (tubes || state.tubes || []).forEach(t => {
      if (t.clamped || !t.to || !byId[t.from.componentId] || !byId[t.to.componentId]) return;
      const from = byId[t.from.componentId];
      if (kind(from) === 'selector' && t.from.portId !== selected(from)) return;
      if (children[from.id] && children[t.to.componentId]) children[from.id].push(t.to.componentId);
    });
    const incoming = Object.fromEntries(nodes.map(c => [c.id, 0]));
    Object.values(children).forEach(list => list.forEach(id => incoming[id]++));
    const queue = nodes.filter(c => !incoming[c.id]).map(c => c.id).sort(), order = [];
    while (queue.length) {
      const id = queue.shift(); order.push(id);
      children[id].forEach(next => { if (--incoming[next] === 0) { queue.push(next); queue.sort(); } });
    }
    return { components, byId, order, cycle: nodes.filter(c => incoming[c.id] > 0).map(c => c.id) };
  }
  LSS.hasBufferlessCycle = function (state, tubes) { return topology(state, tubes).cycle.length > 0; };

  // Feasible circulation with lower bounds. The allocation found by Dinic is
  // only an oracle: displayed allocations are fixed by local sharing below.
  function circulation(count, edges, bounds) {
    const graph = Array.from({ length: count + 2 }, () => []), balance = Array(count).fill(0), refs = [];
    function add(from, to, capacity) {
      const forward = { to, rev: graph[to].length, cap: capacity };
      const reverse = { to: from, rev: graph[from].length, cap: 0 };
      graph[from].push(forward); graph[to].push(reverse); return forward;
    }
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i], override = bounds && bounds.get(i);
      const lo = Math.max(edge.lo, override ? override.lo : edge.lo);
      const hi = Math.min(edge.hi, override ? override.hi : edge.hi);
      if (lo > hi + EPS) return null;
      const capacity = Math.max(0, hi - lo), ref = add(edge.from, edge.to, capacity);
      refs.push({ ref, capacity, lo }); balance[edge.from] -= lo; balance[edge.to] += lo;
    }
    const source = count, sink = count + 1;
    let required = 0;
    balance.forEach((value, node) => {
      if (value > EPS) { add(source, node, value); required += value; }
      else if (value < -EPS) add(node, sink, -value);
    });
    let delivered = 0;
    const level = [], position = [];
    function visit(node, amount) {
      if (node === sink) return amount;
      for (; position[node] < graph[node].length; position[node]++) {
        const edge = graph[node][position[node]];
        if (edge.cap <= EPS || level[edge.to] !== level[node] + 1) continue;
        const sent = visit(edge.to, Math.min(amount, edge.cap));
        if (sent > EPS) { edge.cap -= sent; graph[edge.to][edge.rev].cap += sent; return sent; }
      }
      return 0;
    }
    for (;;) {
      level.fill(-1); for (let i = 0; i < count + 2; i++) level[i] = -1;
      level[source] = 0; const queue = [source];
      for (let q = 0; q < queue.length; q++) graph[queue[q]].forEach(edge => {
        if (edge.cap > EPS && level[edge.to] < 0) { level[edge.to] = level[queue[q]] + 1; queue.push(edge.to); }
      });
      if (level[sink] < 0) break;
      for (let i = 0; i < count + 2; i++) position[i] = 0;
      let sent;
      while ((sent = visit(source, Number.MAX_VALUE)) > EPS) delivered += sent;
    }
    if (delivered + EPS * Math.max(2, count) < required) return null;
    return refs.map(item => item.lo + item.capacity - item.ref.cap);
  }

  function build(state, topo) {
    const edges = [], nodeKeys = [], indices = {}, internal = {}, ins = {}, outs = {}, tubeEdges = {};
    const maxRate = Math.max(1, topo.components.reduce((sum, c) => sum + (kind(c) === 'pump' ? Number(c.rate) || 0 : 0), 0));
    function node(key) { if (indices[key] == null) { indices[key] = nodeKeys.length; nodeKeys.push(key); } return indices[key]; }
    const source = node('$source'), sink = node('$sink');
    function edge(from, to, lo, hi, extra) { const index = edges.length; edges.push(Object.assign({ from, to, lo, hi }, extra)); return index; }
    topo.components.forEach(c => {
      const a = node(c.id + ':in'), b = node(c.id + ':out'); ins[c.id] = []; outs[c.id] = [];
      if (kind(c) === 'flask') {
        edge(source, b, 0, maxRate, { boundary: true }); edge(a, sink, 0, maxRate, { boundary: true });
      } else {
        const rate = kind(c) === 'pump' ? Number(c.rate) : null;
        internal[c.id] = edge(a, b, rate == null ? 0 : rate, rate == null ? maxRate : rate, { componentId: c.id });
      }
    });
    (state.tubes || []).forEach(t => {
      const from = topo.byId[t.from.componentId], to = t.to && topo.byId[t.to.componentId];
      if (!from || (t.to && !to)) return;
      const isClosed = t.clamped || (kind(from) === 'selector' && t.from.portId !== selected(from));
      const index = edge(node(from.id + ':out'), to ? node(to.id + ':in') : sink, 0, isClosed ? 0 : maxRate, { tubeId: t.id });
      tubeEdges[t.id] = index; outs[from.id].push(index); if (to) ins[to.id].push(index);
    });
    edge(sink, source, 0, maxRate * Math.max(2, topo.components.length), { boundary: true });
    return { edges, nodeKeys, internal, ins, outs, tubeEdges, count: nodeKeys.length, source, sink };
  }

  function choose(model, order) {
    const bounds = new Map(), edges = model.edges;
    const oracle = trial => circulation(model.count, edges, trial || bounds);
    if (!oracle()) return null;
    const setExact = (index, value) => bounds.set(index, { lo: Math.max(0, value), hi: Math.max(0, value) });
    function interval(index) {
      const edge = edges[index], saved = bounds.get(index), a = Math.max(edge.lo, saved ? saved.lo : edge.lo), b = Math.min(edge.hi, saved ? saved.hi : edge.hi);
      if (b - a < FIXED) return [a, b];
      let low = a, high = b;
      for (let i = 0; i < 35 && high - low > EPS; i++) {
        const mid = (low + high) / 2, trial = new Map(bounds);
        trial.set(index, { lo: a, hi: mid }); if (oracle(trial)) high = mid; else low = mid;
      }
      const minimum = high; low = a; high = b;
      for (let i = 0; i < 35 && high - low > EPS; i++) {
        const mid = (low + high) / 2, trial = new Map(bounds);
        trial.set(index, { lo: mid, hi: b }); if (oracle(trial)) low = mid; else high = mid;
      }
      return [minimum, low];
    }
    function share(list, total) {
      if (!list.length) return;
      const snapshot = new Map(bounds);
      let remaining = total, free = [];
      list.forEach(index => {
        const range = interval(index);
        if (range[1] - range[0] < FIXED) { const value = (range[0] + range[1]) / 2; setExact(index, value); remaining -= value; }
        else free.push(index);
      });
      remaining = Math.max(0, remaining);
      // Most networks need only this equal-share check.
      let equal = new Map(bounds);
      free.forEach(index => equal.set(index, { lo: remaining / free.length, hi: remaining / free.length }));
      if (oracle(equal)) { free.forEach(index => setExact(index, remaining / free.length)); return; }
      // Progressive filling respects coupled reconverging-branch constraints.
      while (free.length) {
        if (free.length === 1) { setExact(free[0], remaining); break; }
        let low = 0, high = remaining / free.length;
        for (let iteration = 0; iteration < 35 && high - low > EPS; iteration++) {
          const value = (low + high) / 2, trial = new Map(bounds);
          free.forEach(index => trial.set(index, { lo: Math.max(edges[index].lo, value), hi: edges[index].hi }));
          if (oracle(trial)) low = value; else high = value;
        }
        const floor = low, base = new Map(bounds);
        free.forEach(index => base.set(index, { lo: Math.max(edges[index].lo, floor), hi: edges[index].hi }));
        let frozen = free.filter(index => {
          const trial = new Map(base); trial.set(index, { lo: Math.max(edges[index].lo, floor + FIXED * 3), hi: edges[index].hi });
          return !oracle(trial);
        });
        if (!frozen.length) { // Numeric tie: choose a bottleneck from a feasible solution.
          const candidate = oracle(base); if (!candidate) break;
          const minimum = Math.min.apply(null, free.map(index => candidate[index]));
          frozen = free.filter(index => candidate[index] <= minimum + FIXED);
        }
        frozen.forEach(index => { setExact(index, floor); remaining = Math.max(0, remaining - floor); });
        free = free.filter(index => !frozen.includes(index));
      }
      if (!oracle()) { bounds.clear(); snapshot.forEach((value, index) => bounds.set(index, value)); }
    }
    // Upstream defaults are committed before passive inputs are selected.
    order.forEach(id => {
      const index = model.internal[id]; if (index == null) return;
      const range = interval(index);
      const total = range[1] - range[0] < FIXED ? (range[0] + range[1]) / 2 : range[0];
      const trial = new Map(bounds); trial.set(index, { lo: total, hi: total });
      if (!oracle(trial)) return;
      setExact(index, total); share(model.outs[id], total);
    });
    order.slice().reverse().forEach(id => {
      const index = model.internal[id]; if (index == null) return;
      const value = bounds.get(index); if (value && value.hi - value.lo < FIXED) share(model.ins[id], value.lo);
    });
    // Free paths with no imposed draw stay at zero; never invent gravity flow.
    Object.keys(model.tubeEdges).sort().forEach(id => {
      const index = model.tubeEdges[id]; if (bounds.has(index)) return;
      const range = interval(index), value = Math.max(0, range[0]);
      const trial = new Map(bounds); trial.set(index, { lo: value, hi: value });
      if (oracle(trial)) setExact(index, value);
    });
    return oracle();
  }

  function result(state, topo, model, flows, faults) {
    const rates = Object.fromEntries((state.tubes || []).map(t => [t.id, 0])), componentRates = {};
    topo.components.forEach(c => { componentRates[c.id] = { inRate: 0, outRate: 0, inlets: {}, outlets: {} }; });
    Object.keys(model.tubeEdges).forEach(id => {
      const value = flows ? flows[model.tubeEdges[id]] : 0;
      const near = Math.round(value * 1e6) / 1e6; rates[id] = Math.abs(value - near) < FIXED ? near : value;
    });
    (state.tubes || []).forEach(t => {
      const rate = rates[t.id] || 0, a = componentRates[t.from.componentId], b = t.to && componentRates[t.to.componentId];
      if (a) { a.outRate += rate; a.outlets[t.from.portId] = rate; }
      if (b) { b.inRate += rate; b.inlets[t.to.portId] = rate; }
    });
    return { rates, componentRates, order: topo.order, faults: faults || [], feasible: !(faults && faults.length) };
  }
  function regions(model) {
    const neighbours = Array.from({ length: model.count }, () => []);
    model.edges.forEach(edge => {
      if (edge.boundary || edge.hi === 0 || edge.from === model.sink || edge.to === model.sink) return;
      neighbours[edge.from].push(edge.to); neighbours[edge.to].push(edge.from);
    });
    const seen = new Set([model.source, model.sink]), groups = [];
    for (let start = 0; start < model.count; start++) {
      if (seen.has(start)) continue;
      const group = new Set([start]), queue = [start]; seen.add(start);
      for (let i = 0; i < queue.length; i++) neighbours[queue[i]].forEach(next => {
        if (!seen.has(next)) { seen.add(next); group.add(next); queue.push(next); }
      });
      groups.push(group);
    }
    return groups;
  }
  LSS.solveFlow = function (state) {
    const signature = JSON.stringify([active(state).map(c => [c.id, c.type, c.rate, selected(c), c.ports]), (state.tubes || []).map(t => [t.id, t.from, t.to, !!t.clamped])]);
    const previous = cache.get(state); if (previous && previous.signature === signature) return previous.value;
    const topo = topology(state), model = build(state, topo);
    let value;
    if (topo.cycle.length) {
      value = result(state, topo, model, null, topo.cycle.map(id => ({ componentId: id, code: 'bufferless-cycle', message: 'Add a flask to this circulation loop.' })));
    } else {
      let flows = choose(model, topo.order);
      if (flows) value = result(state, topo, model, flows, []);
      else {
        // A blocked branch must not stop independent circuits. Flask boundaries
        // separate circuits even when they share the same physical vessel.
        flows = Array(model.edges.length).fill(0); const faults = [];
        regions(model).forEach(group => {
          const indices = model.edges.map((edge, i) => ({ edge, i })).filter(item => group.has(item.edge.from) || group.has(item.edge.to));
          const subset = { edges: [], count: model.count, internal: {}, ins: {}, outs: {}, tubeEdges: {} }, mapping = new Map();
          indices.forEach(item => { mapping.set(item.i, subset.edges.length); subset.edges.push(item.edge); });
          subset.edges.push(model.edges[model.edges.length - 1]);
          Object.keys(model.internal).forEach(id => { if (mapping.has(model.internal[id])) subset.internal[id] = mapping.get(model.internal[id]); });
          Object.keys(model.ins).forEach(id => {
            subset.ins[id] = model.ins[id].filter(i => mapping.has(i)).map(i => mapping.get(i));
            subset.outs[id] = model.outs[id].filter(i => mapping.has(i)).map(i => mapping.get(i));
          });
          Object.keys(model.tubeEdges).forEach(id => { if (mapping.has(model.tubeEdges[id])) subset.tubeEdges[id] = mapping.get(model.tubeEdges[id]); });
          const chosen = choose(subset, topo.order.filter(id => subset.internal[id] != null));
          if (chosen) indices.forEach(item => { flows[item.i] = chosen[mapping.get(item.i)]; });
          else {
            const pumps = topo.components.filter(c => kind(c) === 'pump' && subset.internal[c.id] != null);
            pumps.forEach(c => {
              const input = c.ports.find(p => p.direction === 'in'), output = c.ports.find(p => p.direction === 'out');
              const noInput = !model.ins[c.id].length, noOutput = !model.outs[c.id].length;
              faults.push({ componentId: c.id, code: pumps.length > 1 ? 'rate-conflict' : 'blocked-pump', portId: (noInput ? input : output || input || {}).id,
                message: pumps.length > 1 ? 'Incompatible pump rates or a blocked route.' : noInput ? 'Pump has no open supply path.' : noOutput ? 'Pump outlet is sealed.' : 'Pump path is blocked. Open or reroute it.' });
            });
          }
        });
        value = result(state, topo, model, flows, faults);
      }
    }
    cache.set(state, { signature, value }); return value;
  };
  LSS.Flow = { feasibleCirculation: circulation, clearCache: state => cache.delete(state) };
})(typeof globalThis !== 'undefined' ? globalThis : window);
