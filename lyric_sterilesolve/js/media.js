(function (root) {
  'use strict';
  var LSS = root.LyricSterileSolver = root.LyricSterileSolver || {};
  LSS.MediaTypes = {
    blue: { name: 'Blue medium', color: '#52b6ed', rgb: [82, 182, 237] },
    red: { name: 'Red medium', color: '#ef6c75', rgb: [239, 108, 117] }
  };
  function total(bins) { return Object.keys(bins || {}).reduce(function (sum, key) { return sum + Math.max(0, bins[key] || 0); }, 0); }
  function normalize(bins) {
    var result = {}, volume = total(bins);
    if (volume > 1e-10) Object.keys(bins).forEach(function (key) { if (bins[key] > 1e-10) result[key] = bins[key] / volume; });
    return result;
  }
  function add(target, bins, factor) {
    factor = factor === undefined ? 1 : factor;
    Object.keys(bins || {}).forEach(function (key) {
      target[key] = (target[key] || 0) + bins[key] * factor;
      if (Math.abs(target[key]) < 1e-9) delete target[key];
    });
    return target;
  }
  function composition(bins) {
    var result = {}, volume = total(bins);
    Object.keys(bins || {}).forEach(function (key) { var media = key.split(':')[0]; result[media] = (result[media] || 0) + bins[key] / (volume || 1); });
    return result;
  }
  function incrementPassages(bins) {
    var result = {};
    Object.keys(bins || {}).forEach(function (key) {
      var parts = key.split(':'), next = parts[0] + ':' + (Number(parts[1]) + 1);
      result[next] = (result[next] || 0) + bins[key];
    });
    return result;
  }
  function spentFraction(bins) {
    var volume = total(bins);
    return Object.keys(bins || {}).reduce(function (sum, key) {
      return sum + (Number(key.split(':')[1]) >= LSS.Config.maxPassages ? bins[key] : 0);
    }, 0) / (volume || 1);
  }
  function color(bins) {
    var fractions = normalize(bins), rgb = [0, 0, 0];
    Object.keys(fractions).forEach(function (key) {
      var parts = key.split(':'), def = LSS.MediaTypes[parts[0]], age = Number(parts[1]);
      if (!def) return;
      var fade = Math.min(0.8, age * 0.35), gray = 122;
      def.rgb.forEach(function (channel, i) { rgb[i] += (channel * (1 - fade) + gray * fade) * fractions[key]; });
    });
    return total(bins) ? 'rgb(' + rgb.map(Math.round).join(',') + ')' : '#263950';
  }
  LSS.Media = { total: total, normalize: normalize, add: add, composition: composition, incrementPassages: incrementPassages, spentFraction: spentFraction, color: color };
})(typeof globalThis !== 'undefined' ? globalThis : this);
