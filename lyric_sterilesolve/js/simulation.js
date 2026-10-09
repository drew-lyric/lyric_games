(function (root) {
  'use strict';
  var LSS = root.LyricSterileSolver, C = LSS.Config, M = LSS.Media;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function componentFrom(definition, placed) {
    var catalog = LSS.ComponentCatalog[definition.type], part = Object.assign({}, clone(catalog || {}), clone(definition));
    part.ports = clone(definition.ports || (catalog && catalog.ports) || []);
    part.inIncubator = !!placed; part.location = part.zone = placed ? 'incubator' : 'rack';
    part.sterile = !!placed; part.contents = clone(definition.contents || {});
    part.volume = M.total(part.contents); part.processed = 0; part.started = false; part.completed = false; part.fault = null;
    if (LSS.componentKind(part) === 'pump') part.rate = definition.rate || catalog.defaultRate;
    if (LSS.componentKind(part) === 'selector') part.selectedOutlet = 'out1';
    return part;
  }
  LSS.createSimulation = function (options) {
    options = options || {};
    var level = options.level || LSS.Levels.find(function (entry) { return entry.id === (options.levelId || 1); });
    if (!level) throw new Error('Unknown level.');
    var invalid = LSS.validateLevel(level); if (invalid.length) throw new Error(invalid.join(' '));
    var initialEthanol = finite(options.ethanol) ? Math.max(0, Math.min(C.ethanolCapacity, options.ethanol)) : C.ethanolCapacity;
    var state = {
      level: clone(level), levelId: level.id, sandbox: !!options.sandbox,
      sandboxOptions: { infiniteMedia: false, infiniteEthanol: false }, phase: 'setup', elapsed: 0,
      components: level.reactors.map(function (def) { return componentFrom(def, true); }).concat(level.supplies.map(function (def) { return componentFrom(def, false); })),
      tubes: [], looseTubes: [], clamps: [], resources: Object.assign({ red: 0, blue: 0, ethanol: initialEthanol }, clone(level.media)),
      prepared: { tubes: 0, clamps: 0 }, readyTubes: 0, readyClamps: 0,
      stats: { freshMediaConsumed: 0, mediaConsumed: 0, ethanolUsed: 0, tubingUsed: 0, tubingLength: 0, spills: 0, manualInterventions: 0 },
      events: [], message: level.subtitle, outcome: null, flow: null, revision: 0
    };
    var entrySnapshot = clone(state), runSnapshot = null, listeners = [], disposed = false, tubeSerial = 0, clampSerial = 0, componentSerial = 0, eventSerial = 0;
    function part(id) { return state.components.find(function (component) { return component.id === id; }); }
    function event(type, message, id) {
      state.message = message;
      state.events.push({ id: ++eventSerial, type: type, message: message, componentId: id || null, at: state.elapsed });
      if (state.events.length > 100) state.events.shift();
    }
    function refreshAliases() {
      state.readyTubes = state.prepared.tubes; state.readyClamps = state.prepared.clamps;
      state.components.forEach(function (component) { component.volume = M.total(component.contents); component.composition = M.composition(component.contents); });
      allTubes().forEach(syncTube);
      state.clamps.forEach(function (clamp) { if (!clamp.tubeId) return; var tube = findTube(clamp.tubeId); if (!tube) { clamp.tubeId = null; setLocation(clamp, 'staging'); clamp.sterile = false; return; } clamp.x = tube.x; clamp.y = tube.y; setLocation(clamp, tube.location); });
      state.stats.mediaConsumed = state.stats.freshMediaConsumed;
      state.stats.tubingLength = allTubes().reduce(function (sum, tube) { return sum + (tube.length || 0); }, 0);
    }
    function notify() {
      refreshAliases(); state.revision++;
      listeners.slice().forEach(function (fn) { try { fn(clone(state)); } catch (_) { /* A subscriber cannot interrupt simulation. */ } });
    }
    function reject(message) { state.message = message; notify(); return { ok: false, error: message }; }
    function fail(message, id) {
      state.phase = 'failed'; state.outcome = { kind: 'failed', message: message, componentId: id || null };
      event('failure', message, id);
    }
    function port(endpoint, direction) {
      if (!endpoint) return null;
      var component = part(endpoint.componentId);
      if (!component || !component.inIncubator) return null;
      var found = component.ports.find(function (p) { return p.id === endpoint.portId && p.direction === direction; });
      return found ? { component: component, port: found } : null;
    }
    function occupied(endpoint, ignoreTube) {
      return allTubes().some(function (tube) { return tube.id !== ignoreTube && [tube.from, tube.to].some(function (end) { return end && end.componentId === endpoint.componentId && end.portId === endpoint.portId; }); });
    }
    function endpointPosition(endpoint) {
      var component = part(endpoint.componentId), anchor = component.ports.find(function (p) { return p.id === endpoint.portId; });
      return { x: component.x + anchor.x, y: component.y + anchor.y };
    }
    function allTubes() { return state.tubes.concat(state.looseTubes); }
    function findTube(id) { return allTubes().find(function (tube) { return tube.id === id; }); }
    function setLocation(item, location) { if (item.location === 'incubator' && location === 'staging') item.sterile = false; item.location = item.zone = location; item.inIncubator = location === 'incubator'; }
    function validStagingPosition(item, x, y) {
      var width = item.width || 24, height = item.height || 24;
      return !finite(x) || !finite(y) || x < width / 2 + 4 || x > C.width - width / 2 - 4 || y < C.height + height / 2 + 4 || y > C.boardHeight - height / 2 - 4 ? 'Place the item inside the staging area.' : null;
    }
    function enterDirty(item) {
      if (state.phase === 'setup') runSnapshot = clone(state);
      fail('Unsterilized equipment contaminated the incubator.', item.id);
    }
    function tubeTip(command) {
      var tip = command.end || (typeof command.endpoint === 'string' && command.endpoint) || 'a';
      return tip === 'from' ? 'a' : tip === 'to' ? 'b' : tip;
    }
    function syncTube(tube) {
      if (!tube.connections) tube.connections = { a: tube.from ? clone(tube.from) : null, b: tube.to ? clone(tube.to) : null };
      if (!tube.ends) tube.ends = { a: { x: tube.x || 100, y: tube.y || 720 }, b: { x: (tube.x || 100) + 48, y: tube.y || 720 } };
      tube.from = null; tube.to = null;
      ['a', 'b'].forEach(function (tip) {
        var endpoint = tube.connections[tip];
        if (!endpoint) return;
        var input = port(endpoint, 'in'), output = port(endpoint, 'out');
        if (!input && !output) { tube.connections[tip] = null; return; }
        tube.ends[tip] = endpointPosition(endpoint);
        if (output) tube.from = clone(endpoint); else tube.to = clone(endpoint);
      });
      var active = !!tube.from, liveIndex = state.tubes.indexOf(tube), looseIndex = state.looseTubes.indexOf(tube);
      if (active && liveIndex < 0) { if (looseIndex >= 0) state.looseTubes.splice(looseIndex, 1); state.tubes.push(tube); }
      else if (!active && looseIndex < 0) { if (liveIndex >= 0) state.tubes.splice(liveIndex, 1); state.looseTubes.push(tube); }
      setLocation(tube, tube.ends.a.y < C.height || tube.ends.b.y < C.height ? 'incubator' : 'staging');
      tube.x = (tube.ends.a.x + tube.ends.b.x) / 2; tube.y = (tube.ends.a.y + tube.ends.b.y) / 2;
      tube.length = Math.hypot(tube.ends.a.x - tube.ends.b.x, tube.ends.a.y - tube.ends.b.y) / C.pixelsPerCentimeter;
      tube.leaking = !!tube.from && !tube.to; tube.rate = active ? tube.rate || 0 : 0;
      if (!active) tube.contents = {};
    }
    function physicalTube(command, attach) {
      var tube = findTube(command.tubeId), tip = tubeTip(command);
      if (!tube || (tip !== 'a' && tip !== 'b')) return reject('Choose a tubing end.');
      syncTube(tube);
      var attachedClamp = tube.clampId && state.clamps.find(function (item) { return item.id === tube.clampId; });
      var dirtyAssembly = !tube.sterile ? tube : attachedClamp && !attachedClamp.sterile ? attachedClamp : null;
      if (attach) {
        var endpoint = (typeof command.endpoint === 'object' && command.endpoint) || command.to;
        var input = port(endpoint, 'in'), output = port(endpoint, 'out');
        if (!input && !output) return reject('Drop the tubing end on an incubator port.');
        if (dirtyAssembly) { enterDirty(dirtyAssembly); return { ok: true }; }
        if (occupied(endpoint, tube.id)) return reject('That port already has a tube.');
        var other = tip === 'a' ? 'b' : 'a', otherEndpoint = tube.connections[other];
        if (otherEndpoint && ((input && port(otherEndpoint, 'in')) || (output && port(otherEndpoint, 'out')))) return reject('Connect one output and one input, in either order.');
        if (otherEndpoint && otherEndpoint.componentId === endpoint.componentId) return reject('Use separate components for a connection.');
        var proposed = clone(tube); proposed.connections[tip] = clone(endpoint);
        proposed.from = output ? clone(endpoint) : clone(otherEndpoint); proposed.to = input ? clone(endpoint) : clone(otherEndpoint);
        if (proposed.from && LSS.hasBufferlessCycle && LSS.hasBufferlessCycle(state, state.tubes.filter(function (entry) { return entry.id !== tube.id; }).concat(proposed))) return reject('A recirculating loop needs a flask.');
        tube.connections[tip] = clone(endpoint); syncTube(tube); event('connect', 'Sterile tubing end connected.');
      } else {
        var old = tube.ends[tip], x = command.x === undefined ? old.x : Number(command.x), y = command.y === undefined ? old.y : Number(command.y);
        if (!finite(x) || !finite(y) || x < 8 || x > C.width - 8 || y < 8 || y > C.boardHeight - 8) return reject('Keep the tubing end inside the board.');
        if (y < C.height && dirtyAssembly) { enterDirty(dirtyAssembly); return { ok: true }; }
        if (old.y < C.height && y >= C.height) tube.sterile = false;
        tube.connections[tip] = null; tube.ends[tip] = { x: x, y: y }; syncTube(tube); event('tube', 'Tubing end moved.');
      }
      return { ok: true, id: tube.id };
    }
    function validPosition(component, x, y) {
      if (!finite(x) || !finite(y)) return 'Choose a position inside the incubator.';
      if (x < component.width / 2 + 8 || x > C.width - component.width / 2 - 8 || y < component.height / 2 + 8 || y > C.height - component.height / 2 - 8) return 'Keep the component inside the incubator.';
      var overlap = state.components.some(function (other) {
        return other.id !== component.id && other.inIncubator && Math.abs(x - other.x) < (component.width + other.width) / 2 + 6 && Math.abs(y - other.y) < (component.height + other.height) / 2 + 6;
      });
      return overlap ? 'That position overlaps another component.' : null;
    }
    function spendEthanol(amount) {
      if (state.sandbox && state.sandboxOptions.infiniteEthanol) return true;
      if (state.resources.ethanol + C.epsilon < amount) return false;
      state.resources.ethanol = Math.max(0, state.resources.ethanol - amount); state.stats.ethanolUsed += amount; return true;
    }
    function flow() {
      return typeof LSS.solveFlow === 'function' ? LSS.solveFlow(state) : { rates: {}, componentRates: {}, faults: [], order: [], feasible: true };
    }
    // Tubes transport normalized cohort vectors. A flask is a finite, well-mixed buffer;
    // it also breaks composition recursion in recirculating networks.
    function transport(planned) {
      var outputs = {}, streams = {}, visiting = {}, componentFlows = {};
      function incoming(id) {
        var bins = {}, q = 0;
        state.tubes.forEach(function (tube) {
          if (tube.to && tube.to.componentId === id) {
            var stream = tubeStream(tube); q += stream.q; M.add(bins, stream.bins, stream.q);
          }
        });
        return { q: q, bins: M.normalize(bins) };
      }
      function componentOutputs(id) {
        if (outputs[id]) return outputs[id];
        if (visiting[id]) return {};
        var component = part(id); if (!component || !component.inIncubator) return {};
        visiting[id] = true;
        var outgoing = state.tubes.filter(function (tube) { return tube.from.componentId === id; }), plannedTotal = outgoing.reduce(function (sum, tube) { return sum + (planned.rates[tube.id] || 0); }, 0);
        var input = { q: 0, bins: {} }, fractions = {}, actualTotal = 0;
        if (LSS.componentKind(component) === 'flask' && component.volume > C.epsilon) {
          fractions = M.normalize(component.contents); actualTotal = plannedTotal;
        } else {
          input = incoming(id);
          if (LSS.componentKind(component) === 'flask') { actualTotal = Math.min(plannedTotal, input.q); fractions = input.bins; }
          else {
            actualTotal = plannedTotal > C.epsilon ? input.q : 0; fractions = input.bins;
            if (LSS.componentKind(component) === 'pump') actualTotal = Math.min(actualTotal, plannedTotal);
            var behavior = LSS.ComponentBehaviors[component.handler || (LSS.ComponentCatalog[component.type] || {}).handler] || {};
            if (behavior.transformMedia) fractions = behavior.transformMedia(fractions, component, state);
          }
        }
        var result = {};
        outgoing.forEach(function (tube) { result[tube.id] = { q: plannedTotal > C.epsilon ? (planned.rates[tube.id] || 0) * actualTotal / plannedTotal : 0, bins: fractions }; });
        outputs[id] = result; delete visiting[id]; return result;
      }
      function tubeStream(tube) {
        if (streams[tube.id]) return streams[tube.id];
        if (tube.clamped || !(planned.rates[tube.id] > C.epsilon)) return streams[tube.id] = { q: 0, bins: {} };
        var result = componentOutputs(tube.from.componentId)[tube.id] || { q: 0, bins: {} };
        if (!M.total(result.bins)) result = { q: 0, bins: {} };
        streams[tube.id] = result; return result;
      }
      state.tubes.forEach(tubeStream);
      state.components.filter(function (component) { return component.inIncubator; }).forEach(function (component) {
        var input = incoming(component.id), output = { q: 0, bins: {} }, inlets = {}, outlets = {};
        state.tubes.forEach(function (tube) {
          var stream = tubeStream(tube);
          if (tube.from.componentId === component.id) { output.q += stream.q; M.add(output.bins, stream.bins, stream.q); outlets[tube.from.portId] = stream.q; }
          if (tube.to && tube.to.componentId === component.id) inlets[tube.to.portId] = stream.q;
        });
        output.bins = M.normalize(output.bins);
        componentFlows[component.id] = { inRate: input.q, outRate: output.q, inBins: input.bins, outBins: output.bins, inlets: inlets, outlets: outlets };
      });
      return { streams: streams, componentFlows: componentFlows };
    }
    function diagnose(planned, transported) {
      var faults = {}, flows = transported.componentFlows;
      function put(id, code, message, portId) { if (!faults[id]) faults[id] = { componentId: id, code: code, message: message, portId: portId || null }; }
      (planned.faults || []).forEach(function (fault) { put(fault.componentId, fault.code, fault.message, fault.portId); });
      state.components.filter(function (component) { return component.inIncubator; }).forEach(function (component) {
        var actual = flows[component.id] || { inRate: 0, outRate: 0, inBins: {}, outBins: {} };
        component.actualFlow = actual;
        var behavior = LSS.ComponentBehaviors[component.handler || (LSS.ComponentCatalog[component.type] || {}).handler] || {};
        if (behavior.validateRun) { var customFault = behavior.validateRun(component, actual, state); if (customFault) put(component.id, customFault.code || 'component', customFault.message, customFault.portId); }
        if (LSS.componentKind(component) === 'pump' && (Math.abs(actual.inRate - component.rate) > C.rateTolerance || Math.abs(actual.outRate - component.rate) > C.rateTolerance)) put(component.id, 'starvation', 'Pump cannot maintain ' + component.rate + ' mL/s. Restore its source and open flow path.', 'in');
        if (LSS.componentKind(component) === 'flask' && component.volume >= component.capacity - C.epsilon && actual.inRate - actual.outRate > C.epsilon) put(component.id, 'overflow', 'Flask overflow: divert its inflow or provide more capacity.', 'in');
        if (LSS.componentKind(component) === 'reactor' && !component.completed) {
          if (actual.inRate > C.epsilon) component.started = true;
          if (component.started && Math.abs(actual.inRate - component.requiredRate) > C.rateTolerance) put(component.id, 'flow', 'Reactor requires a total ' + component.requiredRate + ' mL/s.', 'in1');
          if (actual.inRate > C.epsilon) {
            var proportions = M.composition(actual.inBins), wrongRecipe = Object.keys(LSS.MediaTypes).some(function (media) { return Math.abs((proportions[media] || 0) - (component.recipe[media] || 0)) > C.recipeTolerance; });
            if (wrongRecipe) put(component.id, 'composition', 'Wrong mixture: restore the reactor recipe.', 'in1');
            if (M.spentFraction(actual.inBins) > C.epsilon) put(component.id, 'spent', 'Spent medium cannot feed an unfinished reactor.', 'in1');
          }
        }
      });
      state.tubes.forEach(function (tube) { if (!tube.to && transported.streams[tube.id].q > C.epsilon) put(tube.from.componentId, 'spill', 'Open tubing is spilling. Clamp or reconnect it.', tube.from.portId); });
      return faults;
    }
    function preview() {
      refreshAliases(); var planned = flow(), transported = transport(planned);
      state.flow = { rates: planned.rates, actualRates: {}, componentRates: transported.componentFlows, faults: planned.faults || [], feasible: planned.feasible, order: planned.order || [] };
      state.tubes.forEach(function (tube) { var stream = transported.streams[tube.id]; tube.rate = stream.q; tube.contents = clone(stream.bins); state.flow.actualRates[tube.id] = stream.q; });
      state.components.forEach(function (component) { component.actualFlow = transported.componentFlows[component.id] || { inRate: 0, outRate: 0, inBins: {}, outBins: {}, inlets: {}, outlets: {} }; });
      return clone(state.flow);
    }
    function connect(command, existing) {
      var source = port(command.from || (existing && existing.from), 'out'), target = port(command.to, 'in');
      if (!source || !target) return reject('Connect an incubator output port to an input port.');
      if (source.component.id === target.component.id) return reject('Use separate components for a connection.');
      var from = clone(command.from || existing.from), to = clone(command.to);
      var open = state.tubes.find(function (tube) { return !tube.to && tube.from.componentId === from.componentId && tube.from.portId === from.portId; });
      if (!existing && open) existing = open;
      if (occupied(from, existing && existing.id) || occupied(to, existing && existing.id)) return reject('That port already has a tube.');
      if (!existing && state.prepared.tubes < 1) return reject('Prepare a sterile tube before connecting ports.');
      var candidate = { id: existing ? existing.id : 'tube' + (tubeSerial + 1), from: from, to: to, sterile: true, clamped: existing ? existing.clamped : false, hasClamp: existing ? existing.hasClamp : false };
      var proposed = state.tubes.filter(function (tube) { return !existing || tube.id !== existing.id; }).concat(candidate);
      if (LSS.hasBufferlessCycle && LSS.hasBufferlessCycle(state, proposed)) return reject('A recirculating loop needs a flask to hold its initial medium.');
      if (existing) state.tubes[state.tubes.indexOf(existing)] = candidate;
      else { state.prepared.tubes--; tubeSerial++; state.tubes.push(candidate); state.stats.tubingUsed++; }
      var a = endpointPosition(from), b = endpointPosition(to);
      candidate.length = Math.hypot(a.x - b.x, a.y - b.y) / C.pixelsPerCentimeter;
      state.stats.tubingLength = state.tubes.reduce(function (sum, tube) { return sum + (tube.length || 0); }, 0);
      event('connect', existing ? 'Open tube reconnected.' : 'Sterile tube connected.');
      return { ok: true, id: candidate.id };
    }
    function submit(command) {
      if (disposed) return { ok: false, error: 'This simulation has been disposed.' };
      if (!command || !command.type) return reject('Invalid command.');
      var type = command.type, component = command.id && part(command.id), result = { ok: true }, tube, amount;
      if (type === 'retry') {
        if (!runSnapshot) return reject('There is no run to retry.');
        state = clone(runSnapshot); state.phase = 'setup'; event('retry', 'Run restored to its setup snapshot.'); preview(); notify(); return result;
      }
      if (type === 'reset') {
        state = clone(entrySnapshot); runSnapshot = null; tubeSerial = 0; clampSerial = 0; componentSerial = 0; event('reset', 'Design reset to the level-entry state.'); preview(); notify(); return result;
      }
      if (type === 'suspend') { if (state.phase === 'running') { state.phase = 'suspended'; event('suspend', 'Run suspended while the game is hidden.'); } notify(); return result; }
      if (type === 'resume') { if (state.phase !== 'suspended') return reject('There is no suspended run.'); state.phase = 'running'; event('resume', 'Run resumed.'); notify(); return result; }
      if (state.phase !== 'setup' && state.phase !== 'running') return reject('Retry or reset before changing this design.');
      if (type === 'sprayStaging') {
        var dirty = state.components.concat(allTubes(), state.clamps).filter(function (item) { return item.location === 'staging' && !item.sterile; });
        if (!spendEthanol(dirty.length * C.ethanolCost)) return reject('Not enough ethanol to sterilize all staged items.');
        dirty.forEach(function (item) { item.sterile = true; }); result.count = dirty.length; result.ids = dirty.map(function (item) { return item.id; });
        event('spray', dirty.length ? 'Sterilized ' + dirty.length + ' staged item(s).' : 'All staged equipment is already sterile.');
      } else if (type === 'stage' || type === 'placeStaging' || ((type === 'place' || type === 'move') && Number(command.y) >= C.height)) {
        if (!component || (LSS.componentKind(component) === 'reactor' && !state.sandbox)) return reject('Choose a movable supply component.');
        var stagingError = validStagingPosition(component, Number(command.x), Number(command.y)); if (stagingError) return reject(stagingError);
        if (allTubes().some(function (t) { return (t.from && t.from.componentId === component.id) || (t.to && t.to.componentId === component.id); })) return reject('Detach its tubing before returning equipment to staging.');
        if (component.inIncubator) component.sterile = false;
        component.x = Number(command.x); component.y = Number(command.y); setLocation(component, 'staging'); event('stage', 'Equipment placed in staging.', component.id);
      } else if (type === 'createTube') {
        var tx = command.x === undefined ? 160 : Number(command.x), ty = command.y === undefined ? 720 : Number(command.y);
        var tubeError = validStagingPosition({ width: 64, height: 20 }, tx, ty); if (tubeError) return reject(tubeError);
        do { tubeSerial++; } while (findTube('tube' + tubeSerial));
        tube = { id: 'tube' + tubeSerial, sterile: false, clamped: false, hasClamp: false, from: null, to: null, x: tx, y: ty, ends: { a: { x: tx - 24, y: ty }, b: { x: tx + 24, y: ty } }, connections: { a: null, b: null }, rate: 0, contents: {} };
        setLocation(tube, 'staging'); state.looseTubes.push(tube); state.stats.tubingUsed++; result.id = tube.id; event('tube', 'Unsterilized tubing placed in staging.');
      } else if (type === 'attachTubeEnd' || type === 'connectOneEnd') result = physicalTube(command, true);
      else if (type === 'moveTubeEnd' || type === 'detachTubeEnd') result = physicalTube(command, false);
      else if (type === 'stageTube' || type === 'moveTube') {
        tube = findTube(command.tubeId); if (!tube) return reject('Choose a tube.');
        var sx = Number(command.x), sy = Number(command.y), error = validStagingPosition({ width: 64, height: 20 }, sx, sy); if (error) return reject(error);
        if (tube.location === 'incubator') tube.sterile = false;
        tube.connections = { a: null, b: null }; tube.ends = { a: { x: sx - 24, y: sy }, b: { x: sx + 24, y: sy } }; syncTube(tube); event('stage', 'Tubing returned to staging.');
      } else if (type === 'createClamp') {
        var cx = command.x === undefined ? 240 : Number(command.x), cy = command.y === undefined ? 720 : Number(command.y), clampError = validStagingPosition({ width: 26, height: 26 }, cx, cy); if (clampError) return reject(clampError);
        var clamp = { id: 'clamp' + (++clampSerial), type: 'clamp', x: cx, y: cy, sterile: false, tubeId: null, width: 26, height: 26 };
        setLocation(clamp, 'staging'); state.clamps.push(clamp); result.id = clamp.id; event('clamp', 'Unsterilized clamp placed in staging.');
      } else if (type === 'moveClamp') {
        var movingClamp = state.clamps.find(function (item) { return item.id === (command.clampId || command.id); }); if (!movingClamp) return reject('Choose a clamp.');
        if (movingClamp.tubeId) return reject('Detach the clamp before moving it.');
        var mx = Number(command.x), my = Number(command.y); if (!finite(mx) || !finite(my) || mx < 16 || mx > C.width - 16 || my < 16 || my > C.boardHeight - 16) return reject('Keep the clamp inside the board.');
        if (my < C.height && !movingClamp.sterile) { enterDirty(movingClamp); }
        else { if (movingClamp.location === 'incubator' && my >= C.height) movingClamp.sterile = false; movingClamp.x = mx; movingClamp.y = my; setLocation(movingClamp, my < C.height ? 'incubator' : 'staging'); event('clamp', 'Clamp moved.'); }
      } else if (type === 'installClamp') {
        var installingClamp = state.clamps.find(function (item) { return item.id === command.clampId; }); tube = findTube(command.tubeId);
        if (!installingClamp || !tube) return reject('Drop a clamp on tubing.');
        if (installingClamp.tubeId || tube.hasClamp) return reject('The clamp or tubing already has an attachment.');
        if (tube.location === 'incubator' && !installingClamp.sterile) enterDirty(installingClamp);
        else { installingClamp.tubeId = tube.id; installingClamp.x = tube.x; installingClamp.y = tube.y; setLocation(installingClamp, tube.location); tube.hasClamp = true; tube.clampId = installingClamp.id; tube.clamped = true; event('clamp', 'Clamp installed and closed.'); }
      } else if (type === 'place' || type === 'move') {
        if (!component || (LSS.componentKind(component) === 'reactor' && !state.sandbox)) return reject('Choose a movable supply component.');
        var entersIncubator = finite(command.x) && finite(command.y) && command.x >= component.width / 2 + 8 && command.x <= C.width - component.width / 2 - 8 && command.y >= component.height / 2 + 8 && command.y <= C.height - component.height / 2 - 8;
        if (!component.inIncubator && !component.sterile && entersIncubator) { enterDirty(component); notify(); return result; }
        var positionError = validPosition(component, command.x, command.y); if (positionError) return reject(positionError);
        component.x = command.x; component.y = command.y; setLocation(component, 'incubator'); event('place', 'Sterile equipment positioned.', component.id);
      } else if (type === 'remove') {
        if (!component || LSS.componentKind(component) === 'reactor') return reject('Fixed reactors cannot be returned to the rack.');
        if (allTubes().some(function (t) { return (t.from && t.from.componentId === component.id) || (t.to && t.to.componentId === component.id); })) return reject('Disconnect its tubing before returning equipment to the rack.');
        setLocation(component, 'rack'); component.sterile = false; event('remove', 'Equipment returned to the rack; sterilize again before reuse.', component.id);
      } else if (type === 'sterilize') {
        if (!component) return reject('Choose equipment to spray.');
        if (!component.sterile) {
          if (!spendEthanol(C.ethanolCost)) return reject('Not enough ethanol. Reset the design or restart this bottle batch.');
          component.sterile = true; event('spray', 'Equipment sterilized.', component.id);
        }
      } else if (type === 'fill') {
        if (!component || LSS.componentKind(component) !== 'flask') return reject('Choose a flask to fill.');
        if (component.inIncubator && !state.sandbox) return reject('Fill flasks in the preparation area before introducing them.');
        amount = Number(command.amount);
        if (!LSS.MediaTypes[command.media] || !finite(amount) || amount <= 0) return reject('Choose a positive amount of an available medium.');
        if (component.volume + amount > component.capacity + C.epsilon) return reject('That amount exceeds flask capacity.');
        if (!(state.sandbox && state.sandboxOptions.infiniteMedia) && (state.resources[command.media] || 0) + C.epsilon < amount) return reject('Insufficient medium in the supply.');
        var passage = state.sandbox ? Math.max(0, Math.min(20, Math.floor(Number(command.passage) || 0))) : 0;
        if (!(state.sandbox && state.sandboxOptions.infiniteMedia)) state.resources[command.media] -= amount;
        var key = command.media + ':' + passage; component.contents[key] = (component.contents[key] || 0) + amount;
        event('fill', 'Added ' + amount + ' mL ' + command.media + ' medium.', component.id);
      } else if (type === 'setPumpRate') {
        if (state.phase !== 'setup') return reject('Pump rates are locked during RUN.');
        if (!component || LSS.componentKind(component) !== 'pump') return reject('Choose a pump.');
        var rate = Number(command.rate), def = LSS.ComponentCatalog[component.type] || LSS.ComponentCatalog.pump;
        if (!finite(rate) || rate < def.rateMin || rate > def.rateMax || Math.abs(rate / def.rateStep - Math.round(rate / def.rateStep)) > 1e-7) return reject('Pump rate must be ' + def.rateMin + '–' + def.rateMax + ' mL/s in ' + def.rateStep + ' increments.');
        component.rate = rate; event('rate', 'Pump set to ' + rate + ' mL/s.', component.id);
      } else if (type === 'prepareTube' || type === 'prepareClamp') {
        amount = command.count === undefined ? 1 : Number(command.count);
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) return reject('Prepare between 1 and 100 items.');
        if (!spendEthanol(C.ethanolCost * amount)) return reject('Not enough ethanol to prepare those items.');
        state.prepared[type === 'prepareTube' ? 'tubes' : 'clamps'] += amount; event('spray', 'Prepared ' + amount + ' sterile ' + (type === 'prepareTube' ? 'tube(s).' : 'clamp(s).'));
      } else if (type === 'connect') result = connect(command);
      else if (type === 'reconnect') {
        tube = state.tubes.find(function (t) { return t.id === command.tubeId; });
        if (!tube || tube.to) return reject('Choose an open-ended tube.');
        result = connect(command, tube);
      } else if (type === 'disconnect') {
        tube = state.tubes.find(function (t) { return t.id === command.tubeId; }); if (!tube) return reject('Choose a tube.');
        if (state.phase === 'running' && (tube.rate || 0) > C.epsilon && tube.to) { Object.keys(tube.connections || {}).forEach(function (tip) { var end = tube.connections[tip]; if (end && port(end, 'in')) tube.connections[tip] = null; }); tube.to = null; tube.leaking = true; event('disconnect', 'Tube detached: clamp or reconnect the spilling end.'); }
        else { state.tubes.splice(state.tubes.indexOf(tube), 1); event('disconnect', 'Tube removed.'); }
      } else if (type === 'clamp') {
        tube = findTube(command.tubeId); if (!tube) return reject('Choose a tube.');
        if (!tube.hasClamp) { if (state.prepared.clamps < 1) return reject('Prepare a sterile clamp first.'); state.prepared.clamps--; tube.hasClamp = true; }
        tube.clamped = command.closed === undefined ? !tube.clamped : !!command.closed; event('clamp', tube.clamped ? 'Tube clamped.' : 'Clamp opened.');
      } else if (type === 'setSelector') {
        if (!component || LSS.componentKind(component) !== 'selector') return reject('Choose a selector valve.');
        var outs = component.ports.filter(function (p) { return p.direction === 'out'; }), selected = typeof command.outlet === 'number' ? (outs[command.outlet] && outs[command.outlet].id) : command.outlet;
        if (!outs.some(function (p) { return p.id === selected; })) return reject('Choose a selector outlet.');
        component.selectedOutlet = selected; event('selector', 'Selector switched to ' + selected + '.', component.id);
      } else if (type === 'go') {
        if (state.phase !== 'setup') return reject('The run has already started.');
        if (!state.components.some(function (p) { return LSS.componentKind(p) === 'pump' && p.inIncubator; })) return reject('Place at least one pump before GO.');
        runSnapshot = clone(state); state.phase = 'running'; state.elapsed = 0; event('go', 'Pumps running. Keep every active reactor on recipe.');
      } else if (type === 'grantComponent') {
        if (!state.sandbox) return reject('Equipment grants are available in sandbox only.');
        var definition = Object.assign({}, command.definition || {}, { type: command.componentType || (command.definition && command.definition.type) || 'flask' });
        if (!LSS.ComponentCatalog[definition.type]) return reject('Unknown component type.');
        do { definition.id = 'extra' + (++componentSerial); } while (part(definition.id));
        definition.x = 100; definition.y = 100;
        if (LSS.componentKind(definition) === 'flask') definition.capacity = Number(command.capacity || definition.capacity) || 250;
        if (LSS.componentKind(definition) === 'reactor') Object.assign(definition, { requiredRate: 5, requiredVolume: 100, recipe: { blue: 1 }, ports: LSS.makePorts(2, 2) });
        var grantValidation = LSS.validateLevel({ id: 99, title: 'Sandbox grant', reactors: state.level.reactors, supplies: [definition], media: {} });
        if (grantValidation.length) return reject(grantValidation.join(' '));
        component = componentFrom(definition, false); state.components.push(component); event('grant', 'Equipment added to the rack.', component.id); result.id = component.id;
      } else if (type === 'grantMedia') {
        if (!state.sandbox || !LSS.MediaTypes[command.media] || !finite(Number(command.amount)) || Number(command.amount) < 0) return reject('Choose a sandbox medium and nonnegative amount.');
        state.resources[command.media] = (state.resources[command.media] || 0) + Number(command.amount); event('grant', 'Sandbox media added.');
      } else if (type === 'setEthanol') {
        if (!state.sandbox || !finite(Number(command.amount))) return reject('Ethanol controls are available in sandbox only.');
        state.resources.ethanol = Math.max(0, Math.min(C.ethanolCapacity, Number(command.amount))); event('grant', 'Sandbox ethanol updated.');
      } else if (type === 'setSandboxOptions') {
        if (!state.sandbox) return reject('Sandbox controls are unavailable in campaign.');
        ['infiniteMedia', 'infiniteEthanol'].forEach(function (key) { if (command[key] !== undefined) state.sandboxOptions[key] = !!command[key]; });
      } else if (type === 'configureReactor') {
        if (!state.sandbox || !component || LSS.componentKind(component) !== 'reactor' || state.phase !== 'setup') return reject('Edit sandbox reactor requirements during setup.');
        var replacement = clone(component);
        ['requiredRate', 'requiredVolume', 'recipe'].forEach(function (key) { if (command[key] !== undefined) replacement[key] = clone(command[key]); });
        var validation = LSS.validateLevel({ id: 99, title: 'Sandbox', reactors: [replacement], supplies: [], media: {} });
        if (validation.length) return reject(validation.join(' '));
        Object.assign(component, replacement); event('configure', 'Sandbox reactor requirements updated.', component.id);
      } else return reject('Unknown command: ' + type);
      if (!result.ok) return result;
      if (state.phase === 'running' && type !== 'go') state.stats.manualInterventions++;
      refreshAliases(); preview(); notify(); return result;
    }
    function step(dt) {
      if (disposed || state.phase !== 'running' || !finite(dt) || dt <= 0) return;
      var remaining = Math.min(dt, 5), iterations = 0;
      while (remaining > 1e-9 && state.phase === 'running' && iterations++ < 400) {
        refreshAliases(); var planned = flow(), transported = transport(planned), faults = diagnose(planned, transported);
        state.components.forEach(function (component) {
          var fault = faults[component.id];
          if (fault) component.fault = Object.assign({}, fault, { elapsed: component.fault ? component.fault.elapsed : 0, remaining: C.faultGrace - (component.fault ? component.fault.elapsed : 0) });
          else component.fault = null;
        });
        var h = Math.min(remaining, C.step);
        state.components.filter(function (component) { return component.inIncubator; }).forEach(function (component) {
          var actual = transported.componentFlows[component.id];
          if (component.fault) h = Math.min(h, Math.max(0, C.faultGrace - component.fault.elapsed));
          if (LSS.componentKind(component) === 'reactor' && component.started && !component.completed && !component.fault && actual.inRate > C.epsilon) h = Math.min(h, Math.max(0, (component.requiredVolume - component.processed) / actual.inRate));
          if (LSS.componentKind(component) === 'flask') {
            var net = actual.inRate - actual.outRate;
            if (net > C.epsilon && component.volume < component.capacity - C.epsilon) h = Math.min(h, (component.capacity - component.volume) / net);
            Object.keys(component.contents).forEach(function (key) {
              var derivative = actual.inRate * (actual.inBins[key] || 0) - actual.outRate * (actual.outBins[key] || 0);
              if (derivative < -C.epsilon && component.contents[key] > C.epsilon) h = Math.min(h, component.contents[key] / -derivative);
            });
          }
        });
        if (h < 1e-9) {
          var expired = state.components.find(function (component) { return component.fault && component.fault.elapsed >= C.faultGrace - 1e-8; });
          if (expired) { fail(expired.fault.message, expired.id); break; }
          h = Math.min(remaining, 1e-7);
        }
        var freshUsed = 0;
        state.components.filter(function (component) { return component.inIncubator; }).forEach(function (component) {
          var actual = transported.componentFlows[component.id];
          if (LSS.componentKind(component) === 'flask') {
            M.add(component.contents, actual.inBins, actual.inRate * h); M.add(component.contents, actual.outBins, -actual.outRate * h);
            Object.keys(component.contents).forEach(function (key) { if (component.contents[key] < 1e-8) delete component.contents[key]; });
            var volume = M.total(component.contents);
            if (volume > component.capacity) {
              var spilled = volume - component.capacity, fraction = spilled / volume; state.stats.spills += spilled;
              Object.keys(component.contents).forEach(function (key) { var lost = component.contents[key] * fraction; if (Number(key.split(':')[1]) === 0) freshUsed += lost; component.contents[key] -= lost; });
            }
          }
          if (LSS.componentKind(component) === 'reactor') {
            Object.keys(actual.inBins).forEach(function (key) { if (Number(key.split(':')[1]) === 0) freshUsed += actual.inRate * actual.inBins[key] * h; });
            if (component.started && !component.completed && !component.fault) {
              component.processed = Math.min(component.requiredVolume, component.processed + actual.inRate * h);
              if (component.processed >= component.requiredVolume - 1e-7) { component.processed = component.requiredVolume; component.completed = true; event('complete', 'Reactor ' + component.id.toUpperCase() + ' completed.', component.id); }
            }
          }
          var behavior = LSS.ComponentBehaviors[component.handler || (LSS.ComponentCatalog[component.type] || {}).handler] || {};
          if (behavior.integrate) behavior.integrate(component, actual, h, state);
          if (component.fault) { component.fault.elapsed += h; component.fault.remaining = Math.max(0, C.faultGrace - component.fault.elapsed); }
        });
        state.tubes.forEach(function (tube) {
          var stream = transported.streams[tube.id]; tube.rate = stream.q; tube.contents = clone(stream.bins);
          if (!tube.to) { state.stats.spills += stream.q * h; Object.keys(stream.bins).forEach(function (key) { if (Number(key.split(':')[1]) === 0) freshUsed += stream.q * stream.bins[key] * h; }); }
        });
        state.stats.freshMediaConsumed += freshUsed; state.elapsed += h; remaining -= h;
        var fatal = state.components.find(function (component) { return component.fault && component.fault.elapsed >= C.faultGrace - 1e-8; });
        if (fatal) fail(fatal.fault.message, fatal.id);
        else if (state.components.filter(function (component) { return LSS.componentKind(component) === 'reactor' && component.inIncubator; }).every(function (component) { return component.completed; })) {
          state.phase = 'won'; state.outcome = { kind: 'won', message: 'All reactors processed successfully.' }; event('victory', state.outcome.message);
        }
      }
      preview(); notify();
    }
    preview(); refreshAliases();
    return {
      submit: submit, step: step, preview: preview,
      getState: function () { return clone(state); },
      subscribe: function (fn) { if (typeof fn !== 'function' || disposed) return function () {}; listeners.push(fn); return function () { listeners = listeners.filter(function (listener) { return listener !== fn; }); }; },
      dispose: function () { disposed = true; listeners = []; }
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
