(function (root) {
  'use strict';
  var LSS = root.LyricSterileSolver = root.LyricSterileSolver || {};
  LSS.Config = {
    width: 960, height: 640, stagingHeight: 160, boardHeight: 800, step: 1 / 30, faultGrace: 2,
    ethanolCost: 2, ethanolCapacity: 100, batchSize: 3,
    maxPassages: 2, rateTolerance: 0.01, recipeTolerance: 0.001,
    epsilon: 1e-7, pixelsPerCentimeter: 10,
    storageKey: 'lyric-sterile-solver-v1'
  };
  LSS.ComponentCatalog = {
    pump: {
      name: 'Peristaltic pump', spriteKey: 'pump', handler: 'pump', width: 66, height: 58,
      rateMin: 0.5, rateMax: 20, rateStep: 0.5, defaultRate: 5,
      ports: [{ id: 'in', direction: 'in', x: -38, y: 0 }, { id: 'out', direction: 'out', x: 38, y: 0 }]
    },
    flask: {
      name: 'Media flask', spriteKey: 'flask', handler: 'flask', width: 64, height: 82,
      ports: [{ id: 'in', direction: 'in', x: -36, y: -12 }, { id: 'out', direction: 'out', x: 36, y: 12 }]
    },
    splitter: {
      name: 'Two-way splitter', spriteKey: 'splitter', handler: 'junction', width: 48, height: 52,
      ports: [{ id: 'in', direction: 'in', x: -30, y: 0 }, { id: 'out1', direction: 'out', x: 30, y: -18 }, { id: 'out2', direction: 'out', x: 30, y: 18 }]
    },
    selector: {
      name: 'Three-way selector', spriteKey: 'selector', handler: 'selector', width: 56, height: 56,
      ports: [{ id: 'in', direction: 'in', x: -34, y: 0 }, { id: 'out1', direction: 'out', x: 34, y: -20 }, { id: 'out2', direction: 'out', x: 34, y: 20 }]
    },
    reactor: { name: 'Bioreactor', spriteKey: 'reactor', handler: 'reactor', width: 112, height: 112 }
  };
  // New mechanics can register a named behavior with one of the conserved flow
  // categories and optional transformMedia / validateRun / integrate hooks.
  LSS.ComponentBehaviors = {
    pump: { category: 'pump' }, flask: { category: 'flask' },
    junction: { category: 'junction' }, selector: { category: 'selector' },
    reactor: { category: 'reactor', transformMedia: function (bins) { return LSS.Media.incrementPassages(bins); } }
  };
  LSS.componentKind = function (component) {
    var catalog = LSS.ComponentCatalog[component.type] || {}, handler = component.handler || catalog.handler || component.type;
    return (LSS.ComponentBehaviors[handler] || {}).category || handler;
  };
  LSS.makePorts = function (inputs, outputs) {
    var ports = [];
    for (var i = 0; i < inputs; i++) ports.push({ id: 'in' + (i + 1), direction: 'in', x: -62, y: (i - (inputs - 1) / 2) * 25 });
    for (var j = 0; j < outputs; j++) ports.push({ id: 'out' + (j + 1), direction: 'out', x: 62, y: (j - (outputs - 1) / 2) * 30 });
    return ports;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
