(function (root) {
  'use strict';
  var LSS = root.LyricSterileSolver;
  function reactor(id, x, y, volume, rate, recipe, inputs, outputs) {
    return { id: id, type: 'reactor', x: x, y: y, requiredVolume: volume, requiredRate: rate, recipe: recipe, ports: LSS.makePorts(inputs, outputs) };
  }
  function part(id, type, values) { return Object.assign({ id: id, type: type, x: 80, y: 100 }, values || {}); }
  LSS.Levels = [
    { id: 1, title: 'First Perfusion', subtitle: 'Prepare a sterile source → pump → reactor → sink network.',
      tutorial: ['Select a flask in the rack and fill it with 200 mL blue medium.', 'Spray each part before dragging it into the incubator. Prepare one sterile tube for each connection.', 'Connect source OUT → pump IN → reactor IN → sink IN. Set the pump to 5 mL/s, then press GO.'],
      media: { blue: 250, red: 0 },
      reactors: [reactor('r1', 550, 320, 200, 5, { blue: 1 }, 1, 1)],
      supplies: [part('p1', 'pump', { rate: 5 }), part('f1', 'flask', { capacity: 250 }), part('f2', 'flask', { capacity: 250 })]
    },
    { id: 2, title: 'Simultaneous Blend', subtitle: 'The combined stream matters; no inlet has a prescribed medium.',
      tutorial: ['Supply exactly 50% blue and 50% red at a total 10 mL/s.', 'Use separate 5 mL/s feeds, or premix both media in one flask and pump at 10.', 'Unused ports stay sealed. An extra pump left in the rack does not run.'],
      media: { blue: 50, red: 50 },
      reactors: [reactor('r1', 550, 320, 100, 10, { blue: 0.5, red: 0.5 }, 3, 1)],
      supplies: [part('p1', 'pump', { rate: 5 }), part('p2', 'pump', { rate: 5 }), part('f1', 'flask', { capacity: 150 }), part('f2', 'flask', { capacity: 150 }), part('f3', 'flask', { capacity: 150 })]
    },
    { id: 3, title: 'Unequal Branches', subtitle: 'Reuse effluent and force a 4 + 2 split with downstream pumps.',
      tutorial: ['Pump 6 mL/s into A. Its outputs have identical blue composition.', 'Draw 4 mL/s through B and 2 mL/s through C with the remaining pumps.', 'Fresh medium may pass through two reactors. After its second passage it is spent.'],
      media: { blue: 120, red: 0 },
      reactors: [reactor('r1', 390, 315, 120, 6, { blue: 1 }, 1, 2), reactor('r2', 730, 175, 80, 4, { blue: 1 }, 1, 1), reactor('r3', 730, 465, 40, 2, { blue: 1 }, 1, 1)],
      supplies: [part('p1', 'pump', { rate: 6 }), part('p2', 'pump', { rate: 4 }), part('p3', 'pump', { rate: 2 }), part('f1', 'flask', { capacity: 150 }), part('f2', 'flask', { capacity: 100 }), part('f3', 'flask', { capacity: 50 })]
    },
    { id: 4, title: 'Live Diversion', subtitle: 'Keep the run alive by switching sinks before they overflow.',
      tutorial: ['Connect the reactor output to a selector, then connect each selector outlet to a 60 mL sink.', 'The reactor processes 100 mL in 20 seconds. Neither sink can hold it all.', 'Switch the selector between seconds 8 and 12. Pumps cannot be paused during RUN.'],
      media: { blue: 100, red: 0 },
      reactors: [reactor('r1', 470, 315, 100, 5, { blue: 1 }, 1, 1)],
      supplies: [part('p1', 'pump', { rate: 5 }), part('v1', 'selector'), part('f1', 'flask', { capacity: 150 }), part('f2', 'flask', { capacity: 60 }), part('f3', 'flask', { capacity: 60 })]
    },
    { id: 5, title: 'Mixed Reuse', subtitle: 'Build three simultaneous mixtures from two fresh supplies.',
      tutorial: ['A needs 50% red, B needs 25% red, and C needs 75% red. Each needs 10 mL/s.', 'Feed A at 5 red + 5 blue. Send its equal 5 mL/s outputs to B and C.', 'Add 5 fresh blue to B and 5 fresh red to C. Split each fresh source between two pumps.', 'Mixtures retain the passage history of every constituent. Spent portions cannot feed another unfinished reactor.'],
      media: { blue: 200, red: 200 },
      reactors: [reactor('r1', 450, 315, 200, 10, { red: 0.5, blue: 0.5 }, 2, 2), reactor('r2', 710, 165, 200, 10, { red: 0.25, blue: 0.75 }, 2, 1), reactor('r3', 710, 470, 200, 10, { red: 0.75, blue: 0.25 }, 2, 1)],
      supplies: [part('p1', 'pump', { rate: 5 }), part('p2', 'pump', { rate: 5 }), part('p3', 'pump', { rate: 5 }), part('p4', 'pump', { rate: 5 }), part('s1', 'splitter'), part('s2', 'splitter'), part('f1', 'flask', { capacity: 250 }), part('f2', 'flask', { capacity: 250 }), part('f3', 'flask', { capacity: 250 }), part('f4', 'flask', { capacity: 250 })]
    }
  ];
  LSS.validateLevel = function (level) {
    var errors = [], ids = {};
    if (!level || !Number.isInteger(level.id) || level.id < 1 || !level.title) return ['Level needs a positive integer ID and title.'];
    (level.reactors || []).forEach(function (part) { if (LSS.componentKind(part) !== 'reactor') errors.push('Fixed reactor entries must use a reactor behavior: ' + part.id); });
    (level.reactors || []).concat(level.supplies || []).forEach(function (part) {
      if (!part.id || ids[part.id]) errors.push('Missing or duplicate component ID: ' + part.id);
      ids[part.id] = true;
      if (!LSS.ComponentCatalog[part.type]) errors.push('Unknown component type: ' + part.type);
      if (LSS.componentKind(part) === 'flask' && (!Number.isFinite(part.capacity) || !(part.capacity > 0))) errors.push('Flask capacity must be positive: ' + part.id);
      if (LSS.componentKind(part) === 'pump' && part.rate !== undefined) {
        var pump = LSS.ComponentCatalog[part.type];
        if (!Number.isFinite(part.rate) || part.rate < pump.rateMin || part.rate > pump.rateMax || Math.abs(part.rate / pump.rateStep - Math.round(part.rate / pump.rateStep)) > 1e-7) errors.push('Invalid pump rate: ' + part.id);
      }
      if (LSS.componentKind(part) === 'reactor') {
        if (!Number.isFinite(part.requiredRate) || !Number.isFinite(part.requiredVolume) || !(part.requiredRate > 0) || !(part.requiredVolume > 0)) errors.push('Reactor rate and throughput must be positive: ' + part.id);
        var sum = 0;
        Object.keys(part.recipe || {}).forEach(function (key) { if (!LSS.MediaTypes[key] || part.recipe[key] < 0) errors.push('Invalid recipe: ' + part.id); sum += part.recipe[key]; });
        if (Math.abs(sum - 1) > 1e-7) errors.push('Recipe must sum to one: ' + part.id);
        var ports = {}, directions = { in: 0, out: 0 };
        (part.ports || []).forEach(function (port) { if (!port.id || ports[port.id] || !Object.prototype.hasOwnProperty.call(directions, port.direction)) errors.push('Invalid port: ' + part.id); ports[port.id] = true; directions[port.direction]++; });
        if (!directions.in || !directions.out) errors.push('Reactor needs inlet and outlet ports: ' + part.id);
      }
    });
    if (!(level.reactors || []).length) errors.push('Level needs at least one reactor.');
    Object.keys(level.media || {}).forEach(function (key) { if (!LSS.MediaTypes[key] || !Number.isFinite(level.media[key]) || level.media[key] < 0) errors.push('Invalid media inventory: ' + key); });
    return errors;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
