(function (root) {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const catalog = {
    biodefenses: {
      title: 'Lyric Biodefenses', src: 'lyric_biodefenses/index.html',
      summary: 'Answer trivia, grow a B-cell culture, and defend it from contaminants.',
      rules: '<ol><li><strong>Solve trivia</strong> to earn IgG. Harder questions award higher antibody tiers; skips recharge over time.</li><li><strong>Grow your culture</strong> in the shop. B-cell components produce antibodies, and upgrades improve your defenses.</li><li><strong>Click in your bioreactor</strong> to place polymer barriers. Coatings help destroy contaminants before they reach your culture.</li><li><strong>Attack the opposing culture</strong> with contaminants from the shop. Craft IVIG for a powerful emergency clear.</li><li>Keep contamination below <strong>100%</strong>. Start a bot match for solo play, or create/join a room on the same LAN host. <kbd>P</kbd> pauses solo matches.</li></ol>'
    },
    'sterile-solver': {
      title: 'Lyric Sterile Solver', src: 'lyric_sterilesolve/index.html',
      summary: 'Build sterile flow paths, balance media mixtures, and operate five bioreactor puzzles.',
      rules: '<ol><li><strong>Drag supplies into STAGING.</strong> Drop a flask onto a media vat and enter its fill amount. Click the ethanol bottle to sterilize all equipment currently in staging.</li><li><strong>Move clean equipment into the INCUBATOR.</strong> Dirty equipment entering it immediately fails the attempt. Returning equipment to staging makes it require spraying again.</li><li><strong>Drag tubing and clamps from the rack.</strong> Spray them in staging, then drag tube ends onto output and input ports. Drop a sterile clamp onto tubing; click an installed clamp to toggle it. Crossing tubes remain separate.</li><li><strong>Set pump rates in the equipment inspector, then press GO.</strong> Rates lock during RUN. Match every reactor\'s total flow and recipe until its processed-volume goal is complete.</li><li><strong>Reuse media carefully.</strong> Every reactor passage ages each constituent; media is spent after two passages. Mixing with fresh media preserves that history.</li><li><strong>Keep the network running.</strong> Click selectors and clamps to reroute flow. Flow, mixture, starvation, blockage, spill, and overflow faults have two seconds to fix. Hiding the tab suspends until you resume.</li></ol>'
    },
    'antigen-assault': {
      title: 'Lyric Antigen Assault', src: 'lyric_galaga/index.html',
      summary: 'Pilot your antibody ship through five levels and a color-shifting antigen boss.',
      rules: '<ol><li><strong>Move</strong> with <kbd>←</kbd> / <kbd>→</kbd> / <kbd>↑</kbd> / <kbd>↓</kbd>. Vertical travel covers a band about 20% of the arena height near the bottom. Hold <kbd>Space</kbd> to fire your paired antibody blasters.</li><li><strong>Match the color</strong> of incoming antigens. <kbd>Z</kbd> cycles through unlocked antibodies. Colors unlock in order: green, blue, purple, then gold. Wrong colors do no damage.</li><li><strong>Antigen response</strong> starts enabled in the side panel. Turn it off to stop enemy shots and make waves and boss summons arrive 50% faster. Movement and collisions stay the same.</li><li><strong>Collect white orbs</strong> by shooting them with any antibody. They add to your opsonin stock.</li><li><strong>Place an opsonin:</strong> use <kbd>Z</kbd> to select white, hold <kbd>Space</kbd> to charge, and release to launch. Higher power sends it farther before it rests.</li><li><strong>Call macrophages</strong> with <kbd>X</kbd>. Every resting opsonin becomes a large clearing circle after half a second. Flying orbs stay available.</li><li><strong>Shoot rainbow IVIG</strong> as it crosses the screen. Your ship glows and sprays eight antibodies per volley, two of each color, for 30 seconds of active combat. Color matching still applies. White mode still places opsonins.</li><li>You have <strong>three lives</strong>. Clear each wave, then defeat the boss by matching its colored core. <kbd>P</kbd> / <kbd>Esc</kbd> pauses; losing focus also pauses.</li></ol>'
    }
  };
  let selected = 'biodefenses';
  let active = null;
  let routing = false;
  let pendingFresh = null;
  let requestSequence = 0;
  let exitRequest = null;
  const parentOrigin = location.protocol === 'file:' ? '*' : location.origin;
  const defenseSessionKey = 'lyric-defense.lan-session.v1';

  function defenseCredentials() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(defenseSessionKey));
      return saved && saved.origin === location.origin && /^[A-Z0-9]{6}$/.test(saved.roomCode) && typeof saved.token === 'string' ? saved : null;
    } catch (_) { return null; }
  }
  function fallbackLeave(credentials) {
    if (location.protocol === 'file:' || !credentials) return;
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 1500);
    fetch('/api/rooms/' + encodeURIComponent(credentials.roomCode) + '/leave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ token: credentials.token }), keepalive: true, signal: controller.signal
    }).catch(function () { /* Returning locally still works when the host is offline. */ }).finally(function () { clearTimeout(timer); });
  }

  function select(id) {
    if (!Object.prototype.hasOwnProperty.call(catalog, id)) return;
    selected = id;
    document.querySelectorAll('[data-game]').forEach(function (card) {
      const chosen = card.dataset.game === id;
      card.classList.toggle('selected', chosen);
      card.setAttribute('aria-pressed', String(chosen));
    });
  }
  function desiredRoute() {
    const id = location.hash.slice(1);
    return Object.prototype.hasOwnProperty.call(catalog, id) ? id : null;
  }
  function status(message) {
    $('launcher-status').textContent = message || '';
    $('launcher-status').hidden = !message;
  }
  function play(id) {
    if (id) select(id);
    if ($('instructions-dialog').open) $('instructions-dialog').close();
    pendingFresh = selected;
    if (desiredRoute() === selected) route();
    else location.hash = selected;
  }
  function returnToLibrary() {
    if (!location.hash) route();
    else location.hash = '';
  }
  async function removeActive() {
    if (!active) return;
    const previous = active;
    const credentials = previous.id === 'biodefenses' ? defenseCredentials() : null;
    let acknowledged = false;
    $('all-games').disabled = true;
    status('Returning to the game collection…');
    await new Promise(function (resolve) {
      const requestId = 'exit-' + Date.now() + '-' + (++requestSequence);
      const timer = setTimeout(function () { resolve(); }, 12000);
      exitRequest = { frame: previous.frame, requestId: requestId, resolve: function () { acknowledged = true; clearTimeout(timer); resolve(); } };
      previous.frame.contentWindow.postMessage({ type: 'lyric-games:prepare-exit', requestId: requestId }, parentOrigin);
    });
    exitRequest = null;
    if (previous.id === 'biodefenses') {
      if (!acknowledged) fallbackLeave(defenseCredentials() || credentials);
      try { sessionStorage.removeItem(defenseSessionKey); } catch (_) { /* Storage is optional. */ }
    }
    previous.frame.remove();
    active = null;
    $('all-games').disabled = false;
    status('');
  }
  function mount(id, fresh) {
    select(id);
    const frame = document.createElement('iframe');
    frame.id = 'game-frame';
    frame.title = catalog[id].title;
    if(id==='antigen-assault')frame.allow='accelerometer; gyroscope';
    frame.src = catalog[id].src + '?launcher=1' + (fresh ? '&fresh=1' : '');
    frame.addEventListener('load', function () { if (active && active.frame === frame) frame.contentWindow.focus(); });
    active = { id: id, frame: frame };
    $('library-screen').hidden = true;
    $('game-screen').hidden = false;
    $('all-games').hidden = false;
    document.body.classList.add('playing');
    document.body.classList.toggle('sterile-active', id === 'sterile-solver');
    document.body.classList.toggle('antigen-active', id === 'antigen-assault');
    document.title = catalog[id].title + ' · Lyric Games';
    $('game-mount').appendChild(frame);
  }
  async function route() {
    if (routing) return;
    routing = true;
    try {
      while (active && active.id !== desiredRoute()) await removeActive();
      const id = desiredRoute();
      if (id && !active) {
        const fresh = pendingFresh === id;
        pendingFresh = null;
        mount(id, fresh);
      } else if (!id) {
        pendingFresh = null;
        $('library-screen').hidden = false;
        $('game-screen').hidden = true;
        $('all-games').hidden = true;
        document.body.classList.remove('playing');
        document.body.classList.remove('sterile-active');
        document.body.classList.remove('antigen-active');
        document.title = 'Lyric Bio Game Selection';
        document.querySelector('[data-game="' + selected + '"]').focus({ preventScroll: true });
      }
    } finally {
      routing = false;
      if (active && active.id !== desiredRoute()) route();
    }
  }
  function showInstructions() {
    const game = catalog[selected];
    $('instructions-title').textContent = game.title;
    $('instructions-summary').textContent = game.summary;
    $('instructions-content').innerHTML = game.rules;
    $('instructions-dialog').showModal();
    $('close-instructions').focus();
  }
  document.querySelectorAll('[data-game]').forEach(function (card) { card.addEventListener('click', function () { select(card.dataset.game); }); });
  $('play-button').addEventListener('click', function () { play(); });
  $('instructions-button').addEventListener('click', showInstructions);
  $('dialog-play').addEventListener('click', function () { play(); });
  $('close-instructions').addEventListener('click', function () { $('instructions-dialog').close(); });
  $('instructions-dialog').addEventListener('close', function () { if (!active) $('instructions-button').focus({ preventScroll: true }); });
  $('instructions-dialog').addEventListener('click', function (event) {
    const box = $('instructions-dialog').getBoundingClientRect();
    if (event.target === $('instructions-dialog') && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) $('instructions-dialog').close();
  });
  $('all-games').addEventListener('click', returnToLibrary);
  root.addEventListener('hashchange', route);
  root.addEventListener('message', function (event) {
    if (active && event.source === active.frame.contentWindow && (location.protocol === 'file:' || event.origin === location.origin) && event.data && event.data.type === 'lyric-games:library') {
      returnToLibrary(); return;
    }
    if (!exitRequest || event.source !== exitRequest.frame.contentWindow || (location.protocol !== 'file:' && event.origin !== location.origin)) return;
    if (event.data && event.data.type === 'lyric-games:exit-ready' && event.data.requestId === exitRequest.requestId) exitRequest.resolve();
  });
  root.LyricGames = { catalog: catalog, select: select, play: play, returnToLibrary: returnToLibrary, get activeGame() { return active && active.id; } };
  route();
})(window);
